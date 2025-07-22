/**
 * Cache-Aware GraphQL Resolvers
 * High-performance resolvers with intelligent caching strategies
 */

import { logger } from '../../logger.js';
import { CACHE_KEYS, CACHE_POLICIES } from './config.js';
import type { 
  CacheManager 
} from './manager.js';
import type { 
  LoaderContext,
  CachedGraphQLContext,
  CacheableResolver,
  CachePolicy 
} from './types.js';
import {
  recordGraphqlOperation,
  graphqlOperationDuration,
} from '../monitoring/metrics.js';

// ================================
// Caching Utilities
// ================================

/**
 * Generate cache key from resolver arguments
 */
function generateCacheKey(
  typeName: string,
  fieldName: string,
  args: any,
  userId?: string
): string {
  const argsHash = JSON.stringify(args || {});
  const userPart = userId ? `:user:${userId}` : '';
  return `resolver:${typeName}:${fieldName}${userPart}:${Buffer.from(argsHash).toString('base64')}`;
}

/**
 * Create a cached resolver wrapper
 */
export function createCachedResolver<TSource, TArgs, TContext extends CachedGraphQLContext, TReturn>(
  typeName: string,
  fieldName: string,
  resolver: CacheableResolver<TSource, TArgs, TContext, TReturn>['resolve'],
  policy: CachePolicy = CACHE_POLICIES.TODO_DATA
): (source: TSource, args: TArgs, context: TContext, info: any) => Promise<TReturn> {
  return async (source: TSource, args: TArgs, context: TContext, info: any): Promise<TReturn> => {
    const startTime = Date.now();
    const cacheKey = resolver.cacheKeyGenerator 
      ? resolver.cacheKeyGenerator(source, args, context)
      : generateCacheKey(typeName, fieldName, args, context.user?.id);

    try {
      // Try to get from cache based on strategy
      const cachedValue = await context.cache.getOrSet(
        { key: cacheKey, level: 'all', ttl: policy.ttl, tags: policy.tags },
        async () => {
          logger.debug('Cache miss - executing resolver', { 
            typeName, 
            fieldName, 
            cacheKey 
          });
          
          const resolverStartTime = Date.now();
          const result = await resolver(source, args, context, info);
          const resolverDuration = Date.now() - resolverStartTime;
          
          // Record resolver execution time
          recordGraphqlOperation('resolver', `${typeName}.${fieldName}`, 'success', resolverDuration);
          
          return result;
        },
        policy.ttl,
        policy.strategy
      );

      const totalDuration = Date.now() - startTime;
      
      // Add cache hint for HTTP caching
      if (context.cacheHints) {
        context.cacheHints.push({
          path: `${typeName}.${fieldName}`,
          maxAge: policy.ttl,
          tags: policy.tags,
          version: policy.version,
        });
      }

      logger.debug('Cached resolver completed', {
        typeName,
        fieldName,
        cacheKey,
        duration: totalDuration,
      });

      return cachedValue;

    } catch (error) {
      const duration = Date.now() - startTime;
      recordGraphqlOperation('resolver', `${typeName}.${fieldName}`, 'error', duration);
      
      logger.error('Cached resolver error', {
        typeName,
        fieldName,
        cacheKey,
        error,
        duration,
      });

      throw error;
    }
  };
}

// ================================
// User Resolvers
// ================================

export const UserResolvers = {
  /**
   * Get user todos with intelligent caching
   */
  todos: createCachedResolver(
    'User',
    'todos',
    async (user: any, args: any, context: CachedGraphQLContext) => {
      // Use DataLoader for efficient batching
      return await context.loaders.todosByUserLoader.load(user.id);
    },
    {
      ...CACHE_POLICIES.TODO_DATA,
      ttl: 300, // 5 minutes - todos change more frequently
    }
  ),

  /**
   * Get user profile with long-term caching
   */
  profile: createCachedResolver(
    'User',
    'profile',
    async (user: any, args: any, context: CachedGraphQLContext) => {
      // Simulate profile data aggregation
      const todoCount = await context.loaders.todosByUserLoader.load(user.id);
      const completedTodos = todoCount.filter((todo: any) => todo.status === 'COMPLETED');
      
      return {
        totalTodos: todoCount.length,
        completedTodos: completedTodos.length,
        completionRate: todoCount.length > 0 ? completedTodos.length / todoCount.length : 0,
        joinedAt: user.createdAt,
        lastActivity: user.updatedAt,
      };
    },
    CACHE_POLICIES.USER_PROFILE
  ),

  /**
   * Get user statistics with expensive query caching
   */
  statistics: createCachedResolver(
    'User',
    'statistics',
    async (user: any, args: any, context: CachedGraphQLContext) => {
      // This would be an expensive aggregation query
      const todos = await context.loaders.todosByUserLoader.load(user.id);
      
      const stats = {
        totalTodos: todos.length,
        completedTodos: todos.filter((todo: any) => todo.status === 'COMPLETED').length,
        inProgressTodos: todos.filter((todo: any) => todo.status === 'IN_PROGRESS').length,
        highPriorityTodos: todos.filter((todo: any) => todo.priority === 'HIGH').length,
        averageCompletionTime: calculateAverageCompletionTime(todos),
        productivityScore: calculateProductivityScore(todos),
      };
      
      return stats;
    },
    CACHE_POLICIES.EXPENSIVE_QUERY
  ),
};

// ================================
// Todo Resolvers
// ================================

export const TodoResolvers = {
  /**
   * Get todo owner with DataLoader batching
   */
  user: createCachedResolver(
    'Todo',
    'user',
    async (todo: any, args: any, context: CachedGraphQLContext) => {
      return await context.loaders.userLoader.load(todo.userId);
    },
    CACHE_POLICIES.USER_PROFILE
  ),

  /**
   * Get todo list with caching
   */
  todoList: createCachedResolver(
    'Todo',
    'todoList',
    async (todo: any, args: any, context: CachedGraphQLContext) => {
      if (!todo.todoListId) return null;
      return await context.loaders.todoListLoader.load(todo.todoListId);
    },
    CACHE_POLICIES.TODO_DATA
  ),

  /**
   * Get related todos with intelligent caching
   */
  relatedTodos: createCachedResolver(
    'Todo',
    'relatedTodos',
    async (todo: any, args: any, context: CachedGraphQLContext) => {
      // Get todos from same list or by same user
      const [listTodos, userTodos] = await Promise.all([
        todo.todoListId 
          ? context.loaders.todosByListLoader.load(todo.todoListId)
          : [],
        context.loaders.todosByUserLoader.load(todo.userId),
      ]);
      
      // Combine and deduplicate
      const allRelated = [...listTodos, ...userTodos];
      const unique = allRelated.filter((relatedTodo: any, index: number, arr: any[]) => 
        arr.findIndex(t => t.id === relatedTodo.id) === index
      );
      
      // Remove current todo and limit results
      return unique
        .filter((relatedTodo: any) => relatedTodo.id !== todo.id)
        .slice(0, args.limit || 5);
    },
    {
      ...CACHE_POLICIES.TODO_DATA,
      ttl: 600, // 10 minutes
    }
  ),
};

// ================================
// TodoList Resolvers
// ================================

export const TodoListResolvers = {
  /**
   * Get todo list todos with caching
   */
  todos: createCachedResolver(
    'TodoList',
    'todos',
    async (todoList: any, args: any, context: CachedGraphQLContext) => {
      const todos = await context.loaders.todosByListLoader.load(todoList.id);
      
      // Apply filters from arguments
      let filteredTodos = todos;
      
      if (args.status) {
        filteredTodos = filteredTodos.filter((todo: any) => todo.status === args.status);
      }
      
      if (args.priority) {
        filteredTodos = filteredTodos.filter((todo: any) => todo.priority === args.priority);
      }
      
      if (args.completed !== undefined) {
        filteredTodos = filteredTodos.filter((todo: any) => 
          (todo.status === 'COMPLETED') === args.completed
        );
      }
      
      // Apply pagination
      const offset = args.offset || 0;
      const limit = Math.min(args.limit || 50, 100);
      
      return filteredTodos.slice(offset, offset + limit);
    },
    CACHE_POLICIES.TODO_DATA
  ),

  /**
   * Get todo list owner with caching
   */
  owner: createCachedResolver(
    'TodoList',
    'owner',
    async (todoList: any, args: any, context: CachedGraphQLContext) => {
      return await context.loaders.userLoader.load(todoList.userId);
    },
    CACHE_POLICIES.USER_PROFILE
  ),

  /**
   * Get todo list collaborators
   */
  collaborators: createCachedResolver(
    'TodoList',
    'collaborators',
    async (todoList: any, args: any, context: CachedGraphQLContext) => {
      return await context.loaders.usersByTodoListLoader.load(todoList.id);
    },
    CACHE_POLICIES.USER_PROFILE
  ),

  /**
   * Get todo list statistics
   */
  statistics: createCachedResolver(
    'TodoList',
    'statistics',
    async (todoList: any, args: any, context: CachedGraphQLContext) => {
      const todos = await context.loaders.todosByListLoader.load(todoList.id);
      
      const stats = {
        totalTodos: todos.length,
        completedTodos: todos.filter((todo: any) => todo.status === 'COMPLETED').length,
        inProgressTodos: todos.filter((todo: any) => todo.status === 'IN_PROGRESS').length,
        pendingTodos: todos.filter((todo: any) => todo.status === 'TODO').length,
        highPriorityTodos: todos.filter((todo: any) => todo.priority === 'HIGH').length,
        completionRate: todos.length > 0 
          ? todos.filter((todo: any) => todo.status === 'COMPLETED').length / todos.length 
          : 0,
        lastActivity: Math.max(...todos.map((todo: any) => 
          new Date(todo.updatedAt).getTime()
        )),
      };
      
      return stats;
    },
    CACHE_POLICIES.EXPENSIVE_QUERY
  ),
};

// ================================
// Query Resolvers
// ================================

export const QueryResolvers = {
  /**
   * Get trending todos with aggressive caching
   */
  trendingTodos: createCachedResolver(
    'Query',
    'trendingTodos',
    async (parent: any, args: any, context: CachedGraphQLContext) => {
      // This would be an expensive query across all users
      const cacheKey = CACHE_KEYS.query('trending_todos');
      
      return await context.cache.getOrSet(
        cacheKey,
        async () => {
          // Simulate expensive trending calculation
          // In reality, this might involve ML algorithms or complex aggregations
          logger.info('Calculating trending todos (expensive operation)');
          
          // Mock implementation
          return [
            { id: '1', title: 'Learn GraphQL', score: 95 },
            { id: '2', title: 'Build Todo App', score: 88 },
            { id: '3', title: 'Deploy to Production', score: 82 },
          ];
        },
        1800, // 30 minutes
        'stale-while-revalidate'
      );
    },
    {
      strategy: 'stale-while-revalidate',
      ttl: 1800,
      staleWhileRevalidate: 3600,
      tags: ['trending', 'todos'],
      invalidateOn: ['todo:created', 'todo:completed'],
    }
  ),

  /**
   * Get global statistics with long-term caching
   */
  globalStatistics: createCachedResolver(
    'Query',
    'globalStatistics',
    async (parent: any, args: any, context: CachedGraphQLContext) => {
      const cacheKey = CACHE_KEYS.globalStats();
      
      return await context.cache.getOrSet(
        cacheKey,
        async () => {
          logger.info('Calculating global statistics (expensive operation)');
          
          // In a real app, these would be complex aggregations
          return {
            totalUsers: 1250,
            totalTodos: 15680,
            completedTodos: 9234,
            activeUsers: 892,
            completionRate: 0.59,
            lastCalculated: new Date().toISOString(),
          };
        },
        3600 // 1 hour
      );
    },
    CACHE_POLICIES.EXPENSIVE_QUERY
  ),
};

// ================================
// Cache Invalidation Helpers
// ================================

export class CacheInvalidator {
  constructor(private cache: CacheManager) {}

  async invalidateUser(userId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidateByPattern(`*user:${userId}*`),
      this.cache.invalidateByTag('users'),
    ]);
    
    logger.info('User cache invalidated', { userId });
  }

  async invalidateTodo(todoId: string, userId: string, todoListId?: string): Promise<void> {
    const patterns = [
      `*todo:${todoId}*`,
      `*user:${userId}*`,
    ];
    
    if (todoListId) {
      patterns.push(`*todoList:${todoListId}*`);
    }

    await Promise.all([
      ...patterns.map(pattern => this.cache.invalidateByPattern(pattern)),
      this.cache.invalidateByTag('todos'),
    ]);
    
    logger.info('Todo cache invalidated', { todoId, userId, todoListId });
  }

  async invalidateTodoList(todoListId: string, userId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidateByPattern(`*todoList:${todoListId}*`),
      this.cache.invalidateByPattern(`*user:${userId}*`),
      this.cache.invalidateByTag('todoLists'),
    ]);
    
    logger.info('TodoList cache invalidated', { todoListId, userId });
  }

  async invalidateGlobalStats(): Promise<void> {
    await Promise.all([
      this.cache.invalidateByPattern('*stats:*'),
      this.cache.invalidateByTag('aggregations'),
    ]);
    
    logger.info('Global statistics cache invalidated');
  }
}

// ================================
// Helper Functions
// ================================

function calculateAverageCompletionTime(todos: any[]): number {
  const completedTodos = todos.filter(todo => 
    todo.status === 'COMPLETED' && todo.completedAt
  );
  
  if (completedTodos.length === 0) return 0;
  
  const totalTime = completedTodos.reduce((sum, todo) => {
    const created = new Date(todo.createdAt).getTime();
    const completed = new Date(todo.completedAt).getTime();
    return sum + (completed - created);
  }, 0);
  
  return totalTime / completedTodos.length / (1000 * 60 * 60 * 24); // Days
}

function calculateProductivityScore(todos: any[]): number {
  if (todos.length === 0) return 0;
  
  const weights = {
    completed: 10,
    inProgress: 5,
    highPriority: 3,
    onTime: 5,
  };
  
  let score = 0;
  score += todos.filter(t => t.status === 'COMPLETED').length * weights.completed;
  score += todos.filter(t => t.status === 'IN_PROGRESS').length * weights.inProgress;
  score += todos.filter(t => t.priority === 'HIGH').length * weights.highPriority;
  
  // On-time completion bonus
  const onTimeTodos = todos.filter(todo => {
    if (!todo.dueDate || todo.status !== 'COMPLETED') return false;
    return new Date(todo.completedAt) <= new Date(todo.dueDate);
  });
  score += onTimeTodos.length * weights.onTime;
  
  return Math.min(100, score / todos.length); // Normalize to 0-100
}