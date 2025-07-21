import { builder } from '../builder.js';
import prisma from '@/lib/prisma';

export const UserType = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    todos: t.relation('todos', {
      args: {
        status: t.arg.string({ required: false }),
        priority: t.arg.string({ required: false }),
        search: t.arg.string({ required: false }),
      },
      query: (args) => ({
        where: {
          ...(args.status && { status: args.status }),
          ...(args.priority && { priority: args.priority }),
          ...(args.search && {
            OR: [
              { title: { contains: args.search, mode: 'insensitive' } },
              { description: { contains: args.search, mode: 'insensitive' } },
            ],
          }),
        },
        orderBy: { createdAt: 'desc' },
      }),
    }),
    todoLists: t.relation('todoLists', {
      query: () => ({
        orderBy: { createdAt: 'desc' },
      }),
    }),
  }),
});

export const UserQueries = builder.queryFields((t) => ({
  me: t.prismaField({
    type: 'User',
    nullable: true,
    authScopes: { authenticated: true },
    resolve: (query, root, args, context) => {
      if (!context.user) return null;
      return prisma.user.findUnique({
        ...query,
        where: { id: context.user.id },
      });
    },
  }),
  users: t.prismaField({
    type: ['User'],
    authScopes: { admin: true },
    resolve: (query, root, args, context) => {
      return prisma.user.findMany({
        ...query,
        orderBy: { createdAt: 'desc' },
      });
    },
  }),
}));