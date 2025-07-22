/**
 * Cache Integration for GraphQL Server
 * Integrates multi-level caching with GraphQL Yoga and Pothos
 */

import { logger } from '../../logger.js';
import { CacheManager } from './manager.js';
import { createLoaderContext, getLoaderStats } from './dataloaders.js';
import { initializeRedis } from './redis-client.js';
import { createCacheConfig, validateCacheConfig } from './config.js';
import type { 
  CachedGraphQLContext,
  LoaderContext,
  CacheConfig,
  CacheHint
} from './types.js';
import type { Context } from '../../api/schema/builder.js';

// ================================
// Cache Context Extension
// ================================

export interface CacheContextExtension {
  cache: CacheManager;
  loaders: LoaderContext;
  cacheHints: CacheHint[];
}

export type ExtendedContext = Context & CacheContextExtension;

// ================================
// Cache Manager Singleton
// ================================

let cacheManager: CacheManager | null = null;
let loaderContext: LoaderContext | null = null;

export async function initializeCacheManager(): Promise<void> {
  try {
    logger.info('Initializing cache manager');

    // Create and validate configuration
    const config = createCacheConfig();
    const configErrors = validateCacheConfig(config);
    
    if (configErrors.length > 0) {
      logger.error('Cache configuration validation failed', { errors: configErrors });
      throw new Error(`Cache configuration invalid: ${configErrors.join(', ')}`);
    }

    // Initialize Redis if L3 caching is enabled
    if (config.levels.l3.enabled) {
      await initializeRedis(config);
      logger.info('Redis cache initialized');
    }

    // Create cache manager
    cacheManager = new CacheManager(config);

    // Create DataLoader context
    loaderContext = createLoaderContext(config);

    logger.info('Cache manager initialization completed', {
      levels: {
        l1: config.levels.l1.enabled,
        l2: config.levels.l2.enabled,
        l3: config.levels.l3.enabled,
      },
    });

  } catch (error) {
    logger.error('Failed to initialize cache manager', { error });
    throw error;
  }
}

export function getCacheManager(): CacheManager {
  if (!cacheManager) {
    throw new Error('Cache manager not initialized. Call initializeCacheManager() first.');
  }
  return cacheManager;
}

export function getLoaderContext(): LoaderContext {
  if (!loaderContext) {
    throw new Error('Loader context not initialized. Call initializeCacheManager() first.');
  }
  return loaderContext;
}

// ================================
// GraphQL Context Factory
// ================================

export function createCachedContext(baseContext: Context): ExtendedContext {
  // Create fresh loader context for each request
  const requestLoaderContext = createLoaderContext();
  
  return {
    ...baseContext,
    cache: getCacheManager(),
    loaders: requestLoaderContext,
    cacheHints: [],
  };
}

// ================================
// Cache Middleware for GraphQL Yoga
// ================================

export function createCacheMiddleware() {
  return {
    onRequest: async (context: any) => {
      // Initialize request-level cache hints
      context.cacheHints = [];
      
      logger.debug('Cache middleware: Request started', {
        query: context.request.query?.slice(0, 100),
      });
    },

    onResponse: async (context: any) => {
      // Process cache hints for HTTP caching
      if (context.cacheHints && context.cacheHints.length > 0) {
        const minTTL = Math.min(...context.cacheHints.map((h: CacheHint) => h.maxAge));
        const allTags = Array.from(new Set(
          context.cacheHints.flatMap((h: CacheHint) => h.tags || [])
        ));

        // Set cache control headers
        if (minTTL > 0) {
          context.response.headers.set('Cache-Control', `max-age=${minTTL}, public`);
          
          if (allTags.length > 0) {
            context.response.headers.set('Cache-Tags', allTags.join(','));
          }
        }

        logger.debug('Cache middleware: Response headers set', {
          maxAge: minTTL,
          tags: allTags,
          hints: context.cacheHints.length,
        });
      }

      // Clear request-level DataLoader cache
      if (context.loaders && typeof context.loaders.clearAll === 'function') {
        context.loaders.clearAll();
      }
    },

    onError: async (context: any, error: any) => {
      logger.error('Cache middleware: Request error', {
        error: error.message,
        query: context.request.query?.slice(0, 100),
      });

      // Clear cache on errors to prevent stale data
      if (context.loaders && typeof context.loaders.clearAll === 'function') {
        context.loaders.clearAll();
      }
    },
  };
}

// ================================
// Pothos Plugin for Cache Integration
// ================================

export function createCachePlugin() {
  return {
    name: 'cache-plugin',
    onSchemaCreate: (schema: any) => {
      logger.info('Cache plugin: Schema created with caching support');
      return schema;
    },
    
    onContextCreate: (context: any) => {
      // Extend context with cache capabilities
      return createCachedContext(context);
    },
  };
}

// ================================
// Cache Statistics and Health
// ================================

export function getCacheStats() {
  if (!cacheManager || !loaderContext) {
    return {
      initialized: false,
      error: 'Cache not initialized',
    };
  }

  try {
    const cacheStats = cacheManager.getStats();
    const loaderStats = getLoaderStats(loaderContext);

    return {
      initialized: true,
      cache: cacheStats,
      loaders: loaderStats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      initialized: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getCacheHealth() {
  if (!cacheManager) {
    return {
      healthy: false,
      reason: 'Cache manager not initialized',
    };
  }

  try {
    // Test basic cache operations
    const testKey = `health_check:${Date.now()}`;
    const testValue = { test: true };

    await cacheManager.set(testKey, testValue, 10); // 10 second TTL
    const result = await cacheManager.get(testKey);
    await cacheManager.delete(testKey);

    return {
      healthy: result.hit && result.value !== null,
      operations: {
        set: true,
        get: result.hit,
        delete: true,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

// ================================
// Cleanup and Shutdown
// ================================

export async function shutdownCache(): Promise<void> {
  try {
    logger.info('Shutting down cache manager');

    if (cacheManager) {
      await cacheManager.destroy();
      cacheManager = null;
    }

    loaderContext = null;

    logger.info('Cache manager shutdown completed');
  } catch (error) {
    logger.error('Error during cache shutdown', { error });
    throw error;
  }
}

