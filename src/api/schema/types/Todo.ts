import { builder } from '../builder.js';
import { TodoStatusEnum, PriorityEnum } from '../enums.js';
import prisma from '@/lib/prisma';
import * as TodoCrud from '@/graphql/__generated__/Todo';


export const TodoType = builder.prismaNode('Todo', {
  id: {
    field: 'id',
  },
  fields: (t) => ({
    ...TodoCrud.TodoObject.fields(t),
  }),
})


export const TodoQueries = builder.queryFields((t) => {
  const findFirst = TodoCrud.findFirstTodoQueryObject(t);
  const findMany = TodoCrud.findManyTodoQueryObject(t);
  const findUnique = TodoCrud.findUniqueTodoQueryObject(t);
  const count = TodoCrud.countTodoQueryObject(t);
  return {
    findFirst: t.prismaField({
      ...findFirst,
      args: {...findFirst.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return findFirst.resolve(query, root, args, context, info);
      },
    }),

    findMany: t.prismaField({
      ...findMany,
      args: {...findMany.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return findMany.resolve(query, root, args, context, info);
      },
    }),
    findUnique: t.prismaField({
      ...findUnique,
      args: {...findUnique.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return findUnique.resolve(query, root, args, context, info);
      },
    })
  }
})
