/**
 * DataLoader Configuration and Batch Functions
 * Request-level caching and batching for GraphQL resolvers
 */

import DataLoader from 'dataloader';
import { logger } from '../../logger.js';
import { prisma } from '../prisma.js';
import type { 
  LoaderContext,
  DataLoaderConfig,
  CacheConfig 
} from './types.js';
import {
  recordDatabaseQuery,
  databaseQueriesTotal,
  databaseQueryDuration,
} from '../monitoring/metrics.js';

// ================================
// Batch Load Functions
// ================================

/**
 * Batch load users by IDs
 */
async function batchLoadUsers(userIds: readonly string[]): Promise<any[]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading users', { count: userIds.length, userIds });

    const users = await prisma.user.findMany({
      where: {
        id: { in: [...userIds] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Create a map for O(1) lookup
    const userMap = new Map(users.map(user => [user.id, user]));
    
    // Return users in the same order as requested IDs
    const result = userIds.map(id => userMap.get(id) || new Error(`User not found: ${id}`));

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'User', 'success', duration);
    
    logger.debug('Batch loaded users', { 
      requested: userIds.length, 
      found: users.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'User', 'error', duration);
    
    logger.error('Failed to batch load users', { userIds, error });
    throw error;
  }
}

/**
 * Batch load todos by IDs
 */
async function batchLoadTodos(todoIds: readonly string[]): Promise<any[]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading todos', { count: todoIds.length });

    const todos = await prisma.todo.findMany({
      where: {
        id: { in: [...todoIds] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const todoMap = new Map(todos.map(todo => [todo.id, todo]));
    const result = todoIds.map(id => todoMap.get(id) || new Error(`Todo not found: ${id}`));

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'success', duration);
    
    logger.debug('Batch loaded todos', { 
      requested: todoIds.length, 
      found: todos.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'error', duration);
    
    logger.error('Failed to batch load todos', { todoIds, error });
    throw error;
  }
}

/**
 * Batch load todo lists by IDs
 */
async function batchLoadTodoLists(listIds: readonly string[]): Promise<any[]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading todo lists', { count: listIds.length });

    const todoLists = await prisma.todoList.findMany({
      where: {
        id: { in: [...listIds] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const listMap = new Map(todoLists.map(list => [list.id, list]));
    const result = listIds.map(id => listMap.get(id) || new Error(`TodoList not found: ${id}`));

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'TodoList', 'success', duration);
    
    logger.debug('Batch loaded todo lists', { 
      requested: listIds.length, 
      found: todoLists.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'TodoList', 'error', duration);
    
    logger.error('Failed to batch load todo lists', { listIds, error });
    throw error;
  }
}

/**
 * Batch load todos by user IDs
 */
async function batchLoadTodosByUser(userIds: readonly string[]): Promise<any[][]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading todos by user', { count: userIds.length });

    const todos = await prisma.todo.findMany({
      where: {
        userId: { in: [...userIds] },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Group todos by userId
    const todosByUser = new Map<string, any[]>();
    for (const userId of userIds) {
      todosByUser.set(userId, []);
    }

    for (const todo of todos) {
      const userTodos = todosByUser.get(todo.userId);
      if (userTodos) {
        userTodos.push(todo);
      }
    }

    const result = userIds.map(userId => todosByUser.get(userId) || []);

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'success', duration);
    
    logger.debug('Batch loaded todos by user', { 
      userIds: userIds.length,
      totalTodos: todos.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'error', duration);
    
    logger.error('Failed to batch load todos by user', { userIds, error });
    throw error;
  }
}

/**
 * Batch load todos by todo list IDs
 */
async function batchLoadTodosByList(listIds: readonly string[]): Promise<any[][]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading todos by list', { count: listIds.length });

    const todos = await prisma.todo.findMany({
      where: {
        todoListId: { in: [...listIds] },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Group todos by listId
    const todosByList = new Map<string, any[]>();
    for (const listId of listIds) {
      todosByList.set(listId, []);
    }

    for (const todo of todos) {
      if (todo.todoListId) {
        const listTodos = todosByList.get(todo.todoListId);
        if (listTodos) {
          listTodos.push(todo);
        }
      }
    }

    const result = listIds.map(listId => todosByList.get(listId) || []);

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'success', duration);
    
    logger.debug('Batch loaded todos by list', { 
      listIds: listIds.length,
      totalTodos: todos.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'Todo', 'error', duration);
    
    logger.error('Failed to batch load todos by list', { listIds, error });
    throw error;
  }
}

/**
 * Batch load users by todo list IDs (owners and collaborators)
 */
async function batchLoadUsersByTodoList(listIds: readonly string[]): Promise<any[][]> {
  const startTime = Date.now();
  
  try {
    logger.debug('Batch loading users by todo list', { count: listIds.length });

    // Get todo lists with their owners
    const todoLists = await prisma.todoList.findMany({
      where: {
        id: { in: [...listIds] },
      },
      include: {
        user: true, // Owner
        // collaborators: true, // Would include if collaboration is implemented
      },
    });

    // Group users by listId
    const usersByList = new Map<string, any[]>();
    for (const listId of listIds) {
      usersByList.set(listId, []);
    }

    for (const todoList of todoLists) {
      const users = usersByList.get(todoList.id) || [];
      
      if (todoList.user) {
        users.push(todoList.user);
      }
      
      // Add collaborators if available
      // if (todoList.collaborators) {
      //   users.push(...todoList.collaborators);
      // }
      
      usersByList.set(todoList.id, users);
    }

    const result = listIds.map(listId => usersByList.get(listId) || []);

    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'TodoList', 'success', duration);
    
    logger.debug('Batch loaded users by todo list', { 
      listIds: listIds.length,
      totalLists: todoLists.length,
      duration 
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordDatabaseQuery('findMany', 'TodoList', 'error', duration);
    
    logger.error('Failed to batch load users by todo list', { listIds, error });
    throw error;
  }
}

// ================================
// DataLoader Factory
// ================================

function createCacheKeyFunction(prefix: string): (key: string) => string {
  return (key: string) => `${prefix}:${key}`;
}

function createDataLoader<K, V>(
  batchLoadFn: (keys: readonly K[]) => Promise<V[]>,
  options: {
    maxBatchSize?: number;
    batchScheduleFn?: (callback: () => void) => void;
    cacheKeyFn?: (key: K) => any;
    prefix?: string;
  } = {}
): DataLoader<K, V> {
  const loaderOptions: any = {
    maxBatchSize: options.maxBatchSize || 100,
    cache: true,
    batchScheduleFn: options.batchScheduleFn || setImmediate,
  };

  if (options.cacheKeyFn) {
    loaderOptions.cacheKeyFn = options.cacheKeyFn;
  } else if (options.prefix) {
    loaderOptions.cacheKeyFn = createCacheKeyFunction(options.prefix);
  }

  return new DataLoader(batchLoadFn, loaderOptions);
}

// ================================
// Loader Context Factory
// ================================

export function createLoaderContext(config?: CacheConfig): LoaderContext {
  logger.debug('Creating DataLoader context');

  const loaderOptions = config?.levels.l1 ? {
    maxBatchSize: config.levels.l1.maxBatchSize,
    batchScheduleFn: config.levels.l1.batchScheduleFn,
  } : {};

  const context: LoaderContext = {
    userLoader: createDataLoader(batchLoadUsers, {
      ...loaderOptions,
      prefix: 'user',
    }),

    todoLoader: createDataLoader(batchLoadTodos, {
      ...loaderOptions,
      prefix: 'todo',
    }),

    todoListLoader: createDataLoader(batchLoadTodoLists, {
      ...loaderOptions,
      prefix: 'todoList',
    }),

    todosByUserLoader: createDataLoader(batchLoadTodosByUser, {
      ...loaderOptions,
      prefix: 'todosByUser',
    }),

    todosByListLoader: createDataLoader(batchLoadTodosByList, {
      ...loaderOptions,
      prefix: 'todosByList',
    }),

    usersByTodoListLoader: createDataLoader(batchLoadUsersByTodoList, {
      ...loaderOptions,
      prefix: 'usersByTodoList',
    }),
  };

  // Add request-level cache clearing for mutations
  const clearCache = () => {
    context.userLoader.clearAll();
    context.todoLoader.clearAll();
    context.todoListLoader.clearAll();
    context.todosByUserLoader.clearAll();
    context.todosByListLoader.clearAll();
    context.usersByTodoListLoader.clearAll();
  };

  // Expose clear method on context
  (context as any).clearAll = clearCache;

  logger.debug('DataLoader context created', {
    loaders: Object.keys(context).length,
    maxBatchSize: loaderOptions.maxBatchSize,
  });

  return context;
}

// ================================
// Prime Cache Functions
// ================================

/**
 * Prime the user loader cache with existing data
 */
export function primeUserLoader(context: LoaderContext, users: any[]): void {
  for (const user of users) {
    if (user && user.id) {
      context.userLoader.prime(user.id, user);
    }
  }
}

/**
 * Prime the todo loader cache with existing data
 */
export function primeTodoLoader(context: LoaderContext, todos: any[]): void {
  for (const todo of todos) {
    if (todo && todo.id) {
      context.todoLoader.prime(todo.id, todo);
    }
  }
}

/**
 * Prime the todo list loader cache with existing data
 */
export function primeTodoListLoader(context: LoaderContext, todoLists: any[]): void {
  for (const todoList of todoLists) {
    if (todoList && todoList.id) {
      context.todoListLoader.prime(todoList.id, todoList);
    }
  }
}

// ================================
// Performance Monitoring
// ================================

export function getLoaderStats(context: LoaderContext): Record<string, any> {
  const getLoaderInfo = (loader: DataLoader<any, any>, name: string) => {
    const stats = (loader as any)._stats || {};
    return {
      name,
      cacheSize: (loader as any)._cacheMap?.size || 0,
      batchesDispatched: stats.batchesDispatched || 0,
      requestsInBatch: stats.requestsInBatch || 0,
    };
  };

  return {
    userLoader: getLoaderInfo(context.userLoader, 'userLoader'),
    todoLoader: getLoaderInfo(context.todoLoader, 'todoLoader'),
    todoListLoader: getLoaderInfo(context.todoListLoader, 'todoListLoader'),
    todosByUserLoader: getLoaderInfo(context.todosByUserLoader, 'todosByUserLoader'),
    todosByListLoader: getLoaderInfo(context.todosByListLoader, 'todosByListLoader'),
    usersByTodoListLoader: getLoaderInfo(context.usersByTodoListLoader, 'usersByTodoListLoader'),
  };
}

/**
 * Clear all loader caches
 */
export function clearAllLoaders(context: LoaderContext): void {
  context.userLoader.clearAll();
  context.todoLoader.clearAll();
  context.todoListLoader.clearAll();
  context.todosByUserLoader.clearAll();
  context.todosByListLoader.clearAll();
  context.usersByTodoListLoader.clearAll();
  
  logger.debug('All DataLoader caches cleared');
}