/**
 * Enterprise API Gateway
 * Centralized API management with routing, authentication, rate limiting, and analytics
 */

import { logger, objectUtils, stringUtils, pathUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { enterpriseSecurity } from '@/infrastructure/security/EnterpriseSecurity.js';
import { serviceRegistry } from '@/infrastructure/microservices/ServiceRegistry.js';
import { serviceMesh } from '@/infrastructure/microservices/ServiceMesh.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { z } from 'zod';

export interface APIRoute {
  id: string;
  path: string;
  method: string;
  upstream: {
    service: string;
    path: string;
    timeout: number;
    retries: number;
  };
  middleware: string[];
  authentication: {
    required: boolean;
    schemes: ('bearer' | 'api-key' | 'oauth2' | 'basic')[];
    roles: string[];
    scopes: string[];
  };
  rateLimit: {
    enabled: boolean;
    requests: number;
    window: number;
    key: 'ip' | 'user' | 'api-key';
  };
  caching: {
    enabled: boolean;
    ttl: number;
    vary: string[];
    conditions: string[];
  };
  transformation: {
    request?: {
      headers?: Record<string, string>;
      body?: string;
    };
    response?: {
      headers?: Record<string, string>;
      body?: string;
    };
  };
  analytics: {
    enabled: boolean;
    sampling: number;
    customMetrics: string[];
  };
  metadata: {
    version: string;
    description: string;
    tags: string[];
    deprecated: boolean;
    public: boolean;
  };
}

export interface APIClient {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'server' | 'internal';
  apiKey: string;
  secret?: string;
  status: 'active' | 'suspended' | 'revoked';
  permissions: {
    routes: string[];
    methods: string[];
    rateLimit: {
      requests: number;
      window: number;
    };
  };
  quotas: {
    daily: number;
    monthly: number;
    used: {
      daily: number;
      monthly: number;
    };
  };
  webhooks?: {
    url: string;
    events: string[];
    secret: string;
  };
  metadata: {
    owner: string;
    environment: string;
    created: Date;
    lastUsed?: Date;
    notes: string;
  };
}

export interface GatewayRequest {
  id: string;
  timestamp: Date;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  query: Record<string, string>;
  client: {
    id?: string;
    ip: string;
    userAgent: string;
  };
  auth: {
    authenticated: boolean;
    user?: any;
    client?: APIClient;
    scopes: string[];
  };
  route?: APIRoute;
  upstream?: {
    service: string;
    url: string;
    duration: number;
    status: number;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: any;
    cached: boolean;
  };
  metrics: {
    totalDuration: number;
    authDuration: number;
    routingDuration: number;
    upstreamDuration: number;
    transformationDuration: number;
  };
}

export interface LoadBalancer {
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash' | 'random';
  healthCheck: {
    enabled: boolean;
    path: string;
    interval: number;
    timeout: number;
    threshold: number;
  };
  failover: {
    enabled: boolean;
    maxRetries: number;
    backoff: 'linear' | 'exponential';
    circuit: {
      enabled: boolean;
      threshold: number;
      timeout: number;
    };
  };
}

/**
 * Enterprise API Gateway with comprehensive management capabilities
 */
export class APIGateway {
  private routes: Map<string, APIRoute> = new Map();
  private clients: Map<string, APIClient> = new Map();
  private requests: Map<string, GatewayRequest> = new Map();
  private routeCache: Map<string, { route: APIRoute; expires: Date }> = new Map();
  private responseCache: Map<string, { response: any; expires: Date; headers: Record<string, string> }> = new Map();
  private rateLimiters: Map<string, { count: number; resetTime: Date; blocked: boolean }> = new Map();
  private loadBalancer: LoadBalancer;
  private middleware: Map<string, Function> = new Map();

  constructor() {
    this.loadBalancer = {
      algorithm: 'round-robin',
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 30000,
        timeout: 5000,
        threshold: 3,
      },
      failover: {
        enabled: true,
        maxRetries: 3,
        backoff: 'exponential',
        circuit: {
          enabled: true,
          threshold: 5,
          timeout: 60000,
        },
      },
    };

    this.setupValidationSchemas();
    this.registerDefaultRoutes();
    this.registerDefaultClients();
    this.registerMiddleware();
    this.startHealthChecking();
    this.startCacheCleanup();
    this.startAnalytics();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const routeSchema = z.object({
      path: z.string().min(1),
      method: z.string(),
      upstream: z.object({
        service: z.string(),
        path: z.string(),
        timeout: z.number(),
        retries: z.number(),
      }),
      middleware: z.array(z.string()),
      authentication: z.object({
        required: z.boolean(),
        schemes: z.array(z.string()),
        roles: z.array(z.string()),
        scopes: z.array(z.string()),
      }),
      rateLimit: z.object({
        enabled: z.boolean(),
        requests: z.number(),
        window: z.number(),
        key: z.enum(['ip', 'user', 'api-key']),
      }),
    });

    const clientSchema = z.object({
      name: z.string().min(1),
      type: z.enum(['web', 'mobile', 'server', 'internal']),
      permissions: z.object({
        routes: z.array(z.string()),
        methods: z.array(z.string()),
        rateLimit: z.object({
          requests: z.number(),
          window: z.number(),
        }),
      }),
      quotas: z.object({
        daily: z.number(),
        monthly: z.number(),
      }),
    });

    validationService.registerSchema('apiRoute', routeSchema);
    validationService.registerSchema('apiClient', clientSchema);
  }

  /**
   * Register API route
   */
  registerRoute(route: Omit<APIRoute, 'id'>): string {
    const id = stringUtils.random(8);
    const apiRoute: APIRoute = { id, ...route };

    this.routes.set(id, apiRoute);

    // Clear route cache when routes change
    this.routeCache.clear();

    logger.info('API route registered', {
      routeId: id,
      path: route.path,
      method: route.method,
      service: route.upstream.service,
    });

    monitoring.recordMetric({
      name: 'gateway.route.registered',
      value: 1,
      tags: {
        path: route.path,
        method: route.method,
        service: route.upstream.service,
      },
    });

    return id;
  }

  /**
   * Register API client
   */
  registerClient(client: Omit<APIClient, 'id' | 'apiKey' | 'status'>): string {
    const id = stringUtils.random(12);
    const apiKey = `gw_${stringUtils.random(32)}`;

    const apiClient: APIClient = {
      id,
      apiKey,
      secret: client.secret || '',
      webhooks: client.webhooks || undefined,
      status: 'active',
      name: client.name,
      type: client.type,
      permissions: client.permissions,
      quotas: {
        ...client.quotas,
        used: { daily: 0, monthly: 0 },
      },
      metadata: {
        owner: client.metadata.owner,
        environment: client.metadata.environment,
        created: client.metadata.created,
        lastUsed: client.metadata.lastUsed,
        notes: client.metadata.notes,
      },
    };

    this.clients.set(id, apiClient);

    logger.info('API client registered', {
      clientId: id,
      name: client.name,
      type: client.type,
      apiKey: `${apiKey.substring(0, 8)}...`,
    });

    monitoring.recordMetric({
      name: 'gateway.client.registered',
      value: 1,
      tags: {
        type: client.type,
        name: client.name,
      },
    });

    return id;
  }

  /**
   * Process gateway request
   */
  async processRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    query: Record<string, string>,
    body?: any,
    clientIP?: string
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: any;
  }> {
    const requestId = stringUtils.random(12);
    const startTime = Date.now();

    const gatewayRequest: GatewayRequest = {
      id: requestId,
      timestamp: new Date(),
      method,
      path,
      headers,
      body,
      query,
      client: {
        ip: clientIP || 'unknown',
        userAgent: headers['user-agent'] || 'unknown',
      },
      auth: {
        authenticated: false,
        scopes: [],
      },
      metrics: {
        totalDuration: 0,
        authDuration: 0,
        routingDuration: 0,
        upstreamDuration: 0,
        transformationDuration: 0,
      },
    };

    this.requests.set(requestId, gatewayRequest);

    const spanId = monitoring.startTrace(`gateway.request`);

    try {
      // 1. Route matching
      const routingStart = Date.now();
      const route = await this.matchRoute(method, path);
      if (!route) {
        throw new Error(`No route found for ${method} ${path}`);
      }
      gatewayRequest.route = route;
      gatewayRequest.metrics.routingDuration = Date.now() - routingStart;

      // 2. Authentication
      const authStart = Date.now();
      await this.authenticateRequest(gatewayRequest);
      gatewayRequest.metrics.authDuration = Date.now() - authStart;

      // 3. Authorization
      await this.authorizeRequest(gatewayRequest);

      // 4. Rate limiting
      await this.checkRateLimit(gatewayRequest);

      // 5. Check cache
      const cachedResponse = await this.getCachedResponse(gatewayRequest);
      if (cachedResponse) {
        gatewayRequest.response = {
          status: 200,
          headers: cachedResponse.headers,
          body: cachedResponse.response,
          cached: true,
        };

        monitoring.recordMetric({
          name: 'gateway.cache.hit',
          value: 1,
          tags: {
            route: route.path,
            method: route.method,
          },
        });

        return {
          status: 200,
          headers: cachedResponse.headers,
          body: cachedResponse.response,
        };
      }

      // 6. Apply request middleware
      await this.applyMiddleware(gatewayRequest, 'request');

      // 7. Transform request
      const transformStart = Date.now();
      await this.transformRequest(gatewayRequest);

      // 8. Route to upstream
      const upstreamStart = Date.now();
      const upstreamResponse = await this.routeToUpstream(gatewayRequest);
      gatewayRequest.metrics.upstreamDuration = Date.now() - upstreamStart;

      // 9. Transform response
      await this.transformResponse(gatewayRequest, upstreamResponse);
      gatewayRequest.metrics.transformationDuration += Date.now() - transformStart;

      // 10. Apply response middleware
      await this.applyMiddleware(gatewayRequest, 'response');

      // 11. Cache response if applicable
      if (route.caching.enabled) {
        await this.cacheResponse(gatewayRequest, upstreamResponse);
      }

      gatewayRequest.response = {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
        body: upstreamResponse.body,
        cached: false,
      };

      // Update client usage
      if (gatewayRequest.auth.client) {
        this.updateClientUsage(gatewayRequest.auth.client);
      }

      gatewayRequest.metrics.totalDuration = Date.now() - startTime;

      monitoring.finishSpan(spanId, {
        success: true,
        requestId,
        route: route.path,
        method: route.method,
        status: upstreamResponse.status,
        duration: gatewayRequest.metrics.totalDuration,
        cached: false,
      });

      monitoring.recordMetric({
        name: 'gateway.request.success',
        value: 1,
        tags: {
          route: route.path,
          method: route.method,
          status: upstreamResponse.status.toString(),
        },
      });

      return {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
        body: upstreamResponse.body,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      gatewayRequest.metrics.totalDuration = duration;

      monitoring.finishSpan(spanId, {
        success: false,
        requestId,
        error: String(error),
        duration,
      });

      monitoring.recordMetric({
        name: 'gateway.request.error',
        value: 1,
        tags: {
          route: gatewayRequest.route?.path || 'unknown',
          method: gatewayRequest.method,
          error: 'processing_failed',
        },
      });

      logger.error('Gateway request failed', {
        requestId,
        path: gatewayRequest.path,
        method: gatewayRequest.method,
        error: String(error),
      });

      return {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: { error: 'Internal gateway error', requestId },
      };
    }
  }

  /**
   * Match incoming request to route
   */
  private async matchRoute(method: string, path: string): Promise<APIRoute | null> {
    const cacheKey = `${method}:${path}`;
    const cached = this.routeCache.get(cacheKey);

    if (cached && new Date() < cached.expires) {
      return cached.route;
    }

    // Find matching route
    for (const route of this.routes.values()) {
      if (route.method !== '*' && route.method !== method) continue;

      if (this.pathMatches(route.path, path)) {
        // Cache the match for 5 minutes
        this.routeCache.set(cacheKey, {
          route,
          expires: new Date(Date.now() + 300000),
        });
        return route;
      }
    }

    return null;
  }

  /**
   * Check if path matches route pattern
   */
  private pathMatches(routePath: string, requestPath: string): boolean {
    // Simple wildcard matching - in production would use more sophisticated routing
    const routeSegments = routePath.split('/');
    const pathSegments = requestPath.split('/');

    if (routeSegments.length !== pathSegments.length) {
      return false;
    }

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const pathSegment = pathSegments[i];

      if (routeSegment?.startsWith(':')) {
        // Parameter segment - matches anything
        continue;
      }

      if (routeSegment === '*') {
        // Wildcard - matches anything
        continue;
      }

      if (routeSegment !== pathSegment) {
        return false;
      }
    }

    return true;
  }

  /**
   * Authenticate request
   */
  private async authenticateRequest(request: GatewayRequest): Promise<void> {
    const route = request.route!;

    if (!route.authentication.required) {
      return;
    }

    // Check API key authentication
    const apiKey = request.headers['x-api-key'] || request.query['api_key'];
    if (apiKey) {
      const client = Array.from(this.clients.values()).find(c => c.apiKey === apiKey);
      if (client && client.status === 'active') {
        request.auth.authenticated = true;
        request.auth.client = client;
        request.client.id = client.id;
        client.metadata.lastUsed = new Date();
        return;
      }
    }

    // Check bearer token
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // In production, would validate JWT token
      request.auth.authenticated = true;
      request.auth.scopes = ['read', 'write']; // Mock scopes
      return;
    }

    throw new Error('Authentication required');
  }

  /**
   * Authorize request
   */
  private async authorizeRequest(request: GatewayRequest): Promise<void> {
    const route = request.route!;

    if (!route.authentication.required) {
      return;
    }

    // Check client permissions
    if (request.auth.client) {
      const client = request.auth.client;

      // Check route access  
      if (client.permissions.routes.length > 0 &&
        !client.permissions.routes.includes(route.id) &&
        !client.permissions.routes.includes('*')) {
        throw new Error('Insufficient permissions for this route');
      }

      // Check method access
      if (client.permissions.methods.length > 0 &&
        !client.permissions.methods.includes(request.method) &&
        !client.permissions.methods.includes('*')) {
        throw new Error('Method not allowed for this client');
      }
    }

    // Check required scopes
    if (route.authentication.scopes.length > 0) {
      const hasRequiredScope = route.authentication.scopes.some(scope =>
        request.auth.scopes.includes(scope)
      );

      if (!hasRequiredScope) {
        throw new Error('Insufficient scopes');
      }
    }
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(request: GatewayRequest): Promise<void> {
    const route = request.route!;

    if (!route.rateLimit.enabled) {
      return;
    }

    let rateLimitKey: string;

    switch (route.rateLimit.key) {
      case 'ip':
        rateLimitKey = `ip:${request.client.ip}`;
        break;
      case 'user':
        rateLimitKey = `user:${request.auth.client?.id || 'anonymous'}`;
        break;
      case 'api-key':
        rateLimitKey = `key:${request.auth.client?.apiKey || 'none'}`;
        break;
      default:
        rateLimitKey = `ip:${request.client.ip}`;
    }

    const now = new Date();
    const limiter = this.rateLimiters.get(rateLimitKey);

    if (!limiter || now > limiter.resetTime) {
      this.rateLimiters.set(rateLimitKey, {
        count: 1,
        resetTime: new Date(now.getTime() + route.rateLimit.window),
        blocked: false,
      });
      return;
    }

    limiter.count++;

    if (limiter.count > route.rateLimit.requests) {
      limiter.blocked = true;

      monitoring.recordMetric({
        name: 'gateway.rate_limit.exceeded',
        value: 1,
        tags: {
          route: route.path,
          key: route.rateLimit.key,
        },
      });

      throw new Error('Rate limit exceeded');
    }
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(request: GatewayRequest): Promise<{ response: any; headers: Record<string, string> } | null> {
    const route = request.route!;

    if (!route.caching.enabled) {
      return null;
    }

    const cacheKey = objectUtils.hash({
      path: request.path,
      method: request.method,
      query: request.query,
      headers: route.caching.vary.reduce((acc, header) => {
        acc[header] = request.headers[header] || '';
        return acc;
      }, {} as Record<string, string>),
    });

    const cached = this.responseCache.get(cacheKey);
    if (!cached || new Date() > cached.expires) {
      if (cached) {
        this.responseCache.delete(cacheKey);
      }
      return null;
    }

    return { response: cached.response, headers: cached.headers };
  }

  /**
   * Apply middleware
   */
  private async applyMiddleware(request: GatewayRequest, phase: 'request' | 'response'): Promise<void> {
    const route = request.route!;

    for (const middlewareName of route.middleware) {
      const middleware = this.middleware.get(middlewareName);
      if (middleware) {
        try {
          await middleware(request, phase);
        } catch (error) {
          logger.error('Middleware error', {
            middleware: middlewareName,
            phase,
            requestId: request.id,
            error: String(error),
          });
          throw error;
        }
      }
    }
  }

  /**
   * Transform request
   */
  private async transformRequest(request: GatewayRequest): Promise<void> {
    const route = request.route!;

    if (route.transformation.request) {
      // Apply header transformations
      if (route.transformation.request.headers) {
        Object.assign(request.headers, route.transformation.request.headers);
      }

      // Apply body transformations (would be more sophisticated in production)
      if (route.transformation.request.body && request.body) {
        // Simple string replacement for demo
        try {
          const template = route.transformation.request.body;
          const transformed = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return request.body[key] || match;
          });
          request.body = JSON.parse(transformed);
        } catch (error) {
          logger.warn('Request transformation failed', { error });
        }
      }
    }
  }

  /**
   * Route to upstream service
   */
  private async routeToUpstream(request: GatewayRequest): Promise<{
    status: number;
    headers: Record<string, string>;
    body: any;
  }> {
    const route = request.route!;

    // Use service mesh for routing
    try {
      const upstreamResponse = await serviceMesh.routeRequest(
        'api-gateway',
        route.upstream.service,
        {
          method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE' | 'COPY' | 'LINK' | 'UNLINK' | 'PURGE' | 'LOCK' | 'UNLOCK' | 'PROPFIND' | 'VIEW',
          path: route.upstream.path,
          headers: request.headers,
          body: request.body,
        }
      );

      request.upstream = {
        service: route.upstream.service,
        url: route.upstream.path,
        duration: 0, // Would be measured
        status: upstreamResponse.status || 200,
      };

      return {
        status: upstreamResponse.status || 200,
        headers: upstreamResponse.headers || {},
        body: upstreamResponse.body,
      };

    } catch (error) {
      // Fallback to direct HTTP call
      const upstreamUrl = `http://localhost:4000${route.upstream.path}`;

      const response = await httpClient.request(upstreamUrl, {
        method: request.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
        headers: request.headers,
        body: request.body,
        timeout: route.upstream.timeout,
      });

      request.upstream = {
        service: route.upstream.service,
        url: upstreamUrl,
        duration: 0,
        status: response.status,
      };

      return {
        status: response.status,
        headers: response.headers || {},
        body: response.data,
      };
    }
  }

  /**
   * Transform response
   */
  private async transformResponse(request: GatewayRequest, response: any): Promise<void> {
    const route = request.route!;

    if (route.transformation.response) {
      // Apply header transformations
      if (route.transformation.response.headers) {
        Object.assign(response.headers, route.transformation.response.headers);
      }

      // Apply body transformations
      if (route.transformation.response.body && response.body) {
        try {
          const template = route.transformation.response.body;
          const transformed = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return response.body[key] || match;
          });
          response.body = JSON.parse(transformed);
        } catch (error) {
          logger.warn('Response transformation failed', { error });
        }
      }
    }
  }

  /**
   * Cache response
   */
  private async cacheResponse(request: GatewayRequest, response: any): Promise<void> {
    const route = request.route!;

    const cacheKey = objectUtils.hash({
      path: request.path,
      method: request.method,
      query: request.query,
      headers: route.caching.vary.reduce((acc, header) => {
        acc[header] = request.headers[header] || '';
        return acc;
      }, {} as Record<string, string>),
    });

    this.responseCache.set(cacheKey, {
      response: response.body,
      headers: response.headers,
      expires: new Date(Date.now() + route.caching.ttl),
    });

    monitoring.recordMetric({
      name: 'gateway.cache.set',
      value: 1,
      tags: {
        route: route.path,
        method: route.method,
      },
    });
  }

  /**
   * Update client usage
   */
  private updateClientUsage(client: APIClient): void {
    client.quotas.used.daily++;
    client.quotas.used.monthly++;

    // Check quotas
    if (client.quotas.used.daily > client.quotas.daily) {
      logger.warn('Client daily quota exceeded', {
        clientId: client.id,
        used: client.quotas.used.daily,
        limit: client.quotas.daily,
      });
    }

    if (client.quotas.used.monthly > client.quotas.monthly) {
      logger.warn('Client monthly quota exceeded', {
        clientId: client.id,
        used: client.quotas.used.monthly,
        limit: client.quotas.monthly,
      });
    }
  }

  /**
   * Register default routes
   */
  private registerDefaultRoutes(): void {
    // GraphQL API route
    this.registerRoute({
      path: '/graphql',
      method: 'POST',
      upstream: {
        service: 'pothos-graphql-api',
        path: '/graphql',
        timeout: 30000,
        retries: 2,
      },
      middleware: ['cors', 'logging', 'metrics'],
      authentication: {
        required: true,
        schemes: ['bearer', 'api-key'],
        roles: ['user', 'admin'],
        scopes: ['read', 'write'],
      },
      rateLimit: {
        enabled: true,
        requests: 1000,
        window: 60000,
        key: 'user',
      },
      caching: {
        enabled: false, // GraphQL queries are typically not cached at gateway level
        ttl: 0,
        vary: [],
        conditions: [],
      },
      transformation: {
        request: {
          headers: {
            'x-gateway-version': '1.0.0',
            'x-request-id': '{{requestId}}',
          },
        },
        response: {
          headers: {
            'x-powered-by': 'Enterprise API Gateway',
          },
        },
      },
      analytics: {
        enabled: true,
        sampling: 1.0,
        customMetrics: ['query_complexity', 'query_depth'],
      },
      metadata: {
        version: '1.0.0',
        description: 'Main GraphQL API endpoint',
        tags: ['graphql', 'api', 'primary'],
        deprecated: false,
        public: true,
      },
    });

    // Health check route
    this.registerRoute({
      path: '/health',
      method: 'GET',
      upstream: {
        service: 'pothos-graphql-api',
        path: '/health',
        timeout: 5000,
        retries: 1,
      },
      middleware: ['cors'],
      authentication: {
        required: false,
        schemes: [],
        roles: [],
        scopes: [],
      },
      rateLimit: {
        enabled: true,
        requests: 100,
        window: 60000,
        key: 'ip',
      },
      caching: {
        enabled: true,
        ttl: 30000, // 30 seconds
        vary: [],
        conditions: [],
      },
      transformation: {},
      analytics: {
        enabled: false,
        sampling: 0,
        customMetrics: [],
      },
      metadata: {
        version: '1.0.0',
        description: 'Health check endpoint',
        tags: ['health', 'monitoring'],
        deprecated: false,
        public: true,
      },
    });

    // Metrics route (admin only)
    this.registerRoute({
      path: '/admin/metrics',
      method: 'GET',
      upstream: {
        service: 'pothos-graphql-api',
        path: '/metrics',
        timeout: 10000,
        retries: 1,
      },
      middleware: ['cors', 'admin-auth'],
      authentication: {
        required: true,
        schemes: ['bearer'],
        roles: ['admin'],
        scopes: ['admin:read'],
      },
      rateLimit: {
        enabled: true,
        requests: 10,
        window: 60000,
        key: 'user',
      },
      caching: {
        enabled: false,
        ttl: 0,
        vary: [],
        conditions: [],
      },
      transformation: {},
      analytics: {
        enabled: true,
        sampling: 1.0,
        customMetrics: ['admin_access'],
      },
      metadata: {
        version: '1.0.0',
        description: 'System metrics endpoint',
        tags: ['admin', 'metrics', 'monitoring'],
        deprecated: false,
        public: false,
      },
    });

    logger.info('Default API routes registered');
  }

  /**
   * Register default clients
   */
  private registerDefaultClients(): void {
    // Frontend web client
    this.registerClient({
      name: 'Web Frontend',
      type: 'web',
      permissions: {
        routes: ['*'],
        methods: ['GET', 'POST'],
        rateLimit: {
          requests: 1000,
          window: 60000,
        },
      },
      quotas: {
        daily: 10000,
        monthly: 300000,
        used: { daily: 0, monthly: 0 },
      },
      metadata: {
        owner: 'frontend-team',
        environment: 'production',
        created: new Date(),
        notes: 'Main web application client',
      },
    });

    // Mobile app client
    this.registerClient({
      name: 'Mobile App',
      type: 'mobile',
      permissions: {
        routes: ['*'],
        methods: ['GET', 'POST'],
        rateLimit: {
          requests: 500,
          window: 60000,
        },
      },
      quotas: {
        daily: 5000,
        monthly: 150000,
        used: { daily: 0, monthly: 0 },
      },
      metadata: {
        owner: 'mobile-team',
        environment: 'production',
        created: new Date(),
        notes: 'Mobile application client',
      },
    });

    // Internal service client
    this.registerClient({
      name: 'Background Worker',
      type: 'server',
      permissions: {
        routes: ['*'],
        methods: ['*'],
        rateLimit: {
          requests: 10000,
          window: 60000,
        },
      },
      quotas: {
        daily: 100000,
        monthly: 3000000,
        used: { daily: 0, monthly: 0 },
      },
      metadata: {
        owner: 'backend-team',
        environment: 'production',
        created: new Date(),
        notes: 'Background processing service',
      },
    });

    logger.info('Default API clients registered');
  }

  /**
   * Register middleware
   */
  private registerMiddleware(): void {
    // CORS middleware
    this.middleware.set('cors', async (request: GatewayRequest, phase: string) => {
      if (phase === 'response' && request.response) {
        request.response.headers['access-control-allow-origin'] = '*';
        request.response.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        request.response.headers['access-control-allow-headers'] = 'authorization, content-type, x-api-key';
      }
    });

    // Logging middleware
    this.middleware.set('logging', async (request: GatewayRequest, phase: string) => {
      if (phase === 'request') {
        logger.info('Gateway request', {
          requestId: request.id,
          method: request.method,
          path: request.path,
          clientId: request.client.id,
          ip: request.client.ip,
        });
      }
    });

    // Metrics middleware
    this.middleware.set('metrics', async (request: GatewayRequest, phase: string) => {
      if (phase === 'response') {
        monitoring.recordMetric({
          name: 'gateway.middleware.metrics',
          value: 1,
          tags: {
            route: request.route?.path || 'unknown',
            method: request.method,
          },
        });
      }
    });

    // Admin authentication middleware
    this.middleware.set('admin-auth', async (request: GatewayRequest, phase: string) => {
      if (phase === 'request') {
        if (!request.auth.authenticated) {
          throw new Error('Admin authentication required');
        }

        // Check if user has admin role (simplified)
        const hasAdminRole = request.auth.scopes.includes('admin:read') ||
          request.auth.scopes.includes('admin:write');

        if (!hasAdminRole) {
          throw new Error('Admin privileges required');
        }
      }
    });

    logger.info('Gateway middleware registered');
  }

  /**
   * Start health checking
   */
  private startHealthChecking(): void {
    if (!this.loadBalancer.healthCheck.enabled) return;

    setInterval(async () => {
      const services = serviceRegistry.discoverServices({ healthyOnly: false });

      for (const service of services) {
        try {
          const healthUrl = `${service.network.protocol}://${service.network.host}:${service.network.port}${this.loadBalancer.healthCheck.path}`;
          const response = await httpClient.get(healthUrl, {
            timeout: this.loadBalancer.healthCheck.timeout,
          });

          if (response.data?.status === 'healthy') {
            serviceRegistry.updateServiceStatus(service.id, 'healthy');
          } else {
            serviceRegistry.updateServiceStatus(service.id, 'unhealthy');
          }

        } catch (error) {
          serviceRegistry.updateServiceStatus(service.id, 'unhealthy');
          logger.debug('Service health check failed', {
            service: service.name,
            error: String(error),
          });
        }
      }
    }, this.loadBalancer.healthCheck.interval);
  }

  /**
   * Start cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      // Clean route cache
      for (const [key, cached] of this.routeCache.entries()) {
        if (now > cached.expires) {
          this.routeCache.delete(key);
          cleaned++;
        }
      }

      // Clean response cache
      for (const [key, cached] of this.responseCache.entries()) {
        if (now > cached.expires) {
          this.responseCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Gateway cache cleaned', { cleaned });

        monitoring.recordMetric({
          name: 'gateway.cache.cleaned',
          value: cleaned,
          tags: {},
        });
      }

    }, 300000); // Every 5 minutes
  }

  /**
   * Start analytics collection
   */
  private startAnalytics(): void {
    setInterval(() => {
      // Calculate and record analytics metrics
      const requests = Array.from(this.requests.values());
      const recentRequests = requests.filter(r =>
        Date.now() - r.timestamp.getTime() < 300000 // Last 5 minutes
      );

      if (recentRequests.length > 0) {
        const avgResponseTime = recentRequests.reduce((sum, r) => sum + r.metrics.totalDuration, 0) / recentRequests.length;
        const successRate = recentRequests.filter(r => r.response?.status && r.response.status < 400).length / recentRequests.length;

        monitoring.recordMetric({
          name: 'gateway.analytics.avg_response_time',
          value: avgResponseTime,
          tags: {},
          unit: 'ms',
        });

        monitoring.recordMetric({
          name: 'gateway.analytics.success_rate',
          value: successRate,
          tags: {},
        });

        monitoring.recordMetric({
          name: 'gateway.analytics.requests_per_minute',
          value: recentRequests.length / 5,
          tags: {},
        });
      }

      // Record cache statistics
      monitoring.recordMetric({
        name: 'gateway.cache.route_cache_size',
        value: this.routeCache.size,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'gateway.cache.response_cache_size',
        value: this.responseCache.size,
        tags: {},
      });

    }, 60000); // Every minute
  }

  /**
   * Get gateway statistics
   */
  getGatewayStatistics(): {
    routes: number;
    clients: number;
    activeClients: number;
    totalRequests: number;
    cacheSize: number;
    rateLimiters: number;
    avgResponseTime: number;
    successRate: number;
  } {
    const requests = Array.from(this.requests.values());
    const activeClients = Array.from(this.clients.values()).filter(c => c.status === 'active');
    const recentRequests = requests.filter(r =>
      Date.now() - r.timestamp.getTime() < 3600000 // Last hour
    );

    const avgResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.metrics.totalDuration, 0) / recentRequests.length
      : 0;

    const successRate = recentRequests.length > 0
      ? recentRequests.filter(r => r.response?.status && r.response.status < 400).length / recentRequests.length
      : 0;

    return {
      routes: this.routes.size,
      clients: this.clients.size,
      activeClients: activeClients.length,
      totalRequests: requests.length,
      cacheSize: this.routeCache.size + this.responseCache.size,
      rateLimiters: this.rateLimiters.size,
      avgResponseTime,
      successRate,
    };
  }

  /**
   * Get route details
   */
  getRoute(routeId: string): APIRoute | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Get client details
   */
  getClient(clientId: string): APIClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all routes
   */
  getAllRoutes(): APIRoute[] {
    return Array.from(this.routes.values());
  }

  /**
   * Get all clients
   */
  getAllClients(): APIClient[] {
    return Array.from(this.clients.values());
  }
}

// Export singleton instance
export const apiGateway = new APIGateway();

