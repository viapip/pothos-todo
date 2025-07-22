import { createApp, eventHandler, useSession, toNodeListener } from "h3";
import { yoga } from "./src/api/server/server.js";
import { logger } from "./src/logger.js";
import {
  loadAppConfig,
  getServerConfig,
  getSessionConfig,
  getSecurityConfig,
} from "./src/config/index.js";
import { 
  initializeCacheManager, 
  getCacheStats, 
  getCacheHealth,
  shutdownCache 
} from "./src/lib/cache/integration.js";
import { 
  initializeEnhancedDatabase,
  shutdownEnhancedDatabase 
} from "./src/lib/database/enhanced-client.js";
import {
  createDatabaseStatsEndpoint,
  createDatabaseHealthEndpoint,
  createQueryAnalysisEndpoint,
  createPreparedStatementsEndpoint,
  createSlowQueriesEndpoint,
  createDatabaseMaintenanceEndpoint,
  createDatabaseConfigEndpoint,
} from "./src/lib/database/endpoints.js";
import {
  handleGoogleLogin,
  handleGoogleCallback,
  handleGitHubLogin,
  handleGitHubCallback,
  handleLogout,
  handleLogoutAll,
} from "./src/routes/auth/index.js";
import { createFullSecurityMiddleware } from "./src/lib/security/index.js";
import { createServer } from "node:http";
import { getMetrics, recordHttpRequest, httpActiveConnections } from "./src/lib/monitoring/metrics.js";
import { 
  createHealthEndpoint, 
  createReadinessEndpoint, 
  createLivenessEndpoint,
  performStartupHealthCheck 
} from "./src/lib/monitoring/health.js";
import {
  createVersionInfoEndpoint,
  createDeprecationReportEndpoint,
  createMigrationPlanEndpoint,
  createQueryTransformEndpoint,
  createUsageAnalyticsEndpoint,
} from "./src/lib/versioning/endpoints.js";

async function startServer() {
  try {
    // Load configuration
    await loadAppConfig();
    
    // Initialize cache manager
    await initializeCacheManager();
    
    // Initialize enhanced database client
    await initializeEnhancedDatabase({
      minConnections: 2,
      maxConnections: 10,
      acquireTimeoutMs: 10000,
      idleTimeoutMs: 300000,
      healthCheckIntervalMs: 60000,
      slowQueryThresholdMs: 1000,
    }, {
      enableQueryAnalysis: true,
      enablePreparedStatements: true,
      slowQueryThreshold: 1000,
      maxPreparedStatements: 100,
      maxQueryCacheSize: 500,
    });
    
    // Perform startup health check
    await performStartupHealthCheck();
    const serverConfig = getServerConfig();
    const sessionConfig = getSessionConfig();
    const securityConfig = getSecurityConfig();

    // Create H3 app
    const app = createApp();

    // Security middleware (apply first)
    const securityMiddleware = createFullSecurityMiddleware({
      cors: {
        ...securityConfig.cors,
        origin: serverConfig.cors?.origin || securityConfig.cors.origin,
        credentials: serverConfig.cors?.credentials ?? securityConfig.cors.credentials,
      },
      rateLimit: securityConfig.rateLimit,
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // GraphQL Playground
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", "data:", "https:"],
          'connect-src': ["'self'", "https:", "wss:", "ws:"],
          'font-src': ["'self'", "https:", "data:"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        },
        reportOnly: !securityConfig.headers.contentSecurityPolicy,
      },
      ...(securityConfig.headers.hsts ? {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      } : {}),
    });

    app.use(eventHandler(securityMiddleware));

    // Global middleware for request logging and metrics
    app.use(
      eventHandler(async (event) => {
        const startTime = Date.now();
        event.context.startTime = startTime;

        // Track active connections
        httpActiveConnections.inc();
        
        // Add response handler to track metrics
        event.node.res.on('finish', () => {
          const duration = (Date.now() - startTime) / 1000;
          const method = event.node.req.method || 'UNKNOWN';
          const url = event.node.req.url || 'unknown';
          const statusCode = event.node.res.statusCode;
          
          // Determine route for metrics (simplify paths)
          let route = url || 'unknown';
          if (route.startsWith('/graphql')) {
            route = '/graphql';
          } else if (route.startsWith('/auth/')) {
            route = route.split('?')[0]; // Remove query params
          } else if (route === '/metrics' || route === '/health' || route === '/ready' || route === '/live' || route.startsWith('/api/')) {
            route = route;
          } else {
            route = 'other';
          }
          
          recordHttpRequest(method, route, statusCode, duration);
          httpActiveConnections.dec();
        });

        logger.info("Request", {
          method: event.node.req.method,
          url: event.node.req.url,
          userAgent: event.node.req.headers["user-agent"],
          ip: event.node.req.headers["x-forwarded-for"] || event.node.req.socket?.remoteAddress,
        });
      })
    );

    // Session middleware
    app.use(
      eventHandler(async (event) => {
        if (event.node.req.url?.startsWith("/auth/")) {
          const session = await useSession(event, {
            password: sessionConfig.secret,
            name: sessionConfig.name,
            maxAge: sessionConfig.maxAge,
            cookie: {
              secure: sessionConfig.secure,
              sameSite: sessionConfig.sameSite,
            },
          });
          event.context.session = session;
        }
      })
    );

    // Auth routes with native H3 event handling
    app.use(
      "/auth/google",
      eventHandler(async (event) => {
        return await handleGoogleLogin(event);
      })
    );

    app.use(
      "/auth/google/callback",
      eventHandler(async (event) => {
        return await handleGoogleCallback(event);
      })
    );

    app.use(
      "/auth/github",
      eventHandler(async (event) => {
        return await handleGitHubLogin(event);
      })
    );

    app.use(
      "/auth/github/callback",
      eventHandler(async (event) => {
        return await handleGitHubCallback(event);
      })
    );

    app.use(
      "/auth/logout",
      eventHandler(async (event) => {
        if (event.node.req.method === "POST") {
          return await handleLogout(event);
        }
        return new Response('Method not allowed', { status: 405 });
      })
    );

    app.use(
      "/auth/logout/all",
      eventHandler(async (event) => {
        if (event.node.req.method === "POST") {
          return await handleLogoutAll(event);
        }
        return new Response('Method not allowed', { status: 405 });
      })
    );

    // Health check endpoints
    app.use('/health', eventHandler(createHealthEndpoint()));
    app.use('/ready', eventHandler(createReadinessEndpoint()));
    app.use('/live', eventHandler(createLivenessEndpoint()));
    
    // Metrics endpoint
    app.use('/metrics', eventHandler(async (event) => {
      try {
        const metrics = await getMetrics();
        return new Response(metrics, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (error) {
        logger.error('Failed to generate metrics', { error });
        return new Response('Error generating metrics', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }));

    // API versioning and management endpoints
    app.use('/api/version', eventHandler(createVersionInfoEndpoint()));
    app.use('/api/version/deprecation-report', eventHandler(createDeprecationReportEndpoint()));
    app.use('/api/version/migration-plan', eventHandler(createMigrationPlanEndpoint()));
    app.use('/api/version/transform-query', eventHandler(createQueryTransformEndpoint()));
    app.use('/api/version/analytics', eventHandler(createUsageAnalyticsEndpoint()));

    // Cache management endpoints
    app.use('/api/cache/stats', eventHandler(async () => {
      try {
        const stats = getCacheStats();
        return new Response(JSON.stringify(stats, null, 2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        logger.error('Failed to get cache stats', { error });
        return new Response(JSON.stringify({ error: 'Failed to get cache stats' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }));

    app.use('/api/cache/health', eventHandler(async () => {
      try {
        const health = await getCacheHealth();
        return new Response(JSON.stringify(health, null, 2), {
          status: health.healthy ? 200 : 503,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        logger.error('Failed to check cache health', { error });
        return new Response(JSON.stringify({ 
          healthy: false, 
          error: 'Health check failed' 
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }));

    // Database management endpoints
    app.use('/api/database/stats', eventHandler(createDatabaseStatsEndpoint()));
    app.use('/api/database/health', eventHandler(createDatabaseHealthEndpoint()));
    app.use('/api/database/queries/analysis', eventHandler(createQueryAnalysisEndpoint()));
    app.use('/api/database/queries/prepared', eventHandler(createPreparedStatementsEndpoint()));
    app.use('/api/database/queries/slow', eventHandler(createSlowQueriesEndpoint()));
    app.use('/api/database/maintenance', eventHandler(createDatabaseMaintenanceEndpoint()));
    app.use('/api/database/config', eventHandler(createDatabaseConfigEndpoint()));

    // Mount GraphQL Yoga
    app.use(
      "/graphql",
      eventHandler(async (event) => {
        return yoga(event.node.req, event.node.res, { h3Event: event });
      })
    );

    // Create server using H3 app with toNodeListener
    const server = createServer(toNodeListener(app));

    server.listen(serverConfig.port, serverConfig.host, () => {
      logger.info("Server started", {
        port: serverConfig.port,
        host: serverConfig.host,
        graphqlEndpoint: yoga.graphqlEndpoint,
        graphiqlUrl: `http://${serverConfig.host}:${serverConfig.port}${yoga.graphqlEndpoint}`,
        authEndpoints: [
          "/auth/google",
          "/auth/google/callback",
          "/auth/github",
          "/auth/github/callback",
          "/auth/logout",
          "/auth/logout/all",
        ],
        healthEndpoints: [
          "/health",
          "/ready", 
          "/live",
          "/metrics",
        ],
        versioningEndpoints: [
          "/api/version",
          "/api/version/deprecation-report",
          "/api/version/migration-plan",
          "/api/version/transform-query",
          "/api/version/analytics",
        ],
        cacheEndpoints: [
          "/api/cache/stats",
          "/api/cache/health",
        ],
        databaseEndpoints: [
          "/api/database/stats",
          "/api/database/health",
          "/api/database/queries/analysis",
          "/api/database/queries/prepared",
          "/api/database/queries/slow",
          "/api/database/maintenance",
          "/api/database/config",
        ],
      });
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM, shutting down gracefully");
      server.close(async () => {
        await Promise.all([
          shutdownCache(),
          shutdownEnhancedDatabase(),
        ]);
        logger.info("Server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      logger.info("Received SIGINT, shutting down gracefully");
      server.close(async () => {
        await Promise.all([
          shutdownCache(),
          shutdownEnhancedDatabase(),
        ]);
        logger.info("Server closed");
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

startServer();
