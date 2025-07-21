import { builder } from '../schema/builder.js';
import prisma from '@/lib/prisma';
import type { Context } from '../schema/builder.js';

// Federation entity resolvers are handled via the federation plugin
// This file can be removed or kept for future federation-specific resolvers
export const TodoListResolvers = {
  __resolveReference: async (reference: { id: string }, context: Context) => {
    const { id } = reference;
    return await prisma.todoList.findUnique({
      where: { id },
    });
  },
};