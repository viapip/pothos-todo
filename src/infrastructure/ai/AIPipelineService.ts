import { OpenAI } from 'openai';
import { logger } from '@/logger.js';
import type { PrismaClient } from '@prisma/client';
import { EmbeddingService } from './EmbeddingService.js';
import { MLPredictionService } from './MLPredictionService.js';
import { RAGService } from './RAGService.js';
import { AIInsightService } from './AIInsightService.js';
import { NLPService } from './NLPService.js';
import { VectorStore } from './VectorStore.js';

export interface AIPipelineConfig {
  openaiApiKey?: string;
  enableEmbeddings: boolean;
  enablePredictions: boolean;
  enableRAG: boolean;
  enableInsights: boolean;
  enableNLP: boolean;
}

export interface TodoAnalysisResult {
  predictions: {
    completionTime?: any;
    prioritySuggestion?: any;
    complexityAnalysis?: any;
  };
  insights: {
    semanticSimilarity: any[];
    relatedTasks: any[];
    autoTags: string[];
  };
  recommendations: {
    nextActions: any;
    optimizations: string[];
    scheduling: any;
  };
}

export interface UserProductivityReport {
  summary: {
    completionRate: number;
    averageTasksPerDay: number;
    productivityTrend: 'improving' | 'stable' | 'declining';
  };
  insights: any[];
  patterns: any;
  recommendations: any[];
  burnoutRisk: any;
}

/**
 * AI Pipeline Service - Orchestrates all AI services
 * 
 * This service coordinates between all AI services to provide
 * comprehensive intelligent features for the todo application.
 */
export class AIPipelineService {
  private static instance: AIPipelineService;
  private config: AIPipelineConfig;
  
  // AI Services
  private embeddingService: EmbeddingService;
  private mlService: MLPredictionService;
  private ragService: RAGService;
  private insightService: AIInsightService;
  private nlpService: NLPService;

  private constructor(private prisma: PrismaClient) {
    this.embeddingService = EmbeddingService.getInstance(prisma);
    this.mlService = MLPredictionService.getInstance(prisma);
    this.ragService = RAGService.getInstance(prisma, VectorStore.getInstance());
    this.insightService = AIInsightService.getInstance(prisma);
    this.nlpService = NLPService.getInstance();
    
    this.config = {
      enableEmbeddings: true,
      enablePredictions: true,
      enableRAG: true,
      enableInsights: true,
      enableNLP: true,
    };
  }

  static getInstance(prisma: PrismaClient): AIPipelineService {
    if (!AIPipelineService.instance) {
      AIPipelineService.instance = new AIPipelineService(prisma);
    }
    return AIPipelineService.instance;
  }

  /**
   * Initialize all AI services
   */
  async initialize(config: Partial<AIPipelineConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    if (config.openaiApiKey) {
      // Initialize services that require OpenAI
      if (this.config.enableEmbeddings) {
        this.embeddingService.initialize(config.openaiApiKey);
      }
      
      if (this.config.enablePredictions) {
        this.mlService.initialize(config.openaiApiKey);
      }
      
      if (this.config.enableRAG) {
        this.ragService.initialize(config.openaiApiKey);
        await this.ragService.initializeKnowledgeBase();
      }
      
      if (this.config.enableInsights) {
        this.insightService.initialize(config.openaiApiKey);
      }
      
      if (this.config.enableNLP) {
        this.nlpService.initialize(config.openaiApiKey);
      }
      
      logger.info('AI Pipeline initialized with OpenAI integration');
    } else {
      logger.warn('AI Pipeline initialized without OpenAI - limited functionality available');
    }
  }

  /**
   * Comprehensive analysis when a new todo is created
   */
  async analyzeTodoCreation(
    todoId: string,
    title: string,
    description: string | null,
    userId: string
  ): Promise<TodoAnalysisResult> {
    const startTime = Date.now();
    
    try {
      const results: TodoAnalysisResult = {
        predictions: {},
        insights: {
          semanticSimilarity: [],
          relatedTasks: [],
          autoTags: [],
        },
        recommendations: {
          nextActions: null,
          optimizations: [],
          scheduling: null,
        },
      };

      // Run analyses in parallel for performance
      const analysisPromises = [];

      // 1. Embedding and similarity analysis
      if (this.config.enableEmbeddings) {
        analysisPromises.push(
          this.performEmbeddingAnalysis(todoId, title, description, userId, results)
        );
      }

      // 2. ML predictions
      if (this.config.enablePredictions) {
        analysisPromises.push(
          this.performMLPredictions(todoId, title, description, userId, results)
        );
      }

      // 3. NLP analysis
      if (this.config.enableNLP) {
        analysisPromises.push(
          this.performNLPAnalysis(title, description, results)
        );
      }

      // 4. RAG context addition
      if (this.config.enableRAG) {
        analysisPromises.push(
          this.addToRAGContext(todoId, title, description, userId)
        );
      }

      await Promise.allSettled(analysisPromises);

      logger.info('Todo analysis completed', {
        todoId,
        duration: Date.now() - startTime,
        enabledServices: this.getEnabledServices(),
      });

      return results;
    } catch (error) {
      logger.error('Todo analysis failed', { error, todoId });
      throw error;
    }
  }

  /**
   * Generate comprehensive productivity report for user
   */
  async generateProductivityReport(userId: string): Promise<UserProductivityReport> {
    try {
      const [insights, patterns, burnoutRisk] = await Promise.allSettled([
        this.config.enableInsights ? this.insightService.generateProductivityInsights(userId) : [],
        this.config.enableInsights ? this.insightService.analyzeWorkPatterns(userId) : null,
        this.config.enableInsights ? this.insightService.predictBurnoutRisk(userId) : null,
      ]);

      // Get basic metrics
      const userTodos = await this.prisma.todo.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const completed = userTodos.filter(t => t.status === 'COMPLETED').length;
      const completionRate = userTodos.length > 0 ? completed / userTodos.length : 0;

      // Calculate trend (simplified)
      const recent = userTodos.filter(t => 
        t.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
      const older = userTodos.filter(t => 
        t.createdAt <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) &&
        t.createdAt > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      );

      const recentRate = recent.length > 0 ? recent.filter(t => t.status === 'COMPLETED').length / recent.length : 0;
      const olderRate = older.length > 0 ? older.filter(t => t.status === 'COMPLETED').length / older.length : 0;
      
      const trend = recentRate > olderRate + 0.1 ? 'improving' : 
                   recentRate < olderRate - 0.1 ? 'declining' : 'stable';

      const totalDays = Math.max(1, Math.ceil(
        (new Date().getTime() - userTodos[userTodos.length - 1]?.createdAt?.getTime() || Date.now()) / (1000 * 60 * 60 * 24)
      ));

      // Generate recommendations
      const recommendations = await this.generateRecommendations(userId, insights, patterns, burnoutRisk);

      return {
        summary: {
          completionRate,
          averageTasksPerDay: userTodos.length / totalDays,
          productivityTrend: trend,
        },
        insights: insights.status === 'fulfilled' ? insights.value : [],
        patterns: patterns.status === 'fulfilled' ? patterns.value : null,
        recommendations,
        burnoutRisk: burnoutRisk.status === 'fulfilled' ? burnoutRisk.value : null,
      };
    } catch (error) {
      logger.error('Failed to generate productivity report', { error, userId });
      throw error;
    }
  }

  /**
   * AI-powered task scheduling suggestions
   */
  async suggestTaskScheduling(userId: string): Promise<{
    todayRecommendations: any[];
    weeklyPlan: any[];
    optimizations: string[];
  }> {
    try {
      const userTodos = await this.prisma.todo.findMany({
        where: { 
          userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      if (userTodos.length === 0) {
        return {
          todayRecommendations: [],
          weeklyPlan: [],
          optimizations: ['Create some tasks to get scheduling recommendations'],
        };
      }

      // Get AI predictions for each task
      const taskPredictions = await Promise.allSettled(
        userTodos.slice(0, 10).map(async (todo) => {
          if (this.config.enablePredictions) {
            const prediction = await this.mlService.predictCompletionTime(todo.id, userId);
            return { todo, prediction };
          }
          return { todo, prediction: null };
        })
      );

      const validPredictions = taskPredictions
        .filter(p => p.status === 'fulfilled')
        .map(p => p.value);

      // Sort by priority and estimated time
      const todayRecommendations = validPredictions
        .filter(p => p.prediction && p.prediction.estimatedHours <= 4)
        .sort((a, b) => {
          const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (priorityOrder[b.todo.priority] || 2) - (priorityOrder[a.todo.priority] || 2);
        })
        .slice(0, 5)
        .map(p => ({
          todo: p.todo,
          estimatedTime: p.prediction?.estimatedHours,
          reasoning: `Priority: ${p.todo.priority}, Est: ${p.prediction?.estimatedHours}h`,
        }));

      const weeklyPlan = validPredictions
        .sort((a, b) => (a.prediction?.estimatedHours || 2) - (b.prediction?.estimatedHours || 2))
        .slice(0, 10)
        .map(p => ({
          todo: p.todo,
          suggestedDay: this.suggestOptimalDay(p.todo),
          estimatedTime: p.prediction?.estimatedHours,
        }));

      const optimizations = [
        'Focus on high-priority tasks first',
        'Batch similar tasks together',
        'Schedule difficult tasks during your peak hours',
      ];

      return {
        todayRecommendations,
        weeklyPlan,
        optimizations,
      };
    } catch (error) {
      logger.error('Failed to suggest task scheduling', { error, userId });
      return {
        todayRecommendations: [],
        weeklyPlan: [],
        optimizations: ['Error generating scheduling suggestions'],
      };
    }
  }

  /**
   * AI chat interface for task management
   */
  async chatWithAI(
    query: string,
    userId: string,
    sessionId: string = 'default'
  ): Promise<{
    response: string;
    sources: any[];
    suggestions: string[];
    confidence: number;
  }> {
    try {
      if (!this.config.enableRAG) {
        return {
          response: 'AI chat is not available - RAG service disabled',
          sources: [],
          suggestions: [],
          confidence: 0,
        };
      }

      const ragResult = await this.ragService.queryWithContext(query, userId, sessionId);

      return {
        response: ragResult.answer,
        sources: ragResult.sources,
        suggestions: ragResult.suggestedActions,
        confidence: ragResult.confidence,
      };
    } catch (error) {
      logger.error('AI chat failed', { error, query, userId });
      return {
        response: 'I apologize, but I encountered an error processing your request. Please try again.',
        sources: [],
        suggestions: ['Try rephrasing your question', 'Check if you have any todos to analyze'],
        confidence: 0,
      };
    }
  }

  private async performEmbeddingAnalysis(
    todoId: string,
    title: string,
    description: string | null,
    userId: string,
    results: TodoAnalysisResult
  ): Promise<void> {
    try {
      // Store embedding
      await this.embeddingService.embedTodo(todoId, title, userId, 'PENDING', null);

      // Find similar tasks
      const similarTasks = await this.embeddingService.findSimilarTodos(title, userId, 5);
      results.insights.semanticSimilarity = similarTasks;

      // Get related tasks
      const relatedTasks = await this.embeddingService.findSimilarTodos(
        `${title} ${description || ''}`, 
        userId, 
        3
      );
      results.insights.relatedTasks = relatedTasks;
    } catch (error) {
      logger.error('Embedding analysis failed', { error, todoId });
    }
  }

  private async performMLPredictions(
    todoId: string,
    title: string,
    description: string | null,
    userId: string,
    results: TodoAnalysisResult
  ): Promise<void> {
    try {
      const [completionTime, prioritySuggestion, complexityAnalysis] = await Promise.allSettled([
        this.mlService.predictCompletionTime(todoId, userId),
        this.mlService.suggestPriority(title, description, userId),
        this.mlService.analyzeTaskComplexity(todoId, userId),
      ]);

      if (completionTime.status === 'fulfilled') {
        results.predictions.completionTime = completionTime.value;
      }

      if (prioritySuggestion.status === 'fulfilled') {
        results.predictions.prioritySuggestion = prioritySuggestion.value;
      }

      if (complexityAnalysis.status === 'fulfilled') {
        results.predictions.complexityAnalysis = complexityAnalysis.value;
      }
    } catch (error) {
      logger.error('ML predictions failed', { error, todoId });
    }
  }

  private async performNLPAnalysis(
    title: string,
    description: string | null,
    results: TodoAnalysisResult
  ): Promise<void> {
    try {
      if (this.config.enableNLP) {
        const text = `${title} ${description || ''}`;
        const tags = await this.nlpService.extractKeywords(text);
        results.insights.autoTags = tags.slice(0, 5);
      }
    } catch (error) {
      logger.error('NLP analysis failed', { error });
    }
  }

  private async addToRAGContext(
    todoId: string,
    title: string,
    description: string | null,
    userId: string
  ): Promise<void> {
    try {
      await this.ragService.addTodoContext(todoId, title, description, userId);
    } catch (error) {
      logger.error('Failed to add todo to RAG context', { error, todoId });
    }
  }

  private async generateRecommendations(
    userId: string,
    insights: any,
    patterns: any,
    burnoutRisk: any
  ): Promise<any[]> {
    const recommendations = [];

    if (this.config.enableInsights) {
      try {
        const smartRecs = await this.insightService.generateSmartRecommendations(userId);
        recommendations.push(...smartRecs);
      } catch (error) {
        logger.error('Failed to generate smart recommendations', { error });
      }
    }

    return recommendations;
  }

  private suggestOptimalDay(todo: any): string {
    const priorities = { URGENT: 0, HIGH: 1, MEDIUM: 3, LOW: 5 };
    const daysFromNow = priorities[todo.priority] || 3;
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);
    
    return targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  }

  private getEnabledServices(): string[] {
    return Object.entries(this.config)
      .filter(([key, value]) => key.startsWith('enable') && value)
      .map(([key]) => key.replace('enable', '').toLowerCase());
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'error';
    services: Record<string, boolean>;
    lastUpdate: Date;
  } {
    const services = {
      embeddings: this.config.enableEmbeddings,
      predictions: this.config.enablePredictions,
      rag: this.config.enableRAG,
      insights: this.config.enableInsights,
      nlp: this.config.enableNLP,
    };

    const enabledCount = Object.values(services).filter(Boolean).length;
    const status = enabledCount === 0 ? 'error' : 
                  enabledCount < 3 ? 'degraded' : 'healthy';

    return {
      status,
      services,
      lastUpdate: new Date(),
    };
  }
}

export const aiPipelineService = (prisma: PrismaClient) => AIPipelineService.getInstance(prisma);