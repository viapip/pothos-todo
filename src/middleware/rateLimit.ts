import type { H3Event } from 'h3';
import { CacheManager } from '@/infrastructure/cache/CacheManager';
import { RateLimitError } from '@/errors';
import { logger } from '@/logger';
import { hash } from 'ohash';

export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed within the window
   */
  limit: number;
  
  /**
   * Time window in seconds
   */
  window: number;
  
  /**
   * Key generator function - determines how to identify unique clients
   */
  keyGenerator?: (event: H3Event) => string;
  
  /**
   * Skip function - return true to skip rate limiting for this request
   */
  skip?: (event: H3Event) => boolean | Promise<boolean>;
  
  /**
   * Message to return when rate limit is exceeded
   */
  message?: string;
  
  /**
   * Headers to set on the response
   */
  headers?: boolean;
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(event: H3Event): string {
  const ip = event.node.req.socket.remoteAddress || 'unknown';
  const forwardedFor = event.node.req.headers['x-forwarded-for'];
  const realIp = event.node.req.headers['x-real-ip'];
  
  // Use the most reliable IP address available
  const clientIp = forwardedFor || realIp || ip;
  
  return `ratelimit:${clientIp}`;
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    limit,
    window,
    keyGenerator = defaultKeyGenerator,
    skip,
    message,
    headers = true,
  } = options;

  return async function rateLimitMiddleware(event: H3Event): Promise<void> {
    // Check if we should skip rate limiting
    if (skip && await skip(event)) {
      return;
    }

    const cache = CacheManager.getInstance();
    const key = keyGenerator(event);
    
    // Get current request count
    const current = await cache.get<number>(key) || 0;
    const remaining = Math.max(0, limit - current - 1);
    const resetTime = Date.now() + (window * 1000);

    // Set rate limit headers
    if (headers) {
      event.node.res.setHeader('X-RateLimit-Limit', limit.toString());
      event.node.res.setHeader('X-RateLimit-Remaining', remaining.toString());
      event.node.res.setHeader('X-RateLimit-Reset', Math.floor(resetTime / 1000).toString());
    }

    // Check if limit exceeded
    if (current >= limit) {
      if (headers) {
        event.node.res.setHeader('Retry-After', window.toString());
      }
      
      logger.warn('Rate limit exceeded', {
        key,
        limit,
        current,
        window,
      });

      throw new RateLimitError(limit, window, window);
    }

    // Increment counter
    const newCount = current + 1;
    await cache.set(key, newCount, { ttl: window });

    // Update remaining header after increment
    if (headers) {
      event.node.res.setHeader('X-RateLimit-Remaining', (limit - newCount).toString());
    }
  };
}

/**
 * GraphQL-specific rate limiter that accounts for query complexity
 */
export function createGraphQLRateLimiter(baseOptions: RateLimitOptions) {
  return createRateLimiter({
    ...baseOptions,
    keyGenerator: (event: H3Event) => {
      // For GraphQL, we might want to rate limit by user + operation
      const user = (event.context as any)?.user;
      const ip = defaultKeyGenerator(event);
      
      if (user) {
        // Authenticated users get their own rate limit bucket
        return `ratelimit:user:${user.id}`;
      }
      
      // Anonymous users are rate limited by IP
      return ip;
    },
    skip: async (event: H3Event) => {
      // Skip rate limiting for introspection queries in development
      if (process.env.NODE_ENV === 'development') {
        const body = await readBody(event);
        if (body?.query?.includes('__schema')) {
          return true;
        }
      }
      return false;
    },
  });
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  // Strict rate limit for authentication endpoints
  auth: createRateLimiter({
    limit: 5,
    window: 300, // 5 minutes
    keyGenerator: (event) => {
      // Rate limit by IP + endpoint
      const ip = defaultKeyGenerator(event);
      const path = event.node.req.url || '';
      return `${ip}:${hash(path)}`;
    },
  }),

  // Standard API rate limit
  api: createRateLimiter({
    limit: 100,
    window: 60, // 1 minute
  }),

  // Relaxed rate limit for static assets
  static: createRateLimiter({
    limit: 1000,
    window: 60, // 1 minute
    headers: false,
  }),

  // GraphQL rate limit
  graphql: createGraphQLRateLimiter({
    limit: 50,
    window: 60, // 1 minute
  }),
};

// Helper to read body safely
async function readBody(event: H3Event): Promise<any> {
  try {
    return await readBody(event);
  } catch {
    return null;
  }
}