import { builder } from '../builder.js';
import { TodoStatus as TodoStatusEnum, Priority as PriorityEnum } from '@/graphql/__generated__/inputs';
import prisma from '@/lib/prisma';
import * as TodoCrud from '@/graphql/__generated__/Todo';
import { CacheManager } from '@/infrastructure/cache/CacheManager';
import { withPerformance } from '../plugins/performance.js';


export const TodoType = builder.prismaNode('Todo', {
  id: { field: 'id' },
  findUnique: (id) => ({ id }),
  fields: (t) => ({
    ...(() => {
      const { id, ...rest } = TodoCrud.TodoObject.fields(t);
      return rest;
    })(),
  }),
})


export const TodoQueries = builder.queryFields((t) => {
  const findFirst = TodoCrud.findFirstTodoQueryObject(t);
  const findMany = TodoCrud.findManyTodoQueryObject(t);
  const findUnique = TodoCrud.findUniqueTodoQueryObject(t);
  const count = TodoCrud.countTodoQueryObject(t);
  return {
    findFirst: t.prismaField(withPerformance({
      ...findFirst,
      args: {...findFirst.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return findFirst.resolve(query, root, args, context, info);
      },
      performance: {
        cache: {
          ttl: 60,
          scope: 'PUBLIC',
        },
        trace: {
          enabled: true,
          name: 'todo.findFirst',
        },
      },
    })),

    findMany: t.prismaField(withPerformance({
      ...findMany,
      args: {...findMany.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: async (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        // Performance features now handled by the plugin
        return findMany.resolve(query, root, args, context, info);
      },
      performance: {
        cache: {
          ttl: 300, // 5 minutes
          scope: 'PUBLIC',
        },
        trace: {
          enabled: true,
          name: 'todo.findMany',
        },
        timeout: 5000, // 5 seconds timeout
        complexity: {
          value: 10,
          multipliers: ['first', 'last'], // Complexity increases with pagination
        },
      },
    })),
    findUnique: t.prismaField(withPerformance({
      ...findUnique,
      args: {...findUnique.args, customArg: t.arg({ type: 'String', required: false })},
      resolve: (query, root, args, context, info) => {
        const { customArg } = args;
        console.log(customArg);
        return findUnique.resolve(query, root, args, context, info);
      },
      performance: {
        cache: {
          ttl: 600, // 10 minutes for single items
          scope: 'PUBLIC',
        },
      },
    }))
  }
})
