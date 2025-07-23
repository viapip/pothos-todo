import { builder } from '../builder.js';
import prisma from '@/lib/prisma';
import * as TodoListCrud from '@/graphql/__generated__/TodoList';
import { invalidateCache } from '@/api/plugins/responseCache.js';

export const CreateTodoListInput = builder.inputType('CreateTodoListInput', {
  fields: (t: any) => ({
    title: t.string({ required: true, validate: { minLength: 1, maxLength: 200 } }),
    description: t.string({ required: false, validate: { maxLength: 1000 } }),
  }),
});

export const UpdateTodoListInput = builder.inputType('UpdateTodoListInput', {
  fields: (t: any) => ({
    title: t.string({ required: false, validate: { minLength: 1, maxLength: 200 } }),
    description: t.string({ required: false, validate: { maxLength: 1000 } }),
  }),
});

export const TodoListMutations = builder.mutationFields((t: any) => {
  const createOne = TodoListCrud.createOneTodoListMutationObject(t);
  const updateOne = TodoListCrud.updateOneTodoListMutationObject(t);
  const deleteOne = TodoListCrud.deleteOneTodoListMutationObject(t);

  return {
    createTodoList: t.prismaField({
      type: 'TodoList',
      authScopes: { authenticated: true },
      args: {
        input: t.arg({ type: CreateTodoListInput, required: true }),
      },
      resolve: async (query: any, root: any, args: any, context: any) => {
        const userId = context.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const todoListId = crypto.randomUUID();

        const todoList = await prisma.todoList.create({
          ...query,
          data: {
            id: todoListId,
            title: args.input.title,
            description: args.input.description,
            userId,
          },
        });

        // Invalidate cache for the new list
        await invalidateCache('TodoList', todoList.id);
        await invalidateCache('User', context.user?.id);

        return todoList;
      },
    }),

    updateTodoList: t.prismaField({
      type: 'TodoList',
      authScopes: { authenticated: true },
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: UpdateTodoListInput, required: true }),
      },
      resolve: async (query: any, root: any, args: any, context: any) => {
        const userId = context.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const existingTodoList = await prisma.todoList.findFirst({
          where: { id: args.id, userId },
        });

        if (!existingTodoList) throw new Error('TodoList not found');

        const updateData: any = {};
        if (args.input.title) updateData.title = args.input.title;
        if (args.input.description !== undefined) updateData.description = args.input.description;

        const todoList = await prisma.todoList.update({
          ...query,
          where: { id: args.id },
          data: updateData,
        });

        // Invalidate cache for the updated list
        await invalidateCache('TodoList', todoList.id);
        await invalidateCache('User', context.user?.id);

        return todoList;
      },
    }),

    deleteTodoList: t.boolean({
      authScopes: { authenticated: true },
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (root: any, args: any, context: any) => {
        const userId = context.user?.id;
        if (!userId) throw new Error('Not authenticated');

        const existingTodoList = await prisma.todoList.findFirst({
          where: { id: args.id, userId },
        });

        if (!existingTodoList) throw new Error('TodoList not found');

        await prisma.todoList.delete({
          where: { id: args.id },
        });

        // Invalidate cache for the deleted list
        await invalidateCache('TodoList', args.id);
        await invalidateCache('User', context.user?.id);

        return true;
      },
    }),

    // Auto-generated CRUD mutations with custom args
    createOneTodoList: t.prismaField({
      ...createOne,
      args: { ...createOne.args, customArg: t.arg({ type: 'String', required: false }) },
      authScopes: { authenticated: true },
      resolve: async (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return createOne.resolve(query, root, args, context, info);
      },
    }),

    updateOneTodoList: t.prismaField({
      ...updateOne,
      args: { ...updateOne.args, customArg: t.arg({ type: 'String', required: false }) },
      authScopes: { authenticated: true },
      resolve: async (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return updateOne.resolve(query, root, args, context, info);
      },
    }),

    deleteOneTodoList: t.prismaField({
      ...deleteOne,
      args: { ...deleteOne.args, customArg: t.arg({ type: 'String', required: false }) },
      authScopes: { authenticated: true },
      resolve: async (query: any, root: any, args: any, context: any, info: any) => {
        const { customArg } = args;
        console.log(customArg);
        return deleteOne.resolve(query, root, args, context, info);
      },
    }),
  }
});