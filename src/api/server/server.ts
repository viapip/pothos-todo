import { createYoga } from 'graphql-yoga';
import { schema } from '../schema/schema.js';
import { Container } from '../../infrastructure/container/Container.js';
import { logger } from '../../logger.js';
import prisma from '@/lib/prisma';
import type { Context } from '../schema/builder.js';

const container = Container.getInstance();

export const yoga = createYoga<Context>({
  schema,
  context: async ({ request }) => {
    const authHeader = request.headers.get('authorization');
    let user = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      try {
        user = await prisma.user.findUnique({
          where: { id: token },
        });
        logger.debug('User authenticated', { userId: user?.id });
      } catch (error) {
        logger.error('Error fetching user:', error);
      }
    }

    return {
      user,
      container,
    };
  },
  graphqlEndpoint: '/graphql',
  graphiql: {
    title: 'Pothos Todo GraphQL API',
  },
  plugins: [],
});