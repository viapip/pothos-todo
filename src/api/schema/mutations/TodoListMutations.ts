import { builder } from '../builder.js';
import prisma from '@/lib/prisma';
import * as TodoListCrud from '@/graphql/__generated__/TodoList';

export const CreateTodoListInput = builder.inputType('CreateTodoListInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    description: t.string({ required: false }),
  }),
});

export const UpdateTodoListInput = builder.inputType('UpdateTodoListInput', {
  fields: (t) => ({
    title: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const TodoListMutations = builder.mutationFields((t) => {
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
    resolve: async (query, root, args, context) => {
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
    resolve: async (query, root, args, context) => {
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

      return todoList;
    },
  }),

  deleteTodoList: t.boolean({
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodoList = await prisma.todoList.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodoList) throw new Error('TodoList not found');

      await prisma.todoList.delete({
        where: { id: args.id },
      });

      return true;
    },
  }),

  // Auto-generated CRUD mutations with custom args
  createOneTodoList: t.prismaField({
    ...createOne,
    args: {...createOne.args, customArg: t.arg({ type: 'String', required: false })},
    authScopes: { authenticated: true },
    resolve: async (query, root, args, context, info) => {
      const { customArg } = args;
      console.log(customArg);
      return createOne.resolve(query, root, args, context, info);
    },
  }),

  updateOneTodoList: t.prismaField({
    ...updateOne,
    args: {...updateOne.args, customArg: t.arg({ type: 'String', required: false })},
    authScopes: { authenticated: true },
    resolve: async (query, root, args, context, info) => {
      const { customArg } = args;
      console.log(customArg);
      return updateOne.resolve(query, root, args, context, info);
    },
  }),

  deleteOneTodoList: t.prismaField({
    ...deleteOne,
    args: {...deleteOne.args, customArg: t.arg({ type: 'String', required: false })},
    authScopes: { authenticated: true },
    resolve: async (query, root, args, context, info) => {
      const { customArg } = args;
      console.log(customArg);
      return deleteOne.resolve(query, root, args, context, info);
    },
  }),
  }
});