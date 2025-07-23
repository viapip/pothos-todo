import { defineEventHandler, getHeaders, setHeaders, createError } from 'h3';
import { apiKeyManager } from './ApiKeyManager.js';
import { logger } from '@/logger.js';
import type { ApiKey } from './ApiKeyManager.js';

export interface ApiKeyContext {
  apiKey?: ApiKey;
  rateLimitInfo?: {
    allowed: boolean;
    remaining: number;
    resetTime: Date;
    limit: number;
  };
}

/**
 * Middleware for API key authentication and rate limiting
 */
export function createApiKeyMiddleware() {
  return defineEventHandler(async (event) => {
    const headers = getHeaders(event);
    const apiKeyHeader = headers['x-api-key'] || headers['authorization'];

    if (!apiKeyHeader) {
      return; // No API key provided, continue without API key context
    }

    // Extract API key from header
    let apiKeyValue: string;
    if (apiKeyHeader.startsWith('Bearer ')) {
      apiKeyValue = apiKeyHeader.substring(7);
    } else if (apiKeyHeader.startsWith('ApiKey ')) {
      apiKeyValue = apiKeyHeader.substring(7);
    } else {
      apiKeyValue = apiKeyHeader;
    }

    try {
      // Validate API key
      const apiKey = await apiKeyManager.validateApiKey(apiKeyValue);

      if (!apiKey) {
        logger.warn('Invalid API key attempted', {
          keyPrefix: apiKeyValue.substring(0, 8),
          ip: event.node.req.socket.remoteAddress,
          userAgent: headers['user-agent'],
        });

        // Set rate limit headers for invalid key
        setHeaders(event, {
          'X-RateLimit-Limit': '0',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date().toISOString(),
        });

        return;
      }

      // Check rate limits
      const rateLimitInfo = await apiKeyManager.checkRateLimit(
        apiKey,
        event.node.req.socket.remoteAddress
      );

      // Set rate limit headers
      setHeaders(event, {
        'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
        'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
        'X-RateLimit-Reset': rateLimitInfo.resetTime.toISOString(),
      });

      if (!rateLimitInfo.allowed) {
        logger.warn('API key rate limit exceeded', {
          keyId: apiKey.id,
          userId: apiKey.userId,
          ip: event.node.req.socket.remoteAddress,
        });

        throw createError({
          statusCode: 429,
          statusMessage: 'Too Many Requests',
          data: {
            error: 'Rate limit exceeded',
            resetTime: rateLimitInfo.resetTime,
            limit: rateLimitInfo.limit,
          },
        });
      }

      // Add API key context to event
      event.context.apiKey = apiKey;
      event.context.rateLimitInfo = rateLimitInfo;

      logger.debug('API key authenticated', {
        keyId: apiKey.id,
        userId: apiKey.userId,
        scopes: apiKey.scopes,
        remaining: rateLimitInfo.remaining,
      });

    } catch (error) {
      if (error instanceof Error && 'statusCode' in error && error.statusCode === 429) {
        throw error;
      }

      logger.error('API key middleware error', {
        error,
        keyPrefix: apiKeyValue.substring(0, 8),
      });
    }
  });
}

/**
 * Check if the current request has a valid API key with required scopes
 */
export function requireApiKeyScopes(requiredScopes: string[]) {
  return defineEventHandler(async (event) => {
    const apiKey = event.context.apiKey as ApiKey | undefined;

    if (!apiKey) {
      throw createError({
        statusCode: 401,
        statusMessage: 'API key required',
        data: { error: 'Valid API key required for this endpoint' },
      });
    }

    // Check if API key has required scopes
    const hasRequiredScopes = requiredScopes.every(scope =>
      apiKey.scopes.includes(scope) || apiKey.scopes.includes('*')
    );

    if (!hasRequiredScopes) {
      logger.warn('Insufficient API key scopes', {
        keyId: apiKey.id,
        requiredScopes,
        availableScopes: apiKey.scopes,
      });

      throw createError({
        statusCode: 403,
        statusMessage: 'Insufficient Permissions',
        data: {
          error: 'API key does not have required scopes',
          required: requiredScopes,
          available: apiKey.scopes,
        },
      });
    }
  });
}

/**
 * Create an API key scoped for specific operations
 */
export const API_KEY_SCOPES = {
  // Todo operations
  TODO_READ: 'todo:read',
  TODO_WRITE: 'todo:write',
  TODO_DELETE: 'todo:delete',

  // User operations
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',

  // Admin operations
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write',

  // Metrics and monitoring
  METRICS_READ: 'metrics:read',

  // AI operations
  AI_CHAT: 'ai:chat',
  AI_EMBEDDINGS: 'ai:embeddings',

  // All permissions
  ALL: '*',
} as const;

/**
 * Utility to check scope permissions
 */
export function hasScope(apiKey: ApiKey | undefined, scope: string): boolean {
  if (!apiKey) return false;
  return apiKey.scopes.includes(scope) || apiKey.scopes.includes('*');
}