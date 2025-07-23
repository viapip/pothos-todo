import { builder } from '../builder.js';
import './auth.js'; // Import auth queries to register them
import './todo.js'; // Import todo queries to register them
// TODO: Fix objectRef types before re-enabling AI features
// import './ai.js'; // Import AI queries to register them
// import './rag.js'; // Import RAG queries to register them

// Define the root Query type
builder.mutationType({
  description: 'Root mutation type',
});

// Define the root Query type
builder.queryType({
  description: 'Root query type',
});   