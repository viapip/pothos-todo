import { createServer } from 'node:http';
import { yoga } from './src/api/server/server.js';
import { logger } from './src/logger.js';

const port = parseInt(process.env.PORT || '4000');

const server = createServer(yoga);

server.listen(port, () => {
  logger.info('Server started', {
    port,
    graphqlEndpoint: yoga.graphqlEndpoint,
    graphiqlUrl: `http://localhost:${port}${yoga.graphqlEndpoint}`,
  });
});