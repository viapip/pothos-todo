import { builder } from '../builder.js';
import './auth.js'; // Import auth queries to register them

// Define the root Query type
builder.queryType({
  fields: (t) => ({
    hello: t.string({
      resolve: () => 'Hello World from Pothos GraphQL!',
    }),
  }),
});