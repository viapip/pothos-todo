import { createServer } from 'node:http';
import { yoga } from './src/api/server/server.js';
import { logger } from './src/logger.js';
import { loadAppConfig, getServerConfig } from './src/config/index.js';
import { authRoutes } from './src/routes/auth/index.js';

async function startServer() {
  try {
    // Load configuration
    await loadAppConfig();
    const serverConfig = getServerConfig();
    
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      
      // Handle auth routes
      if (url.pathname.startsWith('/auth/')) {
        const route = authRoutes[url.pathname as keyof typeof authRoutes];
        if (route && req.method && route[req.method as keyof typeof route]) {
          try {
            const handler = route[req.method as keyof typeof route] as Function;
            const request = new Request(url.toString(), {
              method: req.method,
              headers: req.headers as HeadersInit,
              body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
            });
            
            const response = await handler(request);
            
            // Copy response to Node.js response
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            
            if (response.body) {
              const body = await response.text();
              res.end(body);
            } else {
              res.end();
            }
            return;
          } catch (error) {
            logger.error('Error handling auth route:', error);
            res.statusCode = 500;
            res.end('Internal Server Error');
            return;
          }
        }
      }
      
      // Handle GraphQL requests
      return yoga(req, res);
    });
    
    server.listen(serverConfig.port, serverConfig.host, () => {
      logger.info('Server started', {
        port: serverConfig.port,
        host: serverConfig.host,
        graphqlEndpoint: yoga.graphqlEndpoint,
        graphiqlUrl: `http://${serverConfig.host}:${serverConfig.port}${yoga.graphqlEndpoint}`,
        authEndpoints: Object.keys(authRoutes),
      });
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();