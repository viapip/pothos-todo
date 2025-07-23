/**
 * Enhanced routing system using UnJS unrouter with middleware support
 * Provides flexible routing with validation, caching, and authentication
 */

import { createRouter, createApp, eventHandler, readBody, getQuery } from 'h3';
import { createRouter as createUnRouter } from 'unrouter';
import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { configManager } from '@/config/unjs-config.js';
import { z } from 'zod';
import type { H3Event, EventHandler } from 'h3';

export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  handler: EventHandler;
  middleware?: EventHandler[];
  validation?: {
    body?: string | z.ZodSchema;
    query?: string | z.ZodSchema;
    params?: string | z.ZodSchema;
  };
  auth?: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
  };
  cache?: {
    enabled?: boolean;
    ttl?: number;
    key?: (event: H3Event) => string;
  };
  rateLimit?: {
    max: number;
    windowMs: number;
    keyGenerator?: (event: H3Event) => string;
  };
  description?: string;
  tags?: string[];
}

export interface MiddlewareOptions {
  name: string;
  order: number;
  global?: boolean;
  paths?: string[];
  exclude?: string[];
}

export interface RouteContext {
  user?: any;
  params: Record<string, string>;
  query: Record<string, any>;
  body?: any;
  metadata: Record<string, any>;
}

/**
 * Enhanced router with comprehensive middleware system
 */
export class UnJSRouter {
  private h3Router = createRouter();
  private unRouter = createUnRouter();
  private routes: Map<string, RouteDefinition> = new Map();
  private middlewares: Map<string, EventHandler> = new Map();
  private globalMiddlewares: EventHandler[] = [];
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private cacheStore: Map<string, { data: any; expiry: number }> = new Map();

  constructor() {
    this.setupDefaultMiddlewares();
    this.setupValidationSchemas();
  }

  /**
   * Setup default middleware
   */
  private setupDefaultMiddlewares(): void {
    // CORS middleware
    this.addMiddleware('cors', eventHandler(async (event) => {
      const config = configManager.getConfigValue('server.cors', {});
      
      if (config.enabled !== false) {
        setHeader(event, 'Access-Control-Allow-Origin', config.origin || '*');
        setHeader(event, 'Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
        setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Key');
        setHeader(event, 'Access-Control-Allow-Credentials', 'true');
      }

      // Handle preflight requests
      if (event.node.req.method === 'OPTIONS') {
        setResponseStatus(event, 200);
        return '';
      }
    }), { name: 'cors', order: 1, global: true });

    // Request logging middleware
    this.addMiddleware('requestLogger', eventHandler(async (event) => {
      const start = Date.now();
      const method = event.node.req.method;
      const url = event.node.req.url;
      const userAgent = getHeader(event, 'user-agent');
      const ip = getClientIP(event);

      logger.debug('Incoming request', { method, url, userAgent, ip });

      // Add response time to context
      event.context.startTime = start;
    }), { name: 'requestLogger', order: 2, global: true });

    // Response logging middleware
    this.addMiddleware('responseLogger', eventHandler(async (event) => {
      const originalSend = event.node.res.end;
      const startTime = event.context.startTime || Date.now();

      event.node.res.end = function(chunk?: any) {
        const duration = Date.now() - startTime;
        const statusCode = event.node.res.statusCode;
        
        logger.debug('Request completed', {
          method: event.node.req.method,
          url: event.node.req.url,
          statusCode,
          duration: `${duration}ms`
        });

        return originalSend.call(this, chunk);
      };
    }), { name: 'responseLogger', order: 10, global: true });

    // Error handling middleware
    this.addMiddleware('errorHandler', eventHandler(async (event) => {
      try {
        // This middleware doesn't do anything by itself
        // Error handling is done in the route wrapper
      } catch (error) {
        logger.error('Unhandled error in middleware', { error });
        throw error;
      }
    }), { name: 'errorHandler', order: 100, global: true });
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    // Route params schema
    const paramsSchema = z.record(z.string());
    validationService.registerSchema('routeParams', paramsSchema);

    // Common query schema
    const querySchema = z.object({
      page: z.coerce.number().min(1).optional(),
      limit: z.coerce.number().min(1).max(100).optional(),
      sort: z.string().optional(),
      filter: z.string().optional(),
    });
    validationService.registerSchema('commonQuery', querySchema);
  }

  /**
   * Add middleware
   */
  addMiddleware(
    name: string, 
    handler: EventHandler, 
    options: Partial<MiddlewareOptions> = {}
  ): void {
    const middleware = {
      name,
      order: 50,
      global: false,
      paths: [],
      exclude: [],
      ...options
    };

    this.middlewares.set(name, handler);

    if (middleware.global) {
      this.globalMiddlewares.push(handler);
      // Sort by order
      this.globalMiddlewares.sort((a: any, b: any) => (a.order || 50) - (b.order || 50));
    }

    logger.debug('Middleware added', { name, global: middleware.global, order: middleware.order });
  }

  /**
   * Add route
   */
  addRoute(route: RouteDefinition): void {
    const routeKey = `${route.method}:${route.path}`;
    this.routes.set(routeKey, route);

    // Create wrapped handler with middleware
    const wrappedHandler = this.createWrappedHandler(route);

    // Add to H3 router
    switch (route.method) {
      case 'GET':
        this.h3Router.get(route.path, wrappedHandler);
        break;
      case 'POST':
        this.h3Router.post(route.path, wrappedHandler);
        break;
      case 'PUT':
        this.h3Router.put(route.path, wrappedHandler);
        break;
      case 'DELETE':
        this.h3Router.delete(route.path, wrappedHandler);
        break;
      case 'PATCH':
        this.h3Router.patch(route.path, wrappedHandler);
        break;
      default:
        this.h3Router.use(route.path, wrappedHandler);
    }

    // Add to unrouter for flexible matching
    this.unRouter.add(route.path, wrappedHandler, [route.method.toLowerCase()]);

    logger.debug('Route added', { 
      method: route.method, 
      path: route.path,
      hasValidation: !!route.validation,
      requiresAuth: !!route.auth?.required
    });
  }

  /**
   * Create wrapped handler with middleware chain
   */
  private createWrappedHandler(route: RouteDefinition): EventHandler {
    return eventHandler(async (event) => {
      try {
        // Apply global middlewares
        for (const middleware of this.globalMiddlewares) {
          await middleware(event);
        }

        // Apply route-specific middlewares
        if (route.middleware) {
          for (const middleware of route.middleware) {
            await middleware(event);
          }
        }

        // Check rate limiting
        if (route.rateLimit && !this.checkRateLimit(event, route.rateLimit)) {
          throw createError({
            statusCode: 429,
            statusMessage: 'Too Many Requests',
            data: { error: 'Rate limit exceeded' }
          });
        }

        // Check cache
        if (route.cache?.enabled && route.method === 'GET') {
          const cached = this.getFromCache(event, route.cache);
          if (cached) {
            setHeader(event, 'X-Cache', 'HIT');
            return cached;
          }
        }

        // Authentication check
        if (route.auth?.required) {
          await this.checkAuthentication(event, route.auth);
        }

        // Validation
        if (route.validation) {
          await this.validateRequest(event, route.validation);
        }

        // Execute main handler
        const result = await route.handler(event);

        // Cache result if enabled
        if (route.cache?.enabled && route.method === 'GET' && result) {
          this.setCache(event, route.cache, result);
          setHeader(event, 'X-Cache', 'MISS');
        }

        return result;

      } catch (error) {
        return this.handleError(event, error);
      }
    });
  }

  /**
   * Validate request
   */
  private async validateRequest(
    event: H3Event,
    validation: RouteDefinition['validation']
  ): Promise<void> {
    if (!validation) return;

    const errors: any[] = [];

    // Validate body
    if (validation.body) {
      try {
        const body = await readBody(event);
        const schema = typeof validation.body === 'string'
          ? validationService.schemas.get(validation.body)
          : validation.body;

        if (schema) {
          const result = await schema.parseAsync(body);
          event.context.validatedBody = result;
        }
      } catch (error) {
        errors.push({ field: 'body', error: String(error) });
      }
    }

    // Validate query
    if (validation.query) {
      try {
        const query = getQuery(event);
        const schema = typeof validation.query === 'string'
          ? validationService.schemas.get(validation.query)
          : validation.query;

        if (schema) {
          const result = await schema.parseAsync(query);
          event.context.validatedQuery = result;
        }
      } catch (error) {
        errors.push({ field: 'query', error: String(error) });
      }
    }

    // Validate params
    if (validation.params) {
      try {
        const params = event.context.params || {};
        const schema = typeof validation.params === 'string'
          ? validationService.schemas.get(validation.params)
          : validation.params;

        if (schema) {
          const result = await schema.parseAsync(params);
          event.context.validatedParams = result;
        }
      } catch (error) {
        errors.push({ field: 'params', error: String(error) });
      }
    }

    if (errors.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation Error',
        data: { errors }
      });
    }
  }

  /**
   * Check authentication
   */
  private async checkAuthentication(
    event: H3Event,
    auth: RouteDefinition['auth']
  ): Promise<void> {
    if (!auth?.required) return;

    const token = getHeader(event, 'authorization')?.replace('Bearer ', '') ||
                  getCookie(event, 'auth-token') ||
                  getQuery(event).token as string;

    if (!token) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        data: { error: 'Authentication token required' }
      });
    }

    // Simplified token validation - in real app would verify JWT
    if (token.length < 10) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        data: { error: 'Invalid authentication token' }
      });
    }

    // Mock user object - in real app would decode from JWT
    const user = {
      id: 'user123',
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['read', 'write']
    };

    // Check roles
    if (auth.roles && !auth.roles.some(role => user.roles.includes(role))) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: { error: 'Insufficient role permissions' }
      });
    }

    // Check permissions
    if (auth.permissions && !auth.permissions.some(perm => user.permissions.includes(perm))) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: { error: 'Insufficient permissions' }
      });
    }

    event.context.user = user;
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(
    event: H3Event,
    rateLimit: RouteDefinition['rateLimit']
  ): boolean {
    if (!rateLimit) return true;

    const key = rateLimit.keyGenerator 
      ? rateLimit.keyGenerator(event)
      : getClientIP(event) || 'unknown';

    const now = Date.now();
    const limit = this.rateLimitStore.get(key);

    if (!limit || now > limit.resetTime) {
      this.rateLimitStore.set(key, { 
        count: 1, 
        resetTime: now + rateLimit.windowMs 
      });
      return true;
    }

    if (limit.count >= rateLimit.max) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Get from cache
   */
  private getFromCache(
    event: H3Event,
    cache: RouteDefinition['cache']
  ): any | null {
    if (!cache?.enabled) return null;

    const key = cache.key 
      ? cache.key(event)
      : `${event.node.req.method}:${event.node.req.url}`;

    const cached = this.cacheStore.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    return null;
  }

  /**
   * Set cache
   */
  private setCache(
    event: H3Event,
    cache: RouteDefinition['cache'],
    data: any
  ): void {
    if (!cache?.enabled) return;

    const key = cache.key 
      ? cache.key(event)
      : `${event.node.req.method}:${event.node.req.url}`;

    const ttl = cache.ttl || 300000; // 5 minutes default
    
    this.cacheStore.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  }

  /**
   * Handle errors
   */
  private handleError(event: H3Event, error: any): any {
    logger.error('Route error', {
      method: event.node.req.method,
      url: event.node.req.url,
      error: String(error)
    });

    // If it's already an H3 error, return it
    if (error.statusCode) {
      setResponseStatus(event, error.statusCode);
      return {
        error: error.statusMessage || 'Error',
        message: error.data?.error || error.message,
        statusCode: error.statusCode
      };
    }

    // Generic error
    setResponseStatus(event, 500);
    return {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500
    };
  }

  /**
   * Add REST resource routes
   */
  addResource(
    basePath: string,
    handlers: {
      list?: EventHandler;
      get?: EventHandler;
      create?: EventHandler;
      update?: EventHandler;
      delete?: EventHandler;
    },
    options: {
      middleware?: EventHandler[];
      auth?: RouteDefinition['auth'];
      validation?: {
        create?: RouteDefinition['validation'];
        update?: RouteDefinition['validation'];
      };
    } = {}
  ): void {
    // List - GET /resource
    if (handlers.list) {
      this.addRoute({
        path: basePath,
        method: 'GET',
        handler: handlers.list,
        middleware: options.middleware,
        auth: options.auth,
        description: `List ${basePath} resources`
      });
    }

    // Get - GET /resource/:id
    if (handlers.get) {
      this.addRoute({
        path: `${basePath}/:id`,
        method: 'GET',
        handler: handlers.get,
        middleware: options.middleware,
        auth: options.auth,
        description: `Get ${basePath} resource by ID`
      });
    }

    // Create - POST /resource
    if (handlers.create) {
      this.addRoute({
        path: basePath,
        method: 'POST',
        handler: handlers.create,
        middleware: options.middleware,
        auth: options.auth,
        validation: options.validation?.create,
        description: `Create ${basePath} resource`
      });
    }

    // Update - PUT /resource/:id
    if (handlers.update) {
      this.addRoute({
        path: `${basePath}/:id`,
        method: 'PUT',
        handler: handlers.update,
        middleware: options.middleware,
        auth: options.auth,
        validation: options.validation?.update,
        description: `Update ${basePath} resource`
      });
    }

    // Delete - DELETE /resource/:id
    if (handlers.delete) {
      this.addRoute({
        path: `${basePath}/:id`,
        method: 'DELETE',
        handler: handlers.delete,
        middleware: options.middleware,
        auth: options.auth,
        description: `Delete ${basePath} resource`
      });
    }

    logger.info('REST resource added', { 
      basePath, 
      handlers: Object.keys(handlers) 
    });
  }

  /**
   * Get H3 router for use with server
   */
  getH3Router() {
    return this.h3Router;
  }

  /**
   * Get route definitions
   */
  getRoutes(): RouteDefinition[] {
    return Array.from(this.routes.values());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cacheStore.clear();
    logger.debug('Route cache cleared');
  }

  /**
   * Get router statistics
   */
  getStats(): {
    routes: number;
    middlewares: number;
    cacheEntries: number;
    rateLimitEntries: number;
  } {
    return {
      routes: this.routes.size,
      middlewares: this.middlewares.size,
      cacheEntries: this.cacheStore.size,
      rateLimitEntries: this.rateLimitStore.size
    };
  }

  /**
   * Generate OpenAPI specification
   */
  generateOpenAPI(): any {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Pothos GraphQL API',
        version: '1.0.0',
        description: 'REST API with UnJS routing'
      },
      paths: {} as any
    };

    for (const route of this.routes.values()) {
      if (!spec.paths[route.path]) {
        spec.paths[route.path] = {};
      }

      spec.paths[route.path][route.method.toLowerCase()] = {
        summary: route.description || `${route.method} ${route.path}`,
        tags: route.tags || ['api'],
        responses: {
          '200': {
            description: 'Success'
          },
          '400': {
            description: 'Bad Request'
          },
          '401': {
            description: 'Unauthorized'
          },
          '500': {
            description: 'Internal Server Error'
          }
        }
      };
    }

    return spec;
  }
}

// Helper imports (these would be imported from h3)
function setHeader(event: H3Event, name: string, value: string) {
  event.node.res.setHeader(name, value);
}

function getHeader(event: H3Event, name: string): string | undefined {
  return event.node.req.headers[name.toLowerCase()] as string;
}

function setResponseStatus(event: H3Event, status: number) {
  event.node.res.statusCode = status;
}

function getClientIP(event: H3Event): string {
  return (event.node.req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         (event.node.req.headers['x-real-ip'] as string) ||
         event.node.req.socket?.remoteAddress ||
         'unknown';
}

function getCookie(event: H3Event, name: string): string | undefined {
  const cookies = event.node.req.headers.cookie;
  if (!cookies) return undefined;
  
  const match = cookies.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

function createError(options: {
  statusCode: number;
  statusMessage: string;
  data?: any;
}) {
  const error = new Error(options.statusMessage) as any;
  error.statusCode = options.statusCode;
  error.statusMessage = options.statusMessage;
  error.data = options.data;
  return error;
}

// Export singleton instance
export const router = new UnJSRouter();

// Export types
export { RouteDefinition, MiddlewareOptions, RouteContext };