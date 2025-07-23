/**
 * Advanced AI Manager
 * Comprehensive AI/ML integration with multiple providers, intelligent routing, and model management
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { z } from 'zod';

export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'azure' | 'huggingface' | 'local';
  baseUrl: string;
  apiKey?: string;
  models: AIModel[];
  limits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    maxTokens: number;
  };
  status: 'active' | 'inactive' | 'rate_limited' | 'error';
  priority: number;
  costPerToken: {
    input: number;
    output: number;
  };
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  type: 'text' | 'chat' | 'completion' | 'embedding' | 'image' | 'audio' | 'multimodal';
  capabilities: string[];
  contextWindow: number;
  maxTokens: number;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  inputModalities: string[];
  outputModalities: string[];
  metadata: {
    description: string;
    version: string;
    trainingCutoff?: string;
    languages: string[];
  };
}

export interface AIRequest {
  id: string;
  type: 'completion' | 'chat' | 'embedding' | 'image_generation' | 'audio_transcription' | 'function_call';
  model: string;
  provider?: string;
  input: {
    prompt?: string;
    messages?: ChatMessage[];
    functions?: AIFunction[];
    data?: any;
  };
  options: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stream?: boolean;
    seed?: number;
  };
  metadata: {
    userId?: string;
    sessionId?: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    timeout: number;
    retries: number;
    cacheable: boolean;
    tags: string[];
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | any[];
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
}

export interface AIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export interface AIResponse {
  id: string;
  requestId: string;
  provider: string;
  model: string;
  type: string;
  output: {
    text?: string;
    messages?: ChatMessage[];
    embeddings?: number[];
    functionCall?: {
      name: string;
      arguments: any;
    };
    data?: any;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
  metadata: {
    finishReason: string;
    responseTime: number;
    cached: boolean;
    model: string;
    timestamp: Date;
  };
}

export interface ModelRouter {
  rules: RoutingRule[];
  fallbackProvider?: string;
  loadBalancing: 'round-robin' | 'cost-optimized' | 'latency-optimized' | 'quality-optimized';
}

export interface RoutingRule {
  id: string;
  condition: {
    modelType?: string;
    provider?: string;
    priority?: string;
    userTier?: string;
    inputSize?: { min?: number; max?: number };
  };
  target: {
    provider: string;
    model: string;
    weight?: number;
  };
  enabled: boolean;
}

/**
 * Advanced AI Manager for intelligent model routing and management
 */
export class AdvancedAIManager {
  private providers: Map<string, AIProvider> = new Map();
  private models: Map<string, AIModel> = new Map();
  private requests: Map<string, AIRequest> = new Map();
  private responses: Map<string, AIResponse> = new Map();
  private router: ModelRouter;
  private cache: Map<string, { response: AIResponse; expires: Date }> = new Map();
  private rateLimiters: Map<string, { requests: number; tokens: number; resetTime: Date }> = new Map();

  constructor() {
    this.router = {
      rules: [],
      loadBalancing: 'cost-optimized',
    };

    this.setupValidationSchemas();
    this.registerProviders();
    this.setupRoutingRules();
    this.startProviderMonitoring();
    this.startCacheCleanup();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const aiRequestSchema = z.object({
      type: z.enum(['completion', 'chat', 'embedding', 'image_generation', 'audio_transcription', 'function_call']),
      model: z.string(),
      provider: z.string().optional(),
      input: z.object({
        prompt: z.string().optional(),
        messages: z.array(z.object({
          role: z.string(),
          content: z.union([z.string(), z.array(z.any())]),
          name: z.string().optional(),
        })).optional(),
        functions: z.array(z.any()).optional(),
        data: z.any().optional(),
      }),
      options: z.object({
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).optional(),
        topP: z.number().min(0).max(1).optional(),
        stream: z.boolean().optional(),
      }),
      metadata: z.object({
        userId: z.string().optional(),
        sessionId: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high', 'critical']),
        timeout: z.number(),
        retries: z.number(),
        cacheable: z.boolean(),
        tags: z.array(z.string()),
      }),
    });

    validationService.registerSchema('aiRequest', aiRequestSchema);
  }

  /**
   * Register AI provider
   */
  registerProvider(provider: Omit<AIProvider, 'id'>): string {
    const id = stringUtils.random(8);
    const aiProvider: AIProvider = { id, ...provider };
    
    this.providers.set(id, aiProvider);

    // Register models from this provider
    provider.models.forEach(model => {
      this.models.set(`${id}:${model.id}`, { ...model, provider: id });
    });

    logger.info('AI provider registered', {
      providerId: id,
      name: provider.name,
      type: provider.type,
      modelsCount: provider.models.length,
    });

    monitoring.recordMetric({
      name: 'ai.provider.registered',
      value: 1,
      tags: {
        provider: provider.name,
        type: provider.type,
      },
    });

    return id;
  }

  /**
   * Make AI request with intelligent routing
   */
  async request(request: Omit<AIRequest, 'id'>): Promise<AIResponse> {
    const requestId = stringUtils.random(12);
    const aiRequest: AIRequest = { id: requestId, ...request };
    
    this.requests.set(requestId, aiRequest);

    const spanId = monitoring.startTrace(`ai.request.${request.type}`);
    const startTime = Date.now();

    try {
      // Check cache if cacheable
      if (request.metadata.cacheable) {
        const cachedResponse = await this.getCachedResponse(aiRequest);
        if (cachedResponse) {
          monitoring.finishSpan(spanId, {
            success: true,
            cached: true,
            requestId,
            model: request.model,
          });

          monitoring.recordMetric({
            name: 'ai.request.cache_hit',
            value: 1,
            tags: {
              model: request.model,
              type: request.type,
            },
          });

          return cachedResponse;
        }
      }

      // Route request to appropriate provider
      const { provider, model } = await this.routeRequest(aiRequest);

      // Check rate limits
      await this.checkRateLimit(provider);

      // Make the actual request
      const response = await this.makeProviderRequest(provider, model, aiRequest);

      // Cache response if cacheable
      if (request.metadata.cacheable && response.metadata.finishReason === 'stop') {
        await this.cacheResponse(aiRequest, response);
      }

      // Update provider metrics
      this.updateProviderMetrics(provider, response, Date.now() - startTime);

      monitoring.finishSpan(spanId, {
        success: true,
        cached: false,
        requestId,
        provider: provider.name,
        model: model.name,
        tokens: response.usage.totalTokens,
        cost: response.usage.cost,
      });

      return response;

    } catch (error) {
      monitoring.finishSpan(spanId, {
        success: false,
        requestId,
        error: String(error),
      });

      monitoring.recordMetric({
        name: 'ai.request.error',
        value: 1,
        tags: {
          model: request.model,
          type: request.type,
          error: 'request_failed',
        },
      });

      logger.error('AI request failed', {
        requestId,
        model: request.model,
        type: request.type,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Route request to appropriate provider and model
   */
  private async routeRequest(request: AIRequest): Promise<{ provider: AIProvider; model: AIModel }> {
    // Find applicable routing rules
    const applicableRules = this.router.rules.filter(rule => {
      if (!rule.enabled) return false;
      if (rule.condition.modelType && rule.condition.modelType !== request.type) return false;
      if (rule.condition.provider && rule.condition.provider !== request.provider) return false;
      if (rule.condition.priority && rule.condition.priority !== request.metadata.priority) return false;
      
      if (rule.condition.inputSize) {
        const inputLength = this.calculateInputSize(request);
        if (rule.condition.inputSize.min && inputLength < rule.condition.inputSize.min) return false;
        if (rule.condition.inputSize.max && inputLength > rule.condition.inputSize.max) return false;
      }
      
      return true;
    });

    if (applicableRules.length > 0) {
      // Apply load balancing among applicable rules
      const selectedRule = this.selectRuleByLoadBalancing(applicableRules);
      const provider = this.providers.get(selectedRule.target.provider);
      const model = this.models.get(`${selectedRule.target.provider}:${selectedRule.target.model}`);
      
      if (provider && model) {
        return { provider, model };
      }
    }

    // Fallback to default routing
    return this.getDefaultProviderAndModel(request);
  }

  /**
   * Calculate input size for routing decisions
   */
  private calculateInputSize(request: AIRequest): number {
    let size = 0;
    
    if (request.input.prompt) {
      size += request.input.prompt.length;
    }
    
    if (request.input.messages) {
      size += request.input.messages.reduce((sum, msg) => {
        return sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length);
      }, 0);
    }
    
    return size;
  }

  /**
   * Select rule based on load balancing strategy
   */
  private selectRuleByLoadBalancing(rules: RoutingRule[]): RoutingRule {
    switch (this.router.loadBalancing) {
      case 'cost-optimized':
        return this.selectCostOptimizedRule(rules);
      case 'latency-optimized':
        return this.selectLatencyOptimizedRule(rules);
      case 'quality-optimized':
        return this.selectQualityOptimizedRule(rules);
      default:
        return rules[Math.floor(Math.random() * rules.length)];
    }
  }

  /**
   * Select cost-optimized rule
   */
  private selectCostOptimizedRule(rules: RoutingRule[]): RoutingRule {
    return rules.reduce((cheapest, current) => {
      const currentProvider = this.providers.get(current.target.provider);
      const cheapestProvider = this.providers.get(cheapest.target.provider);
      
      if (!currentProvider || !cheapestProvider) return cheapest;
      
      const currentCost = currentProvider.costPerToken.input + currentProvider.costPerToken.output;
      const cheapestCost = cheapestProvider.costPerToken.input + cheapestProvider.costPerToken.output;
      
      return currentCost < cheapestCost ? current : cheapest;
    });
  }

  /**
   * Select latency-optimized rule
   */
  private selectLatencyOptimizedRule(rules: RoutingRule[]): RoutingRule {
    // For now, prefer local providers
    const localRule = rules.find(rule => {
      const provider = this.providers.get(rule.target.provider);
      return provider?.type === 'local';
    });
    
    return localRule || rules[0];
  }

  /**
   * Select quality-optimized rule
   */
  private selectQualityOptimizedRule(rules: RoutingRule[]): RoutingRule {
    // Prefer OpenAI and Anthropic for quality
    const qualityRule = rules.find(rule => {
      const provider = this.providers.get(rule.target.provider);
      return provider?.type === 'openai' || provider?.type === 'anthropic';
    });
    
    return qualityRule || rules[0];
  }

  /**
   * Get default provider and model
   */
  private getDefaultProviderAndModel(request: AIRequest): { provider: AIProvider; model: AIModel } {
    // Find available providers
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.status === 'active')
      .sort((a, b) => a.priority - b.priority);

    if (availableProviders.length === 0) {
      throw new Error('No available AI providers');
    }

    const provider = availableProviders[0];
    
    // Find compatible model
    const compatibleModel = provider.models.find(model => {
      if (request.model && model.name !== request.model) return false;
      return model.type === request.type || model.type === 'multimodal';
    });

    if (!compatibleModel) {
      throw new Error(`No compatible model found for request type: ${request.type}`);
    }

    const model = this.models.get(`${provider.id}:${compatibleModel.id}`);
    if (!model) {
      throw new Error(`Model not found: ${compatibleModel.id}`);
    }

    return { provider, model };
  }

  /**
   * Check rate limits for provider
   */
  private async checkRateLimit(provider: AIProvider): Promise<void> {
    const now = new Date();
    const rateLimiter = this.rateLimiters.get(provider.id);

    if (!rateLimiter || now > rateLimiter.resetTime) {
      this.rateLimiters.set(provider.id, {
        requests: 1,
        tokens: 0,
        resetTime: new Date(now.getTime() + 60000), // 1 minute
      });
      return;
    }

    if (rateLimiter.requests >= provider.limits.requestsPerMinute) {
      provider.status = 'rate_limited';
      throw new Error(`Rate limit exceeded for provider: ${provider.name}`);
    }

    rateLimiter.requests++;
  }

  /**
   * Make request to AI provider
   */
  private async makeProviderRequest(
    provider: AIProvider,
    model: AIModel,
    request: AIRequest
  ): Promise<AIResponse> {
    const requestPayload = this.buildProviderPayload(provider, model, request);
    const startTime = Date.now();

    try {
      const response = await httpClient.post(
        `${provider.baseUrl}/chat/completions`,
        requestPayload,
        {
          headers: {
            'Authorization': provider.apiKey ? `Bearer ${provider.apiKey}` : undefined,
            'Content-Type': 'application/json',
          },
          timeout: request.metadata.timeout,
        }
      );

      const aiResponse = this.parseProviderResponse(provider, model, request, response.data, Date.now() - startTime);
      this.responses.set(aiResponse.id, aiResponse);
      
      return aiResponse;

    } catch (error) {
      provider.status = 'error';
      throw new Error(`Provider request failed: ${String(error)}`);
    }
  }

  /**
   * Build provider-specific payload
   */
  private buildProviderPayload(provider: AIProvider, model: AIModel, request: AIRequest): any {
    const basePayload = {
      model: model.name,
      temperature: request.options.temperature || 0.7,
      max_tokens: request.options.maxTokens || model.maxTokens,
      top_p: request.options.topP,
      frequency_penalty: request.options.frequencyPenalty,
      presence_penalty: request.options.presencePenalty,
      stream: request.options.stream || false,
    };

    switch (request.type) {
      case 'chat':
        return {
          ...basePayload,
          messages: request.input.messages,
          functions: request.input.functions,
        };
      
      case 'completion':
        return {
          ...basePayload,
          prompt: request.input.prompt,
        };
      
      case 'embedding':
        return {
          model: model.name,
          input: request.input.prompt || request.input.data,
        };
      
      default:
        return basePayload;
    }
  }

  /**
   * Parse provider response
   */
  private parseProviderResponse(
    provider: AIProvider,
    model: AIModel,
    request: AIRequest,
    responseData: any,
    responseTime: number
  ): AIResponse {
    const usage = responseData.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    const cost = this.calculateCost(provider, usage);

    let output: AIResponse['output'] = {};

    switch (request.type) {
      case 'chat':
      case 'completion':
        output = {
          text: responseData.choices?.[0]?.message?.content || responseData.choices?.[0]?.text,
          messages: responseData.choices?.[0]?.message ? [responseData.choices[0].message] : undefined,
          functionCall: responseData.choices?.[0]?.message?.function_call,
        };
        break;
      
      case 'embedding':
        output = {
          embeddings: responseData.data?.[0]?.embedding,
        };
        break;
      
      default:
        output = { data: responseData };
    }

    return {
      id: stringUtils.random(12),
      requestId: request.id,
      provider: provider.name,
      model: model.name,
      type: request.type,
      output,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        cost,
      },
      metadata: {
        finishReason: responseData.choices?.[0]?.finish_reason || 'stop',
        responseTime,
        cached: false,
        model: model.name,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Calculate cost for request
   */
  private calculateCost(provider: AIProvider, usage: any): number {
    const inputCost = usage.prompt_tokens * provider.costPerToken.input;
    const outputCost = usage.completion_tokens * provider.costPerToken.output;
    return inputCost + outputCost;
  }

  /**
   * Cache response
   */
  private async cacheResponse(request: AIRequest, response: AIResponse): Promise<void> {
    const cacheKey = objectUtils.hash({
      type: request.type,
      model: request.model,
      input: request.input,
      options: request.options,
    });

    const expires = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours
    this.cache.set(cacheKey, { response, expires });

    monitoring.recordMetric({
      name: 'ai.cache.set',
      value: 1,
      tags: {
        model: request.model,
        type: request.type,
      },
    });
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(request: AIRequest): Promise<AIResponse | null> {
    const cacheKey = objectUtils.hash({
      type: request.type,
      model: request.model,
      input: request.input,
      options: request.options,
    });

    const cached = this.cache.get(cacheKey);
    if (!cached || new Date() > cached.expires) {
      if (cached) {
        this.cache.delete(cacheKey);
      }
      return null;
    }

    // Create new response with cached data
    const cachedResponse: AIResponse = {
      ...cached.response,
      id: stringUtils.random(12),
      requestId: request.id,
      metadata: {
        ...cached.response.metadata,
        cached: true,
        timestamp: new Date(),
      },
    };

    return cachedResponse;
  }

  /**
   * Update provider metrics
   */
  private updateProviderMetrics(provider: AIProvider, response: AIResponse, responseTime: number): void {
    const rateLimiter = this.rateLimiters.get(provider.id);
    if (rateLimiter) {
      rateLimiter.tokens += response.usage.totalTokens;
    }

    monitoring.recordMetric({
      name: 'ai.provider.request',
      value: 1,
      tags: {
        provider: provider.name,
        model: response.model,
        type: response.type,
      },
    });

    monitoring.recordMetric({
      name: 'ai.provider.tokens',
      value: response.usage.totalTokens,
      tags: {
        provider: provider.name,
        model: response.model,
        type: 'total',
      },
    });

    monitoring.recordMetric({
      name: 'ai.provider.cost',
      value: response.usage.cost,
      tags: {
        provider: provider.name,
        model: response.model,
      },
    });

    monitoring.recordMetric({
      name: 'ai.provider.latency',
      value: responseTime,
      tags: {
        provider: provider.name,
        model: response.model,
      },
      unit: 'ms',
    });
  }

  /**
   * Register default providers
   */
  private registerProviders(): void {
    // OpenAI Provider
    this.registerProvider({
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      models: [
        {
          id: 'gpt-4',
          name: 'gpt-4',
          provider: '',
          type: 'chat',
          capabilities: ['chat', 'function_calling', 'code_generation'],
          contextWindow: 8192,
          maxTokens: 4096,
          supportsFunctions: true,
          supportsStreaming: true,
          inputModalities: ['text'],
          outputModalities: ['text'],
          metadata: {
            description: 'Most capable GPT-4 model',
            version: '0613',
            trainingCutoff: '2023-04',
            languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
          },
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'gpt-3.5-turbo',
          provider: '',
          type: 'chat',
          capabilities: ['chat', 'function_calling'],
          contextWindow: 4096,
          maxTokens: 4096,
          supportsFunctions: true,
          supportsStreaming: true,
          inputModalities: ['text'],
          outputModalities: ['text'],
          metadata: {
            description: 'Fast and efficient GPT-3.5 model',
            version: '0613',
            trainingCutoff: '2021-09',
            languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
          },
        },
        {
          id: 'text-embedding-3-small',
          name: 'text-embedding-3-small',
          provider: '',
          type: 'embedding',
          capabilities: ['text_embedding'],
          contextWindow: 8192,
          maxTokens: 8192,
          supportsFunctions: false,
          supportsStreaming: false,
          inputModalities: ['text'],
          outputModalities: ['embedding'],
          metadata: {
            description: 'High-performance text embedding model',
            version: '1',
            languages: ['en', 'multilingual'],
          },
        },
      ],
      limits: {
        requestsPerMinute: 3500,
        tokensPerMinute: 90000,
        maxTokens: 4096,
      },
      status: 'active',
      priority: 1,
      costPerToken: {
        input: 0.00003,
        output: 0.00006,
      },
    });

    // Anthropic Provider (Claude)
    this.registerProvider({
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: [
        {
          id: 'claude-3-sonnet',
          name: 'claude-3-sonnet-20240229',
          provider: '',
          type: 'chat',
          capabilities: ['chat', 'analysis', 'reasoning'],
          contextWindow: 200000,
          maxTokens: 4096,
          supportsFunctions: false,
          supportsStreaming: true,
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          metadata: {
            description: 'Balanced performance and speed',
            version: '3.0',
            trainingCutoff: '2024-02',
            languages: ['en', 'multilingual'],
          },
        },
      ],
      limits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 80000,
        maxTokens: 4096,
      },
      status: 'active',
      priority: 2,
      costPerToken: {
        input: 0.000015,
        output: 0.000075,
      },
    });

    logger.info('Default AI providers registered');
  }

  /**
   * Setup routing rules
   */
  private setupRoutingRules(): void {
    // High priority requests to GPT-4
    this.router.rules.push({
      id: 'high-priority-gpt4',
      condition: {
        priority: 'high',
        modelType: 'chat',
      },
      target: {
        provider: Array.from(this.providers.values()).find(p => p.name === 'OpenAI')?.id || '',
        model: 'gpt-4',
        weight: 1,
      },
      enabled: true,
    });

    // Cost-optimized routing for normal priority
    this.router.rules.push({
      id: 'normal-priority-cost',
      condition: {
        priority: 'normal',
        modelType: 'chat',
      },
      target: {
        provider: Array.from(this.providers.values()).find(p => p.name === 'OpenAI')?.id || '',
        model: 'gpt-3.5-turbo',
        weight: 1,
      },
      enabled: true,
    });

    // Embedding requests to dedicated model
    this.router.rules.push({
      id: 'embedding-routing',
      condition: {
        modelType: 'embedding',
      },
      target: {
        provider: Array.from(this.providers.values()).find(p => p.name === 'OpenAI')?.id || '',
        model: 'text-embedding-3-small',
        weight: 1,
      },
      enabled: true,
    });

    logger.info('AI routing rules configured');
  }

  /**
   * Start provider monitoring
   */
  private startProviderMonitoring(): void {
    setInterval(async () => {
      for (const provider of this.providers.values()) {
        try {
          // Simple health check
          if (provider.status === 'rate_limited') {
            const rateLimiter = this.rateLimiters.get(provider.id);
            if (rateLimiter && new Date() > rateLimiter.resetTime) {
              provider.status = 'active';
            }
          }

          monitoring.recordMetric({
            name: 'ai.provider.status',
            value: provider.status === 'active' ? 1 : 0,
            tags: {
              provider: provider.name,
              status: provider.status,
            },
          });

        } catch (error) {
          provider.status = 'error';
          logger.error('Provider health check failed', {
            provider: provider.name,
            error: String(error),
          });
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Start cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [key, cached] of this.cache.entries()) {
        if (now > cached.expires) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('AI cache cleaned', { cleaned });
        
        monitoring.recordMetric({
          name: 'ai.cache.cleaned',
          value: cleaned,
          tags: {},
        });
      }

      monitoring.recordMetric({
        name: 'ai.cache.size',
        value: this.cache.size,
        tags: {},
      });

    }, 300000); // Every 5 minutes
  }

  /**
   * Get AI statistics
   */
  getAIStatistics(): {
    providers: number;
    models: number;
    activeProviders: number;
    totalRequests: number;
    totalResponses: number;
    cacheSize: number;
    routingRules: number;
    totalCost: number;
    totalTokens: number;
  } {
    const activeProviders = Array.from(this.providers.values()).filter(p => p.status === 'active');
    const totalCost = Array.from(this.responses.values()).reduce((sum, r) => sum + r.usage.cost, 0);
    const totalTokens = Array.from(this.responses.values()).reduce((sum, r) => sum + r.usage.totalTokens, 0);

    return {
      providers: this.providers.size,
      models: this.models.size,
      activeProviders: activeProviders.length,
      totalRequests: this.requests.size,
      totalResponses: this.responses.size,
      cacheSize: this.cache.size,
      routingRules: this.router.rules.length,
      totalCost,
      totalTokens,
    };
  }

  /**
   * Get provider details
   */
  getProvider(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get model details
   */
  getModel(modelId: string): AIModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get available models by type
   */
  getModelsByType(type: string): AIModel[] {
    return Array.from(this.models.values()).filter(model => 
      model.type === type || model.type === 'multimodal'
    );
  }
}

// Export singleton instance
export const advancedAI = new AdvancedAIManager();

// Export types
export type { 
  AIProvider, 
  AIModel, 
  AIRequest, 
  AIResponse, 
  ChatMessage, 
  AIFunction,
  ModelRouter,
  RoutingRule 
};