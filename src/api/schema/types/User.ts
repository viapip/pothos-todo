import { builder } from '../builder.js';
import { TodoStatus as TodoStatusEnum, Priority as PriorityEnum } from '../enums.js';

import prisma from '@/lib/prisma';
import * as UserCrud from '@/graphql/__generated__/User';


export const UserType = builder.prismaNode('User', {
  id: { field: 'id' },
  findUnique: (id) => ({ id }),
  fields: (t) => ({
    ...(() => {
      const { id, email, ...rest } = UserCrud.UserObject.fields(t);
      return {
        email: t.exposeString('email'),
        ...rest,
      };
    })(),
    todos: t.relation('todos', {
      args: {
        status: t.arg({ type: TodoStatusEnum, required: false }),
        priority: t.arg({ type: PriorityEnum, required: false }),
        search: t.arg.string({ required: false }),
      },
      query: (args: any) => ({
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

export const UserQueries = builder.queryFields((t: any) => {
  const findFirst = UserCrud.findFirstUserQueryObject(t);
  const findMany = UserCrud.findManyUserQueryObject(t);
  const findUnique = UserCrud.findUniqueUserQueryObject(t);
  const count = UserCrud.countUserQueryObject(t);
  return {
    me: t.prismaField({
      type: 'User',
      nullable: true,
      authScopes: { authenticated: true },
      resolve: (query: any, root: any, args: any, context: any) => {
        if (!context.user) return null;
        return prisma.user.findUnique({
          ...query,
          where: { id: context.user.id },
        });
      },
    }),

    findFirstUser: t.prismaField({
      ...findFirst,
      args: { ...findFirst.args, customArg: t.arg({ type: 'String', required: false }) },
      authScopes: { admin: true },
      resolve: (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return findFirst.resolve(query, root, args, context, info);
      },
    }),

    findManyUser: t.prismaField({
      ...findMany,
      args: { ...findMany.args, customArg: t.arg({ type: 'String', required: false }) },
      resolve: (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return findMany.resolve(query, root, args, context, info);
      },
    }),

    findUniqueUser: t.prismaField({
      ...findUnique,
      args: { ...findUnique.args, customArg: t.arg({ type: 'String', required: false }) },
      authScopes: { admin: true },
      resolve: (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return findUnique.resolve(query, root, args, context, info);
      },
    }),

    users: t.prismaField({
      ...findMany,
      authScopes: { admin: true },
      resolve: (query: any, root: any, args: any, context: any) => {
        return prisma.user.findMany({
          ...query,
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }
});