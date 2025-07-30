import { createYoga } from "graphql-yoga";
import { schema } from "../schema/schema.js";
import { Container } from "../../infrastructure/container/Container.js";
import { logger } from "../../logger.js";
import { createH3GraphQLContext } from "../../middleware/auth.js";
import type { Context } from "../schema/builder.js";
import type { H3Event } from "h3";

type YogaContext = {
  h3Event: H3Event;
};

const container = Container.getInstance();

// Create a function that will be called with H3 event
export function createYogaWithH3Context() {
  return createYoga<YogaContext, Context>({
    schema,
    context: async ({ h3Event }) => {
      return {
        user: null,
        session: null,
        container,
        h3Event: h3Event,
      };
    },
    graphqlEndpoint: "/graphql",
    graphiql: {
      title: "Pothos Todo GraphQL API",
    },
    plugins: [],
  });
}

export const yoga = createYogaWithH3Context();
