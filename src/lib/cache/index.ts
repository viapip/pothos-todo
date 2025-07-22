/**
 * Cache utilities and abstractions
 * Provides unified caching interface with Redis backend and in-memory fallback
 */

import { getRedisCache, RedisError, type RedisCache } from './redis.js';

// In-memory cache fallback
const memoryCache = new Map<string, { value: any; expires?: number }>();

/**
 * Unified cache interface
 */
export interface Cache {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
}

/**
 * Memory cache implementation (fallback)
 */
class MemoryCache implements Cache {
  async get<T = any>(key: string): Promise<T | null> {
    const item = memoryCache.get(key);
    if (!item) return null;
    
    // Check expiration
    if (item.expires && Date.now() > item.expires) {
      memoryCache.delete(key);
      return null;
    }
    
    return item.value as T;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    const item: { value: any; expires?: number } = { value };
    
    if (ttlSeconds) {
      item.expires = Date.now() + (ttlSeconds * 1000);
    }
    
    memoryCache.set(key, item);
    return true;
  }

  async del(key: string): Promise<boolean> {
    return memoryCache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const item = memoryCache.get(key);
    if (!item) return false;
    
    // Check expiration
    if (item.expires && Date.now() > item.expires) {
      memoryCache.delete(key);
      return false;
    }
    
    return true;
  }

  async clear(): Promise<boolean> {
    memoryCache.clear();
    return true;
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple pattern matching for memory cache
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(memoryCache.keys()).filter(key => regex.test(key));
  }
}

/**
 * Redis cache wrapper
 */
class RedisCacheWrapper implements Cache {
  private redisCache: RedisCache;

  constructor(redisCache: RedisCache) {
    this.redisCache = redisCache;
  }

  async get<T = any>(key: string): Promise<T | null> {
    return await this.redisCache.get<T>(key);
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      await this.redisCache.set(key, value, ttlSeconds);
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.redisCache.del(key);
      return result > 0;
    } catch (error) {
      console.error('Redis del error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    return await this.redisCache.exists(key);
  }

  async clear(): Promise<boolean> {
    try {
      await this.redisCache.flushdb();
      return true;
    } catch (error) {
      console.error('Redis clear error:', error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.redisCache.keys(pattern);
  }
}

/**
 * Get cache instance with Redis primary and memory fallback
 */
export async function getCache(): Promise<Cache> {
  try {
    const redisCache = await getRedisCache();
    return new RedisCacheWrapper(redisCache);
  } catch (error) {
    if (error instanceof RedisError) {
      console.warn('Redis unavailable, using memory cache:', error.message);
    } else {
      console.warn('Cache initialization failed, using memory cache:', error);
    }
    return new MemoryCache();
  }
}

/**
 * Cache key utilities
 */
export const CacheKeys = {
  session: (token: string) => `session:${token}`,
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  todo: (id: string) => `todo:${id}`,
  userTodos: (userId: string) => `user:${userId}:todos`,
  todoList: (id: string) => `todolist:${id}`,
  userTodoLists: (userId: string) => `user:${userId}:todolists`,
} as const;

/**
 * Cache TTL constants (in seconds)
 */
export const CacheTTL = {
  session: 3600, // 1 hour
  user: 1800, // 30 minutes
  todo: 900, // 15 minutes
  todoList: 900, // 15 minutes
  shortTerm: 300, // 5 minutes
  mediumTerm: 1800, // 30 minutes
  longTerm: 3600, // 1 hour
} as const;

/**
 * Cached function wrapper
 */
export function cached<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  ttlSeconds: number = CacheTTL.mediumTerm
) {
  return async (...args: T): Promise<R> => {
    const cache = await getCache();
    const key = keyGenerator(...args);
    
    // Try cache first
    const cached = await cache.get<R>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function and cache result
    const result = await fn(...args);
    await cache.set(key, result, ttlSeconds);
    
    return result;
  };
}

/**
 * Cache invalidation utilities
 */
export class CacheInvalidator {
  private cache: Cache;

  constructor(cache: Cache) {
    this.cache = cache;
  }

  static async create(): Promise<CacheInvalidator> {
    const cache = await getCache();
    return new CacheInvalidator(cache);
  }

  /**
   * Invalidate user-related cache entries
   */
  async invalidateUser(userId: string): Promise<void> {
    const patterns = [
      CacheKeys.user(userId),
      CacheKeys.userTodos(userId),
      CacheKeys.userTodoLists(userId),
      `${CacheKeys.user(userId)}:*`,
    ];

    for (const pattern of patterns) {
      try {
        if (pattern.includes('*')) {
          const keys = await this.cache.keys(pattern);
          await Promise.all(keys.map(key => this.cache.del(key)));
        } else {
          await this.cache.del(pattern);
        }
      } catch (error) {
        console.warn(`Failed to invalidate cache pattern ${pattern}:`, error);
      }
    }
  }

  /**
   * Invalidate todo-related cache entries
   */
  async invalidateTodo(todoId: string, userId?: string): Promise<void> {
    const keys = [CacheKeys.todo(todoId)];
    
    if (userId) {
      keys.push(CacheKeys.userTodos(userId));
    }

    await Promise.all(keys.map(key => this.cache.del(key)));
  }

  /**
   * Invalidate todo list-related cache entries
   */
  async invalidateTodoList(todoListId: string, userId?: string): Promise<void> {
    const keys = [CacheKeys.todoList(todoListId)];
    
    if (userId) {
      keys.push(CacheKeys.userTodoLists(userId));
    }

    await Promise.all(keys.map(key => this.cache.del(key)));
  }

  /**
   * Invalidate session cache
   */
  async invalidateSession(sessionToken: string): Promise<void> {
    await this.cache.del(CacheKeys.session(sessionToken));
  }
}

/**
 * Global cache invalidator instance
 */
export async function getCacheInvalidator(): Promise<CacheInvalidator> {
  return await CacheInvalidator.create();
}

// Export everything from redis.ts for direct access if needed
export * from './redis.js';