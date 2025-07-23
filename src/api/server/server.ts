import { createYoga } from "graphql-yoga";
import { schema } from "../schema/schema.js";
import { Container } from "../../infrastructure/container/Container.js";
import { logger } from "../../logger.js";
import { createH3GraphQLContext } from "../../middleware/auth.js";
import { initContextCache } from '@pothos/core';
import type { Context } from "../schema/builder.js";
import type { H3Event } from "h3";
import { createDataLoaders } from "../dataloaders/index.js";
import { createResponseCachePlugin } from "../plugins/responseCache.js";
import { createQueryComplexityPlugin, complexityEstimators } from "../plugins/queryComplexity.js";

type YogaContext = {
  h3Event?: H3Event;
};

// Create a function that will be called with H3 event
export function createYogaWithH3Context() {
  return createYoga<YogaContext, Context>({
    schema,
    context: async ({ h3Event }) => {
      const container = Container.getInstance();
      const contextCache = initContextCache();

      // For HTTP requests
      return {
        ...contextCache,
        container,
        h3Event: h3Event!,
        user: null,
        session: null,
        loaders: createDataLoaders(),
      };
    },
    plugins: [
      createResponseCachePlugin({
        ttl: 300, // 5 minutes
        includeUserContext: true,
        skipOperations: ['IntrospectionQuery'],
      }),
      createQueryComplexityPlugin({
        maxComplexity: 1000,
        defaultComplexity: 1,
        defaultListMultiplier: 10,
        estimators: {
          Query: {
            todos: complexityEstimators.multiplierFromArgs(1),
            searchTodos: complexityEstimators.multiplierFromArgs(2), // Search is more expensive
            todoStats: complexityEstimators.fixed(10), // Stats query has fixed cost
          },
          Todo: {
            user: complexityEstimators.fixed(1),
            todoList: complexityEstimators.fixed(1),
          },
          TodoList: {
            todos: complexityEstimators.multiplierFromArgs(1),
          },
          User: {
            todos: complexityEstimators.multiplierFromArgs(1),
            todoLists: complexityEstimators.multiplierFromArgs(1),
          },
        },
        onExceededComplexity: (complexity, maxComplexity, query) => {
          logger.error('Query too complex', {
            complexity,
            maxComplexity,
            query: query.substring(0, 500),
          });
        },
      }),
    ],
    graphqlEndpoint: "/graphql",
    graphiql: {
      title: "Pothos Todo GraphQL API",
      credentials: 'include',
    },
  });
}

export const yoga = createYogaWithH3Context();