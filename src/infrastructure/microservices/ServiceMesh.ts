/**
 * Service Mesh Implementation
 * Advanced service-to-service communication with traffic management, security, and observability
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { serviceRegistry, type ServiceDefinition } from './ServiceRegistry.js';
import { messageBroker } from './MessageBroker.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { z } from 'zod';

export interface ServiceMeshConfig {
  enabled: boolean;
  mtls: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    caPath?: string;
  };
  routing: {
    loadBalancing: 'round-robin' | 'least-connections' | 'weighted' | 'random';
    retries: {
      attempts: number;
      backoff: 'exponential' | 'linear';
      timeout: number;
    };
    circuitBreaker: {
      enabled: boolean;
      threshold: number;
      timeout: number;
      halfOpenRequests: number;
    };
  };
  security: {
    authz: boolean;
    rbac: boolean;
    networkPolicies: boolean;
  };
  observability: {
    metrics: boolean;
    tracing: boolean;
    logging: boolean;
  };
}

export interface TrafficRule {
  id: string;
  name: string;
  source: {
    service?: string;
    version?: string;
    labels?: Record<string, string>;
  };
  destination: {
    service: string;
    subset?: string;
  };
  match: {
    headers?: Record<string, string>;
    uri?: {
      exact?: string;
      prefix?: string;
      regex?: string;
    };
    method?: string[];
  };
  route: {
    destination: string;
    weight?: number;
    subset?: string;
  }[];
  fault?: {
    delay?: {
      percentage: number;
      fixedDelay: number;
    };
    abort?: {
      percentage: number;
      httpStatus: number;
    };
  };
  timeout?: number;
  retries?: {
    attempts: number;
    perTryTimeout: number;
  };
}

export interface SecurityPolicy {
  id: string;
  name: string;
  namespace: string;
  selector: {
    matchLabels: Record<string, string>;
  };
  rules: {
    from?: {
      source: {
        principals?: string[];
        requestPrincipals?: string[];
        namespaces?: string[];
      };
    }[];
    to?: {
      operation: {
        methods?: string[];
        paths?: string[];
      };
    }[];
  }[];
  action: 'ALLOW' | 'DENY';
}

export interface ServiceProxy {
  serviceId: string;
  upstreamUrl: string;
  downstreamUrl: string;
  middleware: ProxyMiddleware[];
  metrics: {
    requestCount: number;
    errorCount: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
}

export interface ProxyMiddleware {
  name: string;
  order: number;
  config: any;
  handler: (request: any, response: any, next: () => void) => Promise<void>;
}

/**
 * Service mesh for microservices communication
 */
export class ServiceMesh {
  private config: ServiceMeshConfig;
  private trafficRules: Map<string, TrafficRule> = new Map();
  private securityPolicies: Map<string, SecurityPolicy> = new Map();
  private proxies: Map<string, ServiceProxy> = new Map();
  private middleware: Map<string, ProxyMiddleware> = new Map();
  private rateLimiters: Map<string, { requests: number; resetTime: number }> = new Map();

  constructor(config?: Partial<ServiceMeshConfig>) {
    this.config = {
      enabled: true,
      mtls: {
        enabled: false,
      },
      routing: {
        loadBalancing: 'round-robin',
        retries: {
          attempts: 3,
          backoff: 'exponential',
          timeout: 30000,
        },
        circuitBreaker: {
          enabled: true,
          threshold: 5,
          timeout: 60000,
          halfOpenRequests: 3,
        },
      },
      security: {
        authz: true,
        rbac: true,
        networkPolicies: true,
      },
      observability: {
        metrics: true,
        tracing: true,
        logging: true,
      },
      ...config,
    };

    this.setupValidationSchemas();
    this.registerDefaultMiddleware();
    this.registerDefaultPolicies();
    this.startMetricsCollection();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const trafficRuleSchema = z.object({
      name: z.string().min(1),
      source: z.object({
        service: z.string().optional(),
        version: z.string().optional(),
        labels: z.record(z.string()).optional(),
      }),
      destination: z.object({
        service: z.string(),
        subset: z.string().optional(),
      }),
      match: z.object({
        headers: z.record(z.string()).optional(),
        uri: z.object({
          exact: z.string().optional(),
          prefix: z.string().optional(),
          regex: z.string().optional(),
        }).optional(),
        method: z.array(z.string()).optional(),
      }),
      route: z.array(z.object({
        destination: z.string(),
        weight: z.number().optional(),
        subset: z.string().optional(),
      })),
    });

    validationService.registerSchema('trafficRule', trafficRuleSchema);
  }

  /**
   * Register traffic rule
   */
  registerTrafficRule(rule: Omit<TrafficRule, 'id'>): string {
    const id = stringUtils.random(8);
    this.trafficRules.set(id, { id, ...rule });

    logger.info('Traffic rule registered', {
      ruleId: id,
      name: rule.name,
      destination: rule.destination.service,
    });

    monitoring.recordMetric({
      name: 'servicemesh.traffic_rule.registered',
      value: 1,
      tags: {
        rule: rule.name,
        destination: rule.destination.service,
      },
    });

    return id;
  }

  /**
   * Register security policy
   */
  registerSecurityPolicy(policy: Omit<SecurityPolicy, 'id'>): string {
    const id = stringUtils.random(8);
    this.securityPolicies.set(id, { id, ...policy });

    logger.info('Security policy registered', {
      policyId: id,
      name: policy.name,
      namespace: policy.namespace,
      action: policy.action,
    });

    monitoring.recordMetric({
      name: 'servicemesh.security_policy.registered',
      value: 1,
      tags: {
        policy: policy.name,
        namespace: policy.namespace,
        action: policy.action,
      },
    });

    return id;
  }

  /**
   * Create service proxy
   */
  createServiceProxy(serviceId: string): ServiceProxy {
    const service = serviceRegistry.getService(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    const proxy: ServiceProxy = {
      serviceId,
      upstreamUrl: `${service.network.protocol}://${service.network.host}:${service.network.port}`,
      downstreamUrl: `http://localhost:${service.network.port + 1000}`, // Proxy port
      middleware: this.getServiceMiddleware(service),
      metrics: {
        requestCount: 0,
        errorCount: 0,
        avgLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
      },
    };

    this.proxies.set(serviceId, proxy);

    logger.info('Service proxy created', {
      serviceId,
      upstreamUrl: proxy.upstreamUrl,
      downstreamUrl: proxy.downstreamUrl,
      middleware: proxy.middleware.length,
    });

    return proxy;
  }

  /**
   * Get service middleware chain
   */
  private getServiceMiddleware(service: ServiceDefinition): ProxyMiddleware[] {
    const middleware: ProxyMiddleware[] = [];

    // Add authentication middleware
    if (service.security.authRequired) {
      middleware.push(this.middleware.get('auth')!);
    }

    // Add rate limiting middleware
    middleware.push(this.middleware.get('rateLimit')!);

    // Add circuit breaker middleware
    if (this.config.routing.circuitBreaker.enabled) {
      middleware.push(this.middleware.get('circuitBreaker')!);
    }

    // Add metrics middleware
    if (this.config.observability.metrics) {
      middleware.push(this.middleware.get('metrics')!);
    }

    // Add tracing middleware
    if (this.config.observability.tracing) {
      middleware.push(this.middleware.get('tracing')!);
    }

    // Add logging middleware
    if (this.config.observability.logging) {
      middleware.push(this.middleware.get('logging')!);
    }

    return middleware.sort((a, b) => a.order - b.order);
  }

  /**
   * Route request through service mesh
   */
  async routeRequest(
    sourceService: string,
    targetService: string,
    request: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body?: any;
    }
  ): Promise<any> {
    const spanId = monitoring.startTrace(`servicemesh.route.${targetService}`);
    const startTime = Date.now();

    try {
      // Find applicable traffic rules
      const applicableRules = this.findApplicableTrafficRules(sourceService, targetService, request);

      // Apply security policies
      await this.enforceSecurityPolicies(sourceService, targetService, request);

      // Select destination based on traffic rules
      const destination = await this.selectDestination(targetService, applicableRules);

      // Get proxy for target service
      const proxy = this.proxies.get(destination.serviceId);
      if (!proxy) {
        throw new Error(`No proxy found for service: ${destination.serviceId}`);
      }

      // Apply middleware chain
      const processedRequest = await this.applyMiddleware(proxy, request);

      // Make the actual request
      const response = await this.makeProxiedRequest(proxy, processedRequest);

      // Update metrics
      const duration = Date.now() - startTime;
      this.updateProxyMetrics(proxy, duration, false);

      monitoring.finishSpan(spanId, {
        success: true,
        sourceService,
        targetService,
        duration,
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      const proxy = this.proxies.get(targetService);
      if (proxy) {
        this.updateProxyMetrics(proxy, duration, true);
      }

      monitoring.finishSpan(spanId, {
        success: false,
        sourceService,
        targetService,
        duration,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Find applicable traffic rules
   */
  private findApplicableTrafficRules(
    sourceService: string,
    targetService: string,
    request: any
  ): TrafficRule[] {
    const applicableRules: TrafficRule[] = [];

    for (const rule of this.trafficRules.values()) {
      // Check destination match
      if (rule.destination.service !== targetService) continue;

      // Check source match
      if (rule.source.service && rule.source.service !== sourceService) continue;

      // Check request match
      if (rule.match.method && !rule.match.method.includes(request.method)) continue;

      if (rule.match.uri) {
        const uriMatch = rule.match.uri;
        let pathMatches = false;

        if (uriMatch.exact && request.path === uriMatch.exact) pathMatches = true;
        if (uriMatch.prefix && request.path.startsWith(uriMatch.prefix)) pathMatches = true;
        if (uriMatch.regex && new RegExp(uriMatch.regex).test(request.path)) pathMatches = true;

        if (!pathMatches) continue;
      }

      // Check headers match
      if (rule.match.headers) {
        const headersMatch = Object.entries(rule.match.headers).every(([key, value]) =>
          request.headers[key] === value
        );
        if (!headersMatch) continue;
      }

      applicableRules.push(rule);
    }

    return applicableRules;
  }

  /**
   * Enforce security policies
   */
  private async enforceSecurityPolicies(
    sourceService: string,
    targetService: string,
    request: any
  ): Promise<void> {
    for (const policy of this.securityPolicies.values()) {
      // Simple policy enforcement - would be more sophisticated in production
      if (policy.action === 'DENY') {
        // Check if policy applies to this request
        const applies = policy.rules.some(rule => {
          if (rule.from) {
            return rule.from.some(from => 
              from.source.principals?.includes(sourceService) ||
              from.source.namespaces?.includes('default')
            );
          }
          return false;
        });

        if (applies) {
          throw new Error(`Request denied by security policy: ${policy.name}`);
        }
      }
    }
  }

  /**
   * Select destination based on traffic rules
   */
  private async selectDestination(
    targetService: string,
    trafficRules: TrafficRule[]
  ): Promise<{ serviceId: string; subset?: string }> {
    // If no traffic rules, use default routing
    if (trafficRules.length === 0) {
      const services = serviceRegistry.discoverServices({ name: targetService });
      if (services.length === 0) {
        throw new Error(`No services found for: ${targetService}`);
      }
      return { serviceId: services[0].id };
    }

    // Apply weighted routing based on traffic rules
    const routeWeights = trafficRules.flatMap(rule => rule.route);
    const totalWeight = routeWeights.reduce((sum, route) => sum + (route.weight || 1), 0);
    
    let random = Math.random() * totalWeight;
    for (const route of routeWeights) {
      random -= route.weight || 1;
      if (random <= 0) {
        const services = serviceRegistry.discoverServices({ name: route.destination });
        if (services.length > 0) {
          return { serviceId: services[0].id, subset: route.subset };
        }
      }
    }

    // Fallback to first available service
    const services = serviceRegistry.discoverServices({ name: targetService });
    if (services.length === 0) {
      throw new Error(`No services found for: ${targetService}`);
    }
    return { serviceId: services[0].id };
  }

  /**
   * Apply middleware chain
   */
  private async applyMiddleware(proxy: ServiceProxy, request: any): Promise<any> {
    let processedRequest = request;

    for (const middleware of proxy.middleware) {
      try {
        await new Promise<void>((resolve, reject) => {
          middleware.handler(processedRequest, null, () => resolve()).catch(reject);
        });
      } catch (error) {
        logger.error('Middleware error', {
          middleware: middleware.name,
          serviceId: proxy.serviceId,
          error: String(error),
        });
        throw error;
      }
    }

    return processedRequest;
  }

  /**
   * Make proxied request
   */
  private async makeProxiedRequest(proxy: ServiceProxy, request: any): Promise<any> {
    const url = `${proxy.upstreamUrl}${request.path}`;
    
    const response = await httpClient.request(url, {
      method: request.method,
      headers: request.headers,
      data: request.body,
      timeout: this.config.routing.retries.timeout,
    });

    return response;
  }

  /**
   * Update proxy metrics
   */
  private updateProxyMetrics(proxy: ServiceProxy, duration: number, isError: boolean): void {
    proxy.metrics.requestCount++;
    
    if (isError) {
      proxy.metrics.errorCount++;
    }

    // Update latency (simple moving average)
    proxy.metrics.avgLatency = (proxy.metrics.avgLatency + duration) / 2;

    // Simple percentile calculation - would use proper histogram in production
    proxy.metrics.p95Latency = Math.max(proxy.metrics.p95Latency, duration * 0.95);
    proxy.metrics.p99Latency = Math.max(proxy.metrics.p99Latency, duration * 0.99);
  }

  /**
   * Register default middleware
   */
  private registerDefaultMiddleware(): void {
    // Authentication middleware
    this.middleware.set('auth', {
      name: 'authentication',
      order: 1,
      config: {},
      handler: async (request, response, next) => {
        // Simple auth check - would integrate with actual auth system
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('Authentication required');
        }
        next();
      },
    });

    // Rate limiting middleware
    this.middleware.set('rateLimit', {
      name: 'rateLimit',
      order: 2,
      config: { requests: 100, window: 60000 },
      handler: async (request, response, next) => {
        const clientId = request.headers['x-client-id'] || 'anonymous';
        const key = `${clientId}:rateLimit`;
        const now = Date.now();
        
        const limiter = this.rateLimiters.get(key);
        if (!limiter || now > limiter.resetTime) {
          this.rateLimiters.set(key, { requests: 1, resetTime: now + 60000 });
        } else {
          limiter.requests++;
          if (limiter.requests > 100) {
            throw new Error('Rate limit exceeded');
          }
        }
        
        next();
      },
    });

    // Circuit breaker middleware
    this.middleware.set('circuitBreaker', {
      name: 'circuitBreaker',
      order: 3,
      config: this.config.routing.circuitBreaker,
      handler: async (request, response, next) => {
        // Circuit breaker logic would go here
        next();
      },
    });

    // Metrics middleware
    this.middleware.set('metrics', {
      name: 'metrics',
      order: 4,
      config: {},
      handler: async (request, response, next) => {
        const startTime = Date.now();
        
        try {
          next();
          
          monitoring.recordMetric({
            name: 'servicemesh.request.success',
            value: 1,
            tags: {
              method: request.method,
              path: request.path,
            },
          });
          
        } catch (error) {
          monitoring.recordMetric({
            name: 'servicemesh.request.error',
            value: 1,
            tags: {
              method: request.method,
              path: request.path,
              error: 'middleware_error',
            },
          });
          throw error;
        } finally {
          const duration = Date.now() - startTime;
          monitoring.recordMetric({
            name: 'servicemesh.request.duration',
            value: duration,
            tags: {
              method: request.method,
              path: request.path,
            },
            unit: 'ms',
          });
        }
      },
    });

    // Tracing middleware
    this.middleware.set('tracing', {
      name: 'tracing',
      order: 5,
      config: {},
      handler: async (request, response, next) => {
        const traceId = request.headers['x-trace-id'] || stringUtils.random(16);
        request.headers['x-trace-id'] = traceId;
        
        const spanId = monitoring.startTrace(`servicemesh.request`, traceId);
        
        try {
          next();
          monitoring.finishSpan(spanId, { success: true });
        } catch (error) {
          monitoring.finishSpan(spanId, { success: false, error: String(error) });
          throw error;
        }
      },
    });

    // Logging middleware
    this.middleware.set('logging', {
      name: 'logging',
      order: 6,
      config: {},
      handler: async (request, response, next) => {
        logger.info('Service mesh request', {
          method: request.method,
          path: request.path,
          headers: Object.keys(request.headers),
          timestamp: new Date().toISOString(),
        });
        
        next();
      },
    });

    logger.info('Default middleware registered');
  }

  /**
   * Register default security policies
   */
  private registerDefaultPolicies(): void {
    // Allow internal service communication
    this.registerSecurityPolicy({
      name: 'allow-internal',
      namespace: 'default',
      selector: {
        matchLabels: { app: 'internal' },
      },
      rules: [{
        from: [{
          source: {
            namespaces: ['default'],
          },
        }],
      }],
      action: 'ALLOW',
    });

    // Deny external access to admin endpoints
    this.registerSecurityPolicy({
      name: 'deny-admin-external',
      namespace: 'default',
      selector: {
        matchLabels: { type: 'admin' },
      },
      rules: [{
        to: [{
          operation: {
            paths: ['/admin/*'],
          },
        }],
      }],
      action: 'DENY',
    });

    logger.info('Default security policies registered');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Collect proxy metrics
      for (const [serviceId, proxy] of this.proxies.entries()) {
        monitoring.recordMetric({
          name: 'servicemesh.proxy.requests',
          value: proxy.metrics.requestCount,
          tags: { serviceId },
        });

        monitoring.recordMetric({
          name: 'servicemesh.proxy.errors',
          value: proxy.metrics.errorCount,
          tags: { serviceId },
        });

        monitoring.recordMetric({
          name: 'servicemesh.proxy.latency.avg',
          value: proxy.metrics.avgLatency,
          tags: { serviceId },
          unit: 'ms',
        });

        monitoring.recordMetric({
          name: 'servicemesh.proxy.latency.p95',
          value: proxy.metrics.p95Latency,
          tags: { serviceId },
          unit: 'ms',
        });
      }

      // Collect mesh statistics
      monitoring.recordMetric({
        name: 'servicemesh.traffic_rules',
        value: this.trafficRules.size,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'servicemesh.security_policies',
        value: this.securityPolicies.size,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'servicemesh.proxies',
        value: this.proxies.size,
        tags: {},
      });

    }, 30000); // Every 30 seconds
  }

  /**
   * Get service mesh statistics
   */
  getServiceMeshStatistics(): {
    enabled: boolean;
    trafficRules: number;
    securityPolicies: number;
    proxies: number;
    middleware: number;
    totalRequests: number;
    totalErrors: number;
    avgLatency: number;
  } {
    const proxies = Array.from(this.proxies.values());
    const totalRequests = proxies.reduce((sum, proxy) => sum + proxy.metrics.requestCount, 0);
    const totalErrors = proxies.reduce((sum, proxy) => sum + proxy.metrics.errorCount, 0);
    const avgLatency = proxies.length > 0 
      ? proxies.reduce((sum, proxy) => sum + proxy.metrics.avgLatency, 0) / proxies.length
      : 0;

    return {
      enabled: this.config.enabled,
      trafficRules: this.trafficRules.size,
      securityPolicies: this.securityPolicies.size,
      proxies: this.proxies.size,
      middleware: this.middleware.size,
      totalRequests,
      totalErrors,
      avgLatency,
    };
  }

  /**
   * Get traffic rule
   */
  getTrafficRule(ruleId: string): TrafficRule | undefined {
    return this.trafficRules.get(ruleId);
  }

  /**
   * Get security policy
   */
  getSecurityPolicy(policyId: string): SecurityPolicy | undefined {
    return this.securityPolicies.get(policyId);
  }

  /**
   * Get service proxy
   */
  getServiceProxy(serviceId: string): ServiceProxy | undefined {
    return this.proxies.get(serviceId);
  }
}

// Export singleton instance
export const serviceMesh = new ServiceMesh();

// Export types
export type { 
  ServiceMeshConfig, 
  TrafficRule, 
  SecurityPolicy, 
  ServiceProxy, 
  ProxyMiddleware 
};