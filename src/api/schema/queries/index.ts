import { builder } from '../builder.js';

// Define the root Query type
builder.queryType({
  fields: (t) => ({
    hello: t.string({
      resolve: () => 'Hello World from Pothos GraphQL!',
    }),
  }),
});