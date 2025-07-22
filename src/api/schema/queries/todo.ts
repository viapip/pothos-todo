import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import prisma from '@/lib/prisma';

export const todoQueries = builder.queryFields((t) => ({
  todo: t.prismaField({
    type: 'Todo',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      return prisma.todo.findFirst({
        ...query,
        where: {
          id: args.id,
          userId: context.user.id,
        },
      });
    },
  }),

  todos: t.prismaField({
    type: ['Todo'],
    args: {
      status: t.arg.string({ required: false }),
      priority: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false, defaultValue: 50 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const where: any = {
        userId: context.user.id,
      };

      // Apply filters
      if (args.status) {
        where.status = args.status;
      }

      if (args.priority) {
        where.priority = args.priority;
      }

      if (args.search) {
        where.OR = [
          { title: { contains: args.search, mode: 'insensitive' } },
          { description: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      return prisma.todo.findMany({
        ...query,
        where,
        skip: args.offset || undefined,
        take: args.limit || undefined,
        orderBy: { createdAt: 'desc' },
      });
    },
  }),

  todoStats: t.field({
    type: builder.objectType('TodoStats', {
      fields: (t) => ({
        total: t.int({
          resolve: (stats) => stats.total,
        }),
        pending: t.int({
          resolve: (stats) => stats.pending,
        }),
        inProgress: t.int({
          resolve: (stats) => stats.inProgress,
        }),
        completed: t.int({
          resolve: (stats) => stats.completed,
        }),
        cancelled: t.int({
          resolve: (stats) => stats.cancelled,
        }),
        byPriority: t.field({
          type: builder.objectType('TodoPriorityStats', {
            fields: (t) => ({
              low: t.int({
                resolve: (stats) => stats.low,
              }),
              medium: t.int({
                resolve: (stats) => stats.medium,
              }),
              high: t.int({
                resolve: (stats) => stats.high,
              }),
              critical: t.int({
                resolve: (stats) => stats.critical,
              }),
            }),
          }),
          resolve: (stats) => stats.byPriority,
        }),
      }),
    }),
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const todoRepository = container.todoRepository;

      const todos = await todoRepository.findByUserId(context.user.id);

      const stats = {
        total: todos.length,
        pending: todos.filter(t => t.status.value === 'PENDING').length,
        inProgress: todos.filter(t => t.status.value === 'IN_PROGRESS').length,
        completed: todos.filter(t => t.status.value === 'COMPLETED').length,
        cancelled: todos.filter(t => t.status.value === 'CANCELLED').length,
        byPriority: {
          low: todos.filter(t => t.priority.value === 'LOW').length,
          medium: todos.filter(t => t.priority.value === 'MEDIUM').length,
          high: todos.filter(t => t.priority.value === 'HIGH').length,
          critical: todos.filter(t => t.priority.value === 'URGENT').length,
        },
      };

      return stats;
    },
  }),
}));