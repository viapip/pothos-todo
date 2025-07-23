import type { SchemaBuilder } from '../builder.js';
import { performanceMonitor } from '@/infrastructure/telemetry/PerformanceMonitor.js';
import { tracingMiddleware } from '@/infrastructure/telemetry/TracingMiddleware.js';
import { logger } from '@/logger.js';
import type { GraphQLResolveInfo } from 'graphql';
import { CacheManager } from '@/infrastructure/cache/CacheManager.js';
import { hash } from 'ohash';

// Define performance field options interface
export interface PerformanceFieldOptions {
  cache?: {
    ttl?: number;
    scope?: 'PUBLIC' | 'PRIVATE';
    key?: string;
  };
  trace?: {
    enabled?: boolean;
    name?: string;
  };
  rateLimit?: {
    limit?: number;
    window?: number;
    keyType?: 'ip' | 'user' | 'custom';
  };
  timeout?: number;
  complexity?: {
    value?: number;
    multipliers?: string[];
  };
}

/**
 * Pothos plugin for performance monitoring and optimization
 */
export const performancePlugin = (
  builder: SchemaBuilder
) => {
  // Store performance options in a WeakMap
  const fieldOptionsMap = new WeakMap<any, PerformanceFieldOptions>();

  // Add performance field method to builder
  const originalField = builder.objectField;
  builder.objectField = function (this: any, ref: any, name: string, field: any) {
    // Store performance options if provided
    if (field.extensions?.performance) {
      fieldOptionsMap.set(field, field.extensions.performance);
    }

    // Call original method
    return originalField.call(this, ref, name, field);
  };

  // Override wrapResolve to add performance features
  const originalWrapResolve = builder.prismaObjectField;
  builder.prismaObjectField = function (resolver: any, fieldConfig: any) {
    let wrappedResolver = resolver;

    // Get performance options from extensions
    const perfOptions = fieldConfig.extensions?.performance as PerformanceFieldOptions;

    if (perfOptions) {
      // Apply caching
      if (perfOptions.cache) {
        wrappedResolver = wrapWithCache(wrappedResolver, perfOptions.cache);
      }

      // Apply rate limiting
      if (perfOptions.rateLimit) {
        wrappedResolver = wrapWithRateLimit(wrappedResolver, perfOptions.rateLimit);
      }

      // Apply timeout
      if (perfOptions.timeout) {
        wrappedResolver = wrapWithTimeout(wrappedResolver, perfOptions.timeout);
      }

      // Apply tracing
      if (perfOptions.trace?.enabled !== false) {
        const traceName = perfOptions.trace?.name || `${fieldConfig.parentType}.${fieldConfig.name}`;
        wrappedResolver = tracingMiddleware.traceAsync(
          traceName,
          wrappedResolver,
          {
            attributes: {
              'graphql.type': fieldConfig.parentType,
              'graphql.field': fieldConfig.name,
            },
          }
        );
      }
    }

    // Call original wrapResolve with potentially wrapped resolver
    return originalWrapResolve.call(this, wrappedResolver, fieldConfig, fieldConfig.args);
  };
};

// Helper functions for wrapping resolvers
function wrapWithCache(resolve: any, cacheConfig: NonNullable<PerformanceFieldOptions['cache']>) {
  return async (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {
    const cacheManager = CacheManager.getInstance();

    const fieldKey = `${info.parentType.name}:${info.fieldName}`;
    const argsHash = hash(args);
    const userKey = cacheConfig.scope === 'PRIVATE' && context.user ? `:user:${context.user.id}` : '';
    const cacheKey = cacheConfig.key || `gql:${fieldKey}:${argsHash}${userKey}`;

    // Try cache
    const cached = await cacheManager.get(cacheKey);
    if (cached !== null) {
      performanceMonitor.recordCacheHit(true, cacheKey);
      return cached;
    }

    performanceMonitor.recordCacheHit(false, cacheKey);

    // Execute resolver
    const result = await resolve(parent, args, context, info);

    // Cache result
    if (result !== null && result !== undefined) {
      await cacheManager.set(cacheKey, result, { ttl: cacheConfig.ttl || 300 });
    }

    return result;
  };
}

function wrapWithRateLimit(resolve: any, rateLimitConfig: NonNullable<PerformanceFieldOptions['rateLimit']>) {
  return async (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {
    const cacheManager = CacheManager.getInstance();

    let rateLimitKey: string;
    switch (rateLimitConfig.keyType || 'ip') {
      case 'user':
        if (!context.user) throw new Error('Rate limiting requires authentication');
        rateLimitKey = `ratelimit:${info.fieldName}:user:${context.user.id}`;
        break;
      case 'ip':
        const ip = context.h3Event?.node.req.socket.remoteAddress || 'unknown';
        rateLimitKey = `ratelimit:${info.fieldName}:ip:${ip}`;
        break;
      default:
        rateLimitKey = `ratelimit:${info.fieldName}:custom`;
    }

    const current = await cacheManager.get<number>(rateLimitKey) || 0;
    const limit = rateLimitConfig.limit || 10;
    if (current >= limit) {
      throw new Error(`Rate limit exceeded. Max ${limit} requests per ${rateLimitConfig.window || 60} seconds.`);
    }

    await cacheManager.set(rateLimitKey, current + 1, { ttl: rateLimitConfig.window || 60 });

    return resolve(parent, args, context, info);
  };
}

function wrapWithTimeout(resolve: any, timeout: number) {
  return async (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Field resolution timeout after ${timeout}ms`)), timeout);
    });

    try {
      return await Promise.race([
        resolve(parent, args, context, info),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.error('Field resolution timeout', {
          field: info.fieldName,
          parentType: info.parentType.name,
          timeout,
        });
      }
      throw error;
    }
  };
}

// Export performance-enhanced field builder
export function withPerformance<T>(options: T & { performance?: PerformanceFieldOptions }): T {
  return options;
}