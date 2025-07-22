/**
 * Cache Configuration Factory
 * Centralized cache configuration with environment-based settings
 */

import type { CacheConfig } from './types.js';

// ================================
// Default Configuration
// ================================

export function createDefaultCacheConfig(): CacheConfig {
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

  return {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'pothos:cache:',
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      lazyConnect: true,
      family: 4,
      keepAlive: 30000,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    },

    levels: {
      l1: {
        enabled: true,
        maxBatchSize: parseInt(process.env.CACHE_L1_MAX_BATCH_SIZE || '100', 10),
        batchScheduleFn: setImmediate,
        maxCacheSize: parseInt(process.env.CACHE_L1_MAX_SIZE || '1000', 10),
      },

      l2: {
        enabled: true,
        maxSize: parseInt(process.env.CACHE_L2_MAX_SIZE || '10000', 10),
        ttl: parseInt(process.env.CACHE_L2_TTL || '300', 10), // 5 minutes
        checkInterval: parseInt(process.env.CACHE_L2_CHECK_INTERVAL || '60', 10), // 1 minute
        deleteOnExpire: true,
      },

      l3: {
        enabled: process.env.REDIS_ENABLED !== 'false',
        defaultTTL: parseInt(process.env.CACHE_L3_DEFAULT_TTL || '3600', 10), // 1 hour
        maxRetries: 3,
        keyPatterns: {
          user: {
            pattern: 'user:*',
            ttl: 1800, // 30 minutes
            tags: ['users'],
            invalidateOn: ['user:updated', 'user:deleted'],
          },
          todo: {
            pattern: 'todo:*',
            ttl: 900, // 15 minutes
            tags: ['todos'],
            invalidateOn: ['todo:created', 'todo:updated', 'todo:deleted'],
          },
          todoList: {
            pattern: 'todoList:*',
            ttl: 1800, // 30 minutes
            tags: ['todoLists'],
            invalidateOn: ['todoList:updated', 'todoList:deleted'],
          },
          query: {
            pattern: 'query:*',
            ttl: 600, // 10 minutes
            tags: ['queries'],
            invalidateOn: ['data:changed'],
          },
        },
        compression: {
          enabled: isProduction,
          algorithm: 'gzip',
          threshold: 1024, // 1KB
        },
      },
    },

    invalidation: {
      enabled: true,
      strategies: {
        timeBasedInvalidation: true,
        tagBasedInvalidation: true,
        eventBasedInvalidation: true,
        versionBasedInvalidation: false,
      },
      patterns: {
        userUpdate: {
          events: ['user:updated'],
          keys: ['user:*'],
          tags: ['users'],
          cascade: true,
        },
        todoUpdate: {
          events: ['todo:created', 'todo:updated', 'todo:deleted'],
          keys: ['todo:*', 'todosByUser:*', 'todosByList:*'],
          tags: ['todos'],
          cascade: true,
        },
        todoListUpdate: {
          events: ['todoList:updated', 'todoList:deleted'],
          keys: ['todoList:*', 'todosByList:*', 'usersByTodoList:*'],
          tags: ['todoLists'],
          cascade: true,
        },
      },
    },

    monitoring: {
      enabled: true,
      metricsPrefix: 'pothos_cache',
      detailedMetrics: !isProduction, // More detailed metrics in dev
      slowQueryThreshold: isDevelopment ? 100 : 1000, // 100ms dev, 1s prod
    },
  };
}

// ================================
// Environment-Specific Configurations
// ================================

export function createDevelopmentCacheConfig(): CacheConfig {
  const config = createDefaultCacheConfig();

  // Development optimizations
  config.levels.l2.ttl = 60; // Shorter TTL for development
  config.levels.l3.defaultTTL = 300; // Shorter TTL for development
  config.monitoring.detailedMetrics = true;
  config.invalidation.strategies.timeBasedInvalidation = false; // Disable for faster dev

  return config;
}

export function createProductionCacheConfig(): CacheConfig {
  const config = createDefaultCacheConfig();

  // Production optimizations
  config.levels.l2.maxSize = 50000; // Larger cache
  config.levels.l2.ttl = 900; // Longer TTL
  config.levels.l3.defaultTTL = 7200; // 2 hours
  config.levels.l3.compression.enabled = true;
  config.monitoring.detailedMetrics = false; // Less overhead

  // Stricter retry policies
  config.redis.maxRetriesPerRequest = 2;
  config.levels.l3.maxRetries = 2;

  return config;
}

export function createTestCacheConfig(): CacheConfig {
  const config = createDefaultCacheConfig();

  // Test optimizations
  config.levels.l2.ttl = 10; // Very short TTL
  config.levels.l3.defaultTTL = 30;
  config.levels.l3.enabled = false; // Disable Redis for tests
  config.invalidation.enabled = false; // Disable for simpler tests
  config.monitoring.enabled = false; // No metrics in tests

  return config;
}

// ================================
// Cache Policy Templates
// ================================

export const CACHE_POLICIES = {
  // Short-lived data that changes frequently
  REALTIME: {
    strategy: 'cache-first' as const,
    ttl: 30, // 30 seconds
    staleWhileRevalidate: 60,
    tags: ['realtime'],
    invalidateOn: ['data:realtime_update'],
  },

  // User profile data - relatively stable
  USER_PROFILE: {
    strategy: 'cache-first' as const,
    ttl: 1800, // 30 minutes
    tags: ['users'],
    invalidateOn: ['user:updated', 'user:profile_changed'],
  },

  // Todo data - changes moderately
  TODO_DATA: {
    strategy: 'stale-while-revalidate' as const,
    ttl: 600, // 10 minutes
    staleWhileRevalidate: 1200, // 20 minutes
    tags: ['todos'],
    invalidateOn: ['todo:created', 'todo:updated', 'todo:deleted'],
  },

  // Static configuration data - very stable
  STATIC_CONFIG: {
    strategy: 'cache-first' as const,
    ttl: 86400, // 24 hours
    tags: ['config'],
    invalidateOn: ['config:updated'],
  },

  // Expensive aggregations - cache aggressively
  EXPENSIVE_QUERY: {
    strategy: 'cache-first' as const,
    ttl: 3600, // 1 hour
    staleWhileRevalidate: 7200, // 2 hours
    tags: ['aggregations'],
    invalidateOn: ['data:significant_change'],
  },

  // Network-dependent data - fallback to cache on errors
  EXTERNAL_API: {
    strategy: 'network-first' as const,
    ttl: 1800, // 30 minutes
    tags: ['external'],
    invalidateOn: ['external:api_updated'],
  },
} as const;

// ================================
// Key Pattern Templates
// ================================

export const CACHE_KEYS = {
  user: (id: string) => `user:${id}`,
  userProfile: (id: string) => `user:profile:${id}`,
  userTodos: (id: string) => `user:todos:${id}`,
  
  todo: (id: string) => `todo:${id}`,
  todoList: (id: string) => `todoList:${id}`,
  todosByList: (listId: string) => `todosByList:${listId}`,
  
  query: (hash: string) => `query:${hash}`,
  queryResult: (operationName: string, hash: string) => `query:${operationName}:${hash}`,
  
  session: (sessionId: string) => `session:${sessionId}`,
  
  // Aggregation keys
  userStats: (id: string) => `stats:user:${id}`,
  todoListStats: (id: string) => `stats:todoList:${id}`,
  globalStats: () => `stats:global`,
  
  // Temporary keys for background processing
  lock: (resource: string) => `lock:${resource}`,
  job: (jobId: string) => `job:${jobId}`,
} as const;

// ================================
// Configuration Factory
// ================================

export function createCacheConfig(): CacheConfig {
  const environment = process.env.NODE_ENV || 'development';

  switch (environment) {
    case 'production':
      return createProductionCacheConfig();
    case 'test':
      return createTestCacheConfig();
    case 'development':
    default:
      return createDevelopmentCacheConfig();
  }
}

// ================================
// Validation
// ================================

export function validateCacheConfig(config: CacheConfig): string[] {
  const errors: string[] = [];

  // Validate Redis configuration
  if (config.levels.l3.enabled) {
    if (!config.redis.host) {
      errors.push('Redis host is required when L3 cache is enabled');
    }
    if (!config.redis.port || config.redis.port <= 0) {
      errors.push('Valid Redis port is required when L3 cache is enabled');
    }
  }

  // Validate cache sizes
  if (config.levels.l1.maxBatchSize <= 0) {
    errors.push('L1 cache max batch size must be positive');
  }
  if (config.levels.l2.maxSize <= 0) {
    errors.push('L2 cache max size must be positive');
  }

  // Validate TTL values
  if (config.levels.l2.ttl < 0) {
    errors.push('L2 cache TTL must be non-negative');
  }
  if (config.levels.l3.defaultTTL < 0) {
    errors.push('L3 cache default TTL must be non-negative');
  }

  // Validate monitoring configuration
  if (config.monitoring.slowQueryThreshold <= 0) {
    errors.push('Slow query threshold must be positive');
  }

  return errors;
}

// ================================
// Export Utilities
// ================================

export type {
  CacheConfig,
  CachePolicy,
} from './types.js';