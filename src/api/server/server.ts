import { createYoga } from "graphql-yoga";
import { useGraphQLSSE } from "@graphql-yoga/plugin-graphql-sse";
import { schema } from "../schema/schema.js";
import { Container } from "../../infrastructure/container/Container.js";
import { createVersioningPlugins } from "../../lib/versioning/plugin.js";
import { createCachedContext, createCacheMiddleware } from "../../lib/cache/integration.js";
// import { logger } from "../../logger.js";
// import { createH3GraphQLContext } from "../../middleware/auth.js";
import type { Context } from "../schema/builder.js";
import type { ExtendedContext } from "../../lib/cache/integration.js";
import type { H3Event } from "h3";

type YogaContext = {
  h3Event: H3Event;
};

const container = Container.getInstance();

// Create a function that will be called with H3 event
export function createYogaWithH3Context() {
  return createYoga<YogaContext, ExtendedContext>({
    schema,
    context: async ({ h3Event }) => {
      // Create base context
      const baseContext: Context = {
        user: null, // TODO: Extract user from H3 session
        session: null, // TODO: Extract session from H3
        container,
        h3Event: h3Event,
      };

      // Extend with cache capabilities
      return createCachedContext(baseContext);
    },
    graphqlEndpoint: "/graphql",
    graphiql: {
      title: "Pothos Todo GraphQL API",
      subscriptionsProtocol: 'SSE',
    },
    plugins: [
      // Enable Server-Sent Events for subscriptions
      useGraphQLSSE(),
      // Enable API versioning and deprecation tracking
      ...createVersioningPlugins(),
    ],
    // Add cache middleware
    ...createCacheMiddleware(),
  });
}

export const yoga = createYogaWithH3Context();
