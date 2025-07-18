import { builder } from '../builder.js';

// Define the root Mutation type
builder.mutationType({
  fields: (t) => ({
    // This will be extended by other mutation files
  }),
});