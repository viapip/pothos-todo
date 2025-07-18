import { createServer } from 'node:http';
import { yoga } from './src/api/server/server.js';
import { logger } from './src/logger.js';
import { loadAppConfig, getServerConfig } from './src/config/index.js';

async function startServer() {
  try {
    // Load configuration
    await loadAppConfig();
    const serverConfig = getServerConfig();
    
    const server = createServer(yoga);
    
    server.listen(serverConfig.port, serverConfig.host, () => {
      logger.info('Server started', {
        port: serverConfig.port,
        host: serverConfig.host,
        graphqlEndpoint: yoga.graphqlEndpoint,
        graphiqlUrl: `http://${serverConfig.host}:${serverConfig.port}${yoga.graphqlEndpoint}`,
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