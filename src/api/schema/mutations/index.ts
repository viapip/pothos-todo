import { builder } from '../builder.js';
import './auth.js'; // Import auth mutations to register them

// Define the root Mutation type
builder.mutationType({
  fields: (t) => ({
    // This will be extended by other mutation files
  }),
});