import { builder } from '../builder.js';
import './auth.js'; // Import auth queries to register them
import './todo.js'; // Import todo queries to register them
import './ai.js'; // Import AI queries to register them
import './rag.js'; // Import RAG queries to register them
import './predictions.js'; // Import prediction queries to register them

// Define the root Query type
builder.queryType({
  fields: (t) => ({
    hello: t.string({
      resolve: () => 'Hello World from Pothos GraphQL!',
    }),
  }),
});   