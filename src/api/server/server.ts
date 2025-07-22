import { createYoga } from 'graphql-yoga';
import { schema } from '../schema/schema.js';
import { Container } from '../../infrastructure/container/Container.js';
import { logger } from '../../logger.js';
import { createGraphQLContext } from '../../middleware/auth.js';
import type { Context } from '../schema/builder.js';

const container = Container.getInstance();

export const yoga = createYoga<Context>({
  schema,
  context: createGraphQLContext(container),
  graphqlEndpoint: '/graphql',
  graphiql: {
    title: 'Pothos Todo GraphQL API',
  },
  plugins: [],
});