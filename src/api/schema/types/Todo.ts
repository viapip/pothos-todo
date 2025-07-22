import { builder } from '../builder.js';
// import { TodoStatus as TodoStatusEnum, Priority as PriorityEnum } from '@/graphql/__generated__/inputs';
// import prisma from '@/lib/prisma';
import * as TodoCrud from '@/graphql/__generated__/Todo';


export const TodoType = builder.prismaNode('Todo', {
  id: { field: 'id' },
  findUnique: (id) => ({ id }),
  fields: (t) => ({
    ...(() => {
      const { id: _, ...rest } = TodoCrud.TodoObject.fields?.(t) || {}; // eslint-disable-line @typescript-eslint/no-unused-vars 
      return rest || {};
    })(),
  }), 
})


export const TodoQueries = builder.queryFields((t) => {
  const findFirst = TodoCrud.findFirstTodoQueryObject(t);
  const findMany = TodoCrud.findManyTodoQueryObject(t);
  const findUnique = TodoCrud.findUniqueTodoQueryObject(t);
  const _ = TodoCrud.countTodoQueryObject(t);
  // count result intentionally unused - available for potential future use
  void _; // Mark as intentionally unused
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
