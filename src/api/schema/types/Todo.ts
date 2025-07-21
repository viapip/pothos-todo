import { builder } from '../builder.js';
import { TodoStatusEnum, PriorityEnum } from '../enums.js';
import prisma from '@/lib/prisma';

export const TodoType = builder.prismaObject('Todo', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    status: t.expose('status', { type: TodoStatusEnum }),
    priority: t.expose('priority', { type: PriorityEnum }),
    dueDate: t.expose('dueDate', { type: 'DateTime', nullable: true }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    user: t.relation('user'),
    todoList: t.relation('todoList', { nullable: true }),
    isOverdue: t.boolean({
      resolve: (todo) => {
        if (!todo.dueDate) return false;
        return new Date() > todo.dueDate;
      },
    }),
    isDueToday: t.boolean({
      resolve: (todo) => {
        if (!todo.dueDate) return false;
        const today = new Date();
        const dueDate = new Date(todo.dueDate);
        return (
          dueDate.getDate() === today.getDate() &&
          dueDate.getMonth() === today.getMonth() &&
          dueDate.getFullYear() === today.getFullYear()
        );
      },
    }),
    daysUntilDue: t.int({
      nullable: true,
      resolve: (todo) => {
        if (!todo.dueDate) return null;
        const today = new Date();
        const dueDate = new Date(todo.dueDate);
        const timeDiff = dueDate.getTime() - today.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
      },
    }),
  }),
});

export const TodoQueries = builder.queryFields((t) => ({
  todo: t.prismaField({
    type: 'Todo',
    nullable: true,
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: (query, root, args, context) => {
      return prisma.todo.findFirst({
        ...query,
        where: {
          id: args.id,
          userId: context.user?.id,
        },
      });
    },
  }),
  todos: t.prismaField({
    type: ['Todo'],
    authScopes: { authenticated: true },
    args: {
      status: t.arg({ type: TodoStatusEnum, required: false }),
      priority: t.arg({ type: PriorityEnum, required: false }),
      todoListId: t.arg.id({ required: false }),
      search: t.arg.string({ required: false }),
      overdue: t.arg.boolean({ required: false }),
      dueToday: t.arg.boolean({ required: false }),
      limit: t.arg.int({ required: false, defaultValue: 50 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: (query, root, args, context) => {
      const where: any = {
        userId: context.user?.id,
      };

      if (args.status) where.status = args.status;
      if (args.priority) where.priority = args.priority;
      if (args.todoListId) where.todoListId = args.todoListId;
      
      if (args.search) {
        where.OR = [
          { title: { contains: args.search, mode: 'insensitive' } },
          { description: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      if (args.overdue) {
        where.dueDate = { lt: new Date() };
      }

      if (args.dueToday) {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        where.dueDate = {
          gte: startOfDay,
          lt: endOfDay,
        };
      }

      return prisma.todo.findMany({
        ...query,
        where,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
        take: args.limit || undefined,
        skip: args.offset || undefined,
      });
    },
  }),
}));