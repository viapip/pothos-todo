import { builder } from '../builder.js';
import './todo.js';
import './ai.js';
import './collaboration.js';

// Define the root Subscription type
builder.subscriptionType({
  fields: (t) => ({
    // This will be extended by other subscription files
  }),
});