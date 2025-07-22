import { builder } from '../builder.js';
import { PubSubManager } from '../../../infrastructure/realtime/PubSubManager.js';
import prisma from '@/lib/prisma';

export const UserPresencePayload = builder.objectType('UserPresencePayload', {
  fields: (t) => ({
    user: t.prismaField({
      type: 'User',
      resolve: (query, payload) => payload.user,
    }),
    status: t.string({
      resolve: (payload) => payload.status,
      description: 'online or offline',
    }),
    lastActivity: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (payload) => payload.lastActivity || null,
    }),
  }),
});

export const UserActivityPayload = builder.objectType('UserActivityPayload', {
  fields: (t) => ({
    userId: t.string({
      resolve: (payload) => payload.userId,
    }),
    activity: t.string({
      resolve: (payload) => payload.activity,
      description: 'What the user is doing (viewing, editing, etc.)',
    }),
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (payload) => payload.metadata || null,
      description: 'Additional context about the activity',
    }),
    timestamp: t.field({
      type: 'DateTime',
      resolve: () => new Date(),
    }),
  }),
});

export const UserTypingPayload = builder.objectType('UserTypingPayload', {
  fields: (t) => ({
    userId: t.string({
      resolve: (payload) => payload.userId,
    }),
    listId: t.string({
      resolve: (payload) => payload.listId,
    }),
    todoId: t.string({
      nullable: true,
      resolve: (payload) => payload.todoId || null,
    }),
    isTyping: t.boolean({
      resolve: () => true,
    }),
  }),
});

export const CollaboratorJoinedPayload = builder.objectType('CollaboratorJoinedPayload', {
  fields: (t) => ({
    user: t.prismaField({
      type: 'User',
      resolve: (query, payload) => payload.user,
    }),
    listId: t.string({
      resolve: (payload) => payload.listId,
    }),
    joinedAt: t.field({
      type: 'DateTime',
      resolve: () => new Date(),
    }),
  }),
});

export const collaborationSubscriptions = builder.subscriptionFields((t) => ({
  // User presence updates
  userPresence: t.field({
    type: UserPresencePayload,
    args: {
      userIds: t.arg.stringList({
        required: false,
        description: 'Filter by specific user IDs',
      }),
    },
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const filterUserIds = args.userIds;

      // Create async generator for presence events
      async function* presenceGenerator() {
        const onlineIterator = pubsub.subscribe('userOnline');
        const offlineIterator = pubsub.subscribe('userOffline');

        while (true) {
          const [onlineResult, offlineResult] = await Promise.all([
            onlineIterator.next(),
            offlineIterator.next(),
          ]);

          if (!onlineResult.done) {
            const { userId, user } = onlineResult.value;
            if (!filterUserIds || filterUserIds.includes(userId)) {
              yield { user, status: 'online', lastActivity: new Date() };
            }
          }

          if (!offlineResult.done) {
            const { userId } = offlineResult.value;
            if (!filterUserIds || filterUserIds.includes(userId)) {
              const user = await prisma.user.findUnique({ where: { id: userId } });
              if (user) {
                yield { user, status: 'offline', lastActivity: null };
              }
            }
          }
        }
      }

      return presenceGenerator();
    },
    resolve: (payload: any) => payload,
  }),

  // Real-time activity tracking
  userActivity: t.field({
    type: UserActivityPayload,
    args: {
      listId: t.arg.string({
        required: false,
        description: 'Filter activities by list',
      }),
    },
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const listId = args.listId;

      return pubsub.subscribe('userActivity', {
        filter: (payload: any) => {
          if (listId && payload.metadata?.listId !== listId) {
            return false;
          }
          // Don't send user's own activities back to them
          return payload.userId !== context.user!.id;
        },
      });
    },
    resolve: (payload: any) => payload,
  }),

  // Typing indicators
  userTyping: t.field({
    type: UserTypingPayload,
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

      // Verify access to the list
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

      return pubsub.subscribe('userTyping', {
        filter: (payload: any) => {
          return payload.listId === args.listId && payload.userId !== context.user!.id;
        },
      });
    },
    resolve: (payload) => payload,
  }),

  // Collaborator joined/left events
  collaboratorJoined: t.field({
    type: CollaboratorJoinedPayload,
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

      const pubsub = PubSubManager.getInstance().getPubSub();

      return pubsub.subscribe('userJoinedList', {
        filter: (payload) => payload.listId === args.listId,
      });
    },
    resolve: (payload) => payload,
  }),
}));