import { PrismaClient } from '@prisma/client';
import { logger } from '@/logger.js';
import { Redis } from 'ioredis';
import { ReadModelManager } from './ReadModel.js';

export interface QueryOptions {
  useCache?: boolean;
  cacheTTL?: number;
  includeDeleted?: boolean;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QueryResult<T> {
  data: T;
  metadata?: {
    totalCount?: number;
    page?: number;
    pageSize?: number;
    cached?: boolean;
    executionTime?: number;
  };
}

/**
 * Base Query Service for CQRS read operations
 */
export abstract class QueryService {
  protected cache?: Redis;
  protected cachePrefix: string;

  constructor(
    protected prisma: PrismaClient,
    protected readModelManager: ReadModelManager,
    cache?: Redis,
    cachePrefix?: string
  ) {
    this.cache = cache;
    this.cachePrefix = cachePrefix || this.constructor.name;
  }

  /**
   * Get from cache or execute query
   */
  protected async cachedQuery<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttl: number = 300 // 5 minutes default
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}:${key}`;

    // Try cache first
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          return {
            data: JSON.parse(cached),
            metadata: {
              cached: true,
              executionTime: Date.now() - startTime,
            },
          };
        }
      } catch (error) {
        logger.warn('Cache read error:', error);
      }
    }

    // Execute query
    const data = await queryFn();

    // Cache result
    if (this.cache && data) {
      try {
        await this.cache.setex(cacheKey, ttl, JSON.stringify(data));
      } catch (error) {
        logger.warn('Cache write error:', error);
      }
    }

    return {
      data: data as any,
      metadata: {
        cached: false,
        executionTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Invalidate cache entries
   */
  protected async invalidateCache(pattern: string): Promise<void> {
    if (!this.cache) return;

    try {
      const keys = await this.cache.keys(`${this.cachePrefix}:${pattern}`);
      if (keys.length > 0) {
        await this.cache.del(...keys);
        logger.debug(`Invalidated ${keys.length} cache entries`);
      }
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }
  }
}

/**
 * Todo Query Service - Optimized for various todo queries
 */
export class TodoQueryService extends QueryService {
  /**
   * Get todos for a user with pagination and filtering
   */
  async getUserTodos(
    userId: string,
    options: {
      status?: string;
      priority?: string;
      tags?: string[];
      assigneeId?: string;
      dueDateRange?: { start: Date; end: Date };
    } & PaginationOptions & QueryOptions
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const cacheKey = `user:${userId}:todos:${JSON.stringify(options)}`;

    return this.cachedQuery<Record<string, unknown>[]>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        // Use optimized read model view
        const query = await this.prisma.$queryRaw`
          SELECT 
            todo_id, title, status, priority, 
            created_at, updated_at, completed_at,
            tags, assignee_ids, completion_rate
          FROM todo_list_view
          WHERE user_id = ${userId}
          ${options.status ? `AND status = ${options.status}` : ''}
          ${options.priority ? `AND priority = ${options.priority}` : ''}
          ${options.assigneeId ? `AND ${options.assigneeId} = ANY(assignee_ids)` : ''}
          ${options.dueDateRange
            ? `AND due_date BETWEEN ${options.dueDateRange.start} AND ${options.dueDateRange.end}`
            : ''
          }
          ${options.tags && options.tags.length > 0
            ? `AND tags && ARRAY[${options.tags.map(t => `'${t}'`).join(',')}]`
            : ''
          }
          ORDER BY ${options.sortBy || 'created_at'} ${options.sortOrder || 'desc'}
          LIMIT ${options.pageSize}
          OFFSET ${(options.page - 1) * options.pageSize}
        `;

        return query as Record<string, unknown>[];
      },
      options.cacheTTL
    );
  }

  /**
   * Get todo details with all related data
   */
  async getTodoDetails(
    todoId: string,
    userId: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<Record<string, unknown>>> {
    const cacheKey = `todo:${todoId}:details`;

    return this.cachedQuery<Record<string, unknown>>(
      cacheKey,
      async () => {
        const todo = await this.prisma.todo.findFirst({
          where: {
            id: todoId,
            userId,
          },
          include: {
            user: true,
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        });

        if (!todo) {
          throw new Error('Todo not found');
        }

        // Enrich with AI insights if available
        const insights = await this.getAIInsights(todoId);

        return {
          ...todo,
          insights,
        };
      },
      options.cacheTTL
    );
  }

  /**
   * Search todos with full-text search
   */
  async searchTodos(
    userId: string,
    searchTerm: string,
    options: PaginationOptions & QueryOptions
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const cacheKey = `search:${userId}:${searchTerm}:${JSON.stringify(options)}`;

    return this.cachedQuery<Record<string, unknown>[]>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        // Use PostgreSQL full-text search
        const results = await this.prisma.$queryRaw`
          SELECT 
            todo_id, title, description, status, priority,
            ts_rank(search_vector, plainto_tsquery(${searchTerm})) as rank
          FROM todo_list_view
          WHERE 
            user_id = ${userId}
            AND search_vector @@ plainto_tsquery(${searchTerm})
          ORDER BY rank DESC, created_at DESC
          LIMIT ${options.pageSize}
          OFFSET ${(options.page - 1) * options.pageSize}
        `;

        return results as Record<string, unknown>[];
      },
      options.cacheTTL || 60 // 1 minute for search results
    );
  }

  /**
   * Get todo analytics
   */
  async getTodoAnalytics(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<QueryResult<any>> {
    const cacheKey = `analytics:${userId}:${timeRange.start.toISOString()}-${timeRange.end.toISOString()}`;

    return this.cachedQuery<any>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        const [stats, trends, distribution] = await Promise.all([
          this.getUserStatistics(userId),
          this.getCompletionTrends(userId, timeRange),
          this.getPriorityDistribution(userId),
        ]);

        return { stats, trends, distribution };
      },
      300 // 5 minutes
    );
  }

  private async getUserStatistics(userId: string): Promise<Record<string, unknown>> {
    const result = await this.prisma.$queryRaw`
      SELECT 
        total_todos,
        completed_todos,
        completion_rate,
        avg_completion_time,
        last_updated
      FROM user_statistics
      WHERE user_id = ${userId}
    `;

    return (result as Record<string, unknown>[])[0] || {};
  }

  private async getCompletionTrends(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw`
      SELECT 
        DATE(completed_at) as date,
        COUNT(*) as completed_count
      FROM todo_list_view
      WHERE 
        user_id = ${userId}
        AND status = 'COMPLETED'
        AND completed_at BETWEEN ${timeRange.start} AND ${timeRange.end}
      GROUP BY DATE(completed_at)
      ORDER BY date
    `;
  }

  private async getPriorityDistribution(userId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw`
      SELECT 
        priority,
        COUNT(*) as count,
        AVG(completion_rate) as avg_completion_rate
      FROM todo_list_view
      WHERE user_id = ${userId}
      GROUP BY priority
    `;
  }

  private async getAIInsights(todoId: string): Promise<Record<string, unknown>> {
    // This would fetch AI-generated insights from the AI service
    // For now, return a placeholder
    return {
      predictedCompletionTime: null,
      suggestedPriority: null,
      relatedTasks: [],
    };
  }
}

/**
 * User Query Service
 */
export class UserQueryService extends QueryService {
  /**
   * Get user activity timeline
   */
  async getUserActivity(
    userId: string,
    options: PaginationOptions & QueryOptions
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const cacheKey = `activity:${userId}:${JSON.stringify(options)}`;

    return this.cachedQuery<Record<string, unknown>[]>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        return this.prisma.$queryRaw`
          SELECT 
            id, event_type, aggregate_id, aggregate_type,
            description, metadata, occurred_at
          FROM activity_timeline
          WHERE user_id = ${userId}
          ORDER BY occurred_at DESC
          LIMIT ${options.pageSize}
          OFFSET ${(options.page - 1) * options.pageSize}
        `;
      },
      options.cacheTTL || 60
    );
  }

  /**
   * Get user productivity insights
   */
  async getUserProductivity(
    userId: string,
    timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const cacheKey = `productivity:${userId}:${timeframe}`;

    return this.cachedQuery<Record<string, unknown>[]>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        const timeRanges = this.getTimeRanges(timeframe);

        const productivity = await Promise.all(
          timeRanges.map(async (range) => {
            const result = await this.prisma.$queryRaw`
              SELECT 
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
                COUNT(*) as total,
                AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time_seconds
              FROM todos
              WHERE 
                user_id = ${userId}
                AND created_at BETWEEN ${range.start} AND ${range.end}
            `;

            return (result as any)[0] || {};
          })
        );

        return productivity;
      },
      600 // 10 minutes
    );
  }

  private getTimeRanges(timeframe: string) {
    const now = new Date();
    const ranges = [];

    switch (timeframe) {
      case 'daily':
        for (let i = 0; i < 7; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          ranges.push({
            start: new Date(date.setHours(0, 0, 0, 0)),
            end: new Date(date.setHours(23, 59, 59, 999)),
            label: date.toISOString().split('T')[0],
          });
        }
        break;
      case 'weekly':
        for (let i = 0; i < 4; i++) {
          const weekStart = new Date(now);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          ranges.push({
            start: weekStart,
            end: weekEnd,
            label: `Week ${i + 1}`,
          });
        }
        break;
      case 'monthly':
        for (let i = 0; i < 3; i++) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          ranges.push({
            start: monthStart,
            end: monthEnd,
            label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          });
        }
        break;
    }

    return ranges;
  }
}

/**
 * Tag Query Service
 */
export class TagQueryService extends QueryService {
  /**
   * Get popular tags with usage statistics
   */
  async getPopularTags(
    userId?: string,
    limit: number = 20
  ): Promise<QueryResult<Record<string, unknown>[]>> {
    const cacheKey = `tags:popular:${userId || 'global'}:${limit}`;

    return this.cachedQuery<Record<string, unknown>[]>(
      cacheKey,
      async (): Promise<Record<string, unknown>[]> => {
        return this.prisma.$queryRaw`
          SELECT 
            tag,
            SUM(usage_count) as total_usage,
            COUNT(DISTINCT user_id) as user_count,
            MAX(last_used) as last_used
          FROM tag_analytics
          ${userId ? `WHERE user_id = ${userId}` : ''}
          GROUP BY tag
          ORDER BY total_usage DESC
          LIMIT ${limit}
        `;
      },
      600 // 10 minutes
    );
  }

  /**
   * Get tag suggestions based on context
   */
  async getTagSuggestions(
    userId: string,
    context: { title?: string; description?: string }
  ): Promise<QueryResult<string[]>> {
    // In a real implementation, this would use AI or ML for suggestions
    const popularTags = await this.getPopularTags(userId, 10);
    if (!popularTags.data) {
      return {
        data: [],
        metadata: { cached: false },
      };
    }
    return {
      data: popularTags.data.map((t: Record<string, unknown>) => t.tag as string),
      metadata: { cached: false },
    };
  }
}   