import { builder } from '../builder.js';
import { PubSubManager } from '../../../infrastructure/realtime/PubSubManager.js';
import prisma from '@/lib/prisma';

export const TodoChangePayload = builder.objectType('TodoChangePayload', {
  fields: (t) => ({
    todo: t.prismaField({
      type: 'Todo',
      resolve: (query, payload) => payload.todo,
    }),
    action: t.string({
      resolve: (payload) => payload.action,
      description: 'The action that occurred: created, updated, completed',
    }),
    changes: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (payload) => payload.changes || null,
      description: 'What fields changed (for updates)',
    }),
  }),
});

export const TodoDeletedPayload = builder.objectType('TodoDeletedPayload', {
  fields: (t) => ({
    todoId: t.string({
      resolve: (payload) => payload.todoId,
    }),
    deletedAt: t.field({
      type: 'DateTime',
      resolve: () => new Date(),
    }),
  }),
});

export const todoSubscriptions = builder.subscriptionFields((t) => ({
  // Subscribe to all todo changes for the authenticated user
  todoChanges: t.field({
    type: TodoChangePayload,
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const userId = context.user.id;

      // Create an async generator that combines multiple event types
      async function* todoChangeGenerator() {
        // Subscribe to all relevant events
        const createdIterator = pubsub.subscribe('todoCreated');
        const updatedIterator = pubsub.subscribe('todoUpdated');
        const completedIterator = pubsub.subscribe('todoCompleted');

        // Merge the iterators
        const iterators = [
          { iterator: createdIterator, action: 'created' },
          { iterator: updatedIterator, action: 'updated' },
          { iterator: completedIterator, action: 'completed' },
        ];

        // Use Promise.race to get events from any iterator
        while (true) {
          const promises = iterators.map(async ({ iterator, action }) => {
            const result = await iterator.next();
            return { result, action };
          });

          const { result, action } = await Promise.race(promises);

          if (!result.done && result.value.userId === userId) {
            yield {
              todo: result.value.todo,
              action,
              changes: action === 'updated' ? result.value.changes : null,
            };
          }
        }
      }

      return todoChangeGenerator();
    },
    resolve: (payload: any) => payload,
  }),

  // Subscribe to todo deletions
  todoDeleted: t.field({
    type: TodoDeletedPayload,
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const userId = context.user.id;

      // Filter events to only include the user's todos
      return pubsub.subscribe('todoDeleted', {
        filter: (payload: any) => payload.userId === userId,
      });
    },
    resolve: (payload: any) => payload,
  }),

  // Subscribe to changes in a specific todo list
  todoListChanges: t.field({
    type: TodoChangePayload,
    args: {
      listId: t.arg.string({ required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Verify user has access to the list
      const list = await prisma.todoList.findFirst({
        where: {
          id: args.listId,
          userId: context.user.id,
        },
      });

      if (!list) {
        throw new Error('List not found or access denied');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();

      // Create an async generator for list-specific changes
      async function* listChangeGenerator() {
        const createdIterator = pubsub.subscribe('todoCreated');
        const updatedIterator = pubsub.subscribe('todoUpdated');
        const completedIterator = pubsub.subscribe('todoCompleted');

        const iterators = [
          { iterator: createdIterator, action: 'created' },
          { iterator: updatedIterator, action: 'updated' },
          { iterator: completedIterator, action: 'completed' },
        ];

        while (true) {
          const promises = iterators.map(async ({ iterator, action }) => {
            const result = await iterator.next();
            return { result, action };
          });

          const { result, action } = await Promise.race(promises);

          if (!result.done && result.value.todo.todoListId === args.listId) {
            yield {
              todo: result.value.todo,
              action,
              changes: action === 'updated' ? result.value.changes : null,
            };
          }
        }
      }

      return listChangeGenerator();
    },
    resolve: (payload: any) => payload,
  }),
}));