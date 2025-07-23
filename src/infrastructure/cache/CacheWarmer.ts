import { CacheManager } from './CacheManager.js';
import { Container } from '../container/Container.js';
import { logger } from '@/logger.js';
import { hash } from 'ohash';

export interface CacheWarmingConfig {
  /**
   * Queries to warm on startup
   */
  queries: CacheWarmQuery[];
  
  /**
   * Interval in seconds to re-warm cache (0 to disable)
   */
  interval?: number;
  
  /**
   * Enable/disable cache warming
   */
  enabled?: boolean;
}

export interface CacheWarmQuery {
  /**
   * GraphQL query string
   */
  query: string;
  
  /**
   * Variables for the query
   */
  variables?: Record<string, any>;
  
  /**
   * Cache key prefix
   */
  keyPrefix?: string;
  
  /**
   * TTL in seconds
   */
  ttl?: number;
  
  /**
   * User context (for user-specific queries)
   */
  userId?: string;
}

export class CacheWarmer {
  private static instance: CacheWarmer;
  private cacheManager: CacheManager;
  private container: Container;
  private intervalId?: NodeJS.Timeout;
  
  private constructor() {
    this.cacheManager = CacheManager.getInstance();
    this.container = Container.getInstance();
  }
  
  public static getInstance(): CacheWarmer {
    if (!CacheWarmer.instance) {
      CacheWarmer.instance = new CacheWarmer();
    }
    return CacheWarmer.instance;
  }
  
  /**
   * Start cache warming with the given configuration
   */
  public async start(config: CacheWarmingConfig): Promise<void> {
    if (!config.enabled || !this.cacheManager.isEnabled()) {
      logger.info('Cache warming is disabled');
      return;
    }
    
    // Warm cache initially
    await this.warmCache(config.queries);
    
    // Set up interval warming if configured
    if (config.interval && config.interval > 0) {
      this.intervalId = setInterval(async () => {
        try {
          await this.warmCache(config.queries);
        } catch (error) {
          logger.error('Cache warming interval failed', { error });
        }
      }, config.interval * 1000);
      
      logger.info('Cache warming interval started', { 
        interval: config.interval,
        queryCount: config.queries.length,
      });
    }
  }
  
  /**
   * Stop cache warming
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Cache warming stopped');
    }
  }
  
  /**
   * Warm cache with the given queries
   */
  private async warmCache(queries: CacheWarmQuery[]): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    
    for (const warmQuery of queries) {
      try {
        await this.warmQuery(warmQuery);
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error('Failed to warm query', { 
          error,
          query: warmQuery.query.substring(0, 100) + '...',
        });
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info('Cache warming completed', {
      duration,
      successCount,
      errorCount,
      totalQueries: queries.length,
    });
  }
  
  /**
   * Warm a single query
   */
  private async warmQuery(warmQuery: CacheWarmQuery): Promise<void> {
    const { query, variables = {}, keyPrefix = 'warm:', ttl = 300, userId } = warmQuery;
    
    // Generate cache key
    const cacheKeyData = {
      query,
      variables,
      userId,
    };
    const cacheKey = `${keyPrefix}${hash(cacheKeyData)}`;
    
    // Check if already cached
    const existing = await this.cacheManager.get(cacheKey);
    if (existing) {
      logger.debug('Query already cached, skipping', { cacheKey });
      return;
    }
    
    // Execute the query to get data
    // Note: This is a simplified version. In production, you'd execute through GraphQL
    const result = await this.executeGraphQLQuery(query, variables, userId);
    
    // Cache the result
    await this.cacheManager.set(cacheKey, result, { ttl });
    
    logger.debug('Query warmed successfully', { 
      cacheKey,
      ttl,
      resultSize: JSON.stringify(result).length,
    });
  }
  
  /**
   * Execute a GraphQL query (simplified version)
   */
  private async executeGraphQLQuery(
    query: string,
    variables: Record<string, any>,
    userId?: string
  ): Promise<any> {
    // In a real implementation, this would execute through the GraphQL schema
    // For now, we'll implement specific common queries
    
    if (query.includes('todos') && userId) {
      // Warm user's todos
      const todos = await this.container.prisma.todo.findMany({
        where: { userId },
        include: {
          user: true,
          todoList: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      
      return { data: { todos } };
    }
    
    if (query.includes('todoLists') && userId) {
      // Warm user's todo lists
      const todoLists = await this.container.prisma.todoList.findMany({
        where: { userId },
        include: {
          todos: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      
      return { data: { todoLists } };
    }
    
    // Default: return empty result
    return { data: {} };
  }
}

/**
 * Default cache warming configuration
 */
export const defaultCacheWarmingConfig: CacheWarmingConfig = {
  enabled: true,
  interval: 300, // 5 minutes
  queries: [
    // Popular queries that should be warmed
    {
      query: `
        query GetRecentTodos($userId: ID!) {
          todos(userId: $userId, limit: 20) {
            id
            title
            status
            priority
            dueDate
            user {
              id
              name
            }
          }
        }
      `,
      keyPrefix: 'warm:todos:',
      ttl: 600,
    },
    {
      query: `
        query GetTodoLists($userId: ID!) {
          todoLists(userId: $userId) {
            id
            title
            description
            todos(limit: 10) {
              id
              title
              status
            }
          }
        }
      `,
      keyPrefix: 'warm:lists:',
      ttl: 600,
    },
  ],
};