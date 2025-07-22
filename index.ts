import { createApp, eventHandler, useSession, toNodeListener } from "h3";
import { yoga } from "./src/api/server/server.js";
import { logger } from "./src/logger.js";
import {
  loadAppConfig,
  getServerConfig,
  getSessionConfig,
  getTelemetryConfig,
  getCacheConfig,
} from "./src/config/index.js";
import {
  handleGoogleLogin,
  handleGoogleCallback,
  handleGitHubLogin,
  handleGitHubCallback,
  handleLogout,
  handleLogoutAll,
} from "./src/routes/auth/index.js";
import { createServer } from "node:http";
import { initializeTelemetry, shutdownTelemetry } from "./src/infrastructure/telemetry/telemetry.js";
import { CacheManager } from "./src/infrastructure/cache/CacheManager.js";

async function startServer() {
  try {
    // Load configuration
    await loadAppConfig();
    const serverConfig = getServerConfig();
    const sessionConfig = getSessionConfig();
    const telemetryConfig = getTelemetryConfig();
    const cacheConfig = getCacheConfig();

    // Initialize telemetry if enabled
    if (telemetryConfig.enabled) {
      initializeTelemetry();
      logger.info("OpenTelemetry initialized");
    }

    // Initialize cache manager if enabled
    if (cacheConfig.enabled) {
      const cacheManager = CacheManager.getInstance();
      await cacheManager.connect();
      logger.info("Cache manager initialized");
    }

    // Create H3 app
    const app = createApp();

    // Global middleware for request logging
    app.use(
      eventHandler(async (event) => {
        const startTime = Date.now();
        event.context.startTime = startTime;

        logger.info("Request", {
          method: event.node.req.method,
          url: event.node.req.url,
          userAgent: event.node.req.headers["user-agent"],
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
      })
    );

    app.use(
      "/auth/logout/all",
      eventHandler(async (event) => {
        if (event.node.req.method === "POST") {
          return await handleLogoutAll(event);
        }
      })
    );

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
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(async () => {
        logger.info("HTTP server closed");
        
        // Shutdown cache manager
        if (cacheConfig.enabled) {
          const cacheManager = CacheManager.getInstance();
          await cacheManager.disconnect();
          logger.info("Cache manager shutdown complete");
        }
        
        // Shutdown telemetry
        if (telemetryConfig.enabled) {
          await shutdownTelemetry();
          logger.info("Telemetry shutdown complete");
        }
        
        // Add any other cleanup here
        logger.info("Graceful shutdown complete");
        process.exit(0);
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    return server;
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

startServer();
