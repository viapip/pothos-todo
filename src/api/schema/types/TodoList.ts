import { builder } from '../builder.js';
import { TodoStatusEnum, PriorityEnum } from '../enums.js';
import prisma from '@/lib/prisma';

export const TodoListType = builder.prismaObject('TodoList', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    user: t.relation('user'),
    todos: t.relation('todos', {
      args: {
        status: t.arg({ type: TodoStatusEnum, required: false }),
        priority: t.arg({ type: PriorityEnum, required: false }),
      },
      query: (args) => ({
        where: {
          ...(args.status && { status: args.status }),
          ...(args.priority && { priority: args.priority }),
        },
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    }),
    todosCount: t.int({
      resolve: (todoList, args, context) => {
        return prisma.todo.count({
          where: { todoListId: todoList.id },
        });
      },
    }),
    completedTodosCount: t.int({
      resolve: (todoList, args, context) => {
        return prisma.todo.count({
          where: {
            todoListId: todoList.id,
            status: 'COMPLETED',
          },
        });
      },
    }),
    pendingTodosCount: t.int({
      resolve: (todoList, args, context) => {
        return prisma.todo.count({
          where: {
            todoListId: todoList.id,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        });
      },
    }),
    completionPercentage: t.float({
      resolve: async (todoList, args, context) => {
        const total = await prisma.todo.count({
          where: { todoListId: todoList.id },
        });
        if (total === 0) return 0;
        
        const completed = await prisma.todo.count({
          where: {
            todoListId: todoList.id,
            status: 'COMPLETED',
          },
        });
        
        return (completed / total) * 100;
      },
    }),
  }),
});

export const TodoListQueries = builder.queryFields((t) => ({
  todoList: t.prismaField({
    type: 'TodoList',
    nullable: true,
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (query, root, args, context) => {
      return prisma.todoList.findFirst({
        ...query,
        where: {
          id: args.id,
          userId: context.user?.id,
        },
      });
    },
  }),
  todoLists: t.prismaField({
    type: ['TodoList'],
    authScopes: { authenticated: true },
    args: {
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false, defaultValue: 20 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: (query, root, args, context) => {
      const where: any = {
        userId: context.user?.id,
      };

      if (args.search) {
        where.OR = [
          { title: { contains: args.search, mode: 'insensitive' } },
          { description: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      return prisma.todoList.findMany({
        ...query,
        where,
        orderBy: { createdAt: 'desc' },
        take: args.limit || undefined,
        skip: args.offset || undefined,
      });
    },
  }),
}));