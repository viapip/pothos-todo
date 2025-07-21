import { builder } from './builder.js';

// Import root types first
import './queries/index.js';
import './mutations/index.js';

import './enums.js';
import './types/User.js';
import './types/Todo.js';
import './types/TodoList.js';
import './types/Session.js';
import './mutations/TodoMutations.js';
import './mutations/TodoListMutations.js';

export const schema = builder.toSchema();

export const federationSchema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.0',
});

export default schema;