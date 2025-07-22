import { builder } from '../builder.js';
import { TodoStatus as TodoStatusEnum, Priority as PriorityEnum } from '@/graphql/__generated__/inputs';
import prisma from '@/lib/prisma';
import * as TodoCrud from '@/graphql/__generated__/Todo';
import { PriorityEnum as DomainPriorityEnum } from '../../../domain/value-objects/Priority.js';
import { CreateTodoCommand } from '../../../application/commands/CreateTodoCommand.js';
import { subscriptionManager, SubscriptionManager } from '../../../lib/subscriptions/manager.js';
// import { UpdateTodoCommand } from '../../../application/commands/UpdateTodoCommand.js';
// import { CompleteTodoCommand } from '../../../application/commands/CompleteTodoCommand.js';
// import { DeleteTodoCommand } from '../../../application/commands/DeleteTodoCommand.js';

export const CreateTodoInput = builder.inputType('CreateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    description: t.string({ required: false }),
    priority: t.field({ type: PriorityEnum, required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    todoListId: t.id({ required: false }),
  }),
});

export const UpdateTodoInput = builder.inputType('UpdateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: false }),
    description: t.string({ required: false }),
    priority: t.field({ type: PriorityEnum, required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    todoListId: t.id({ required: false }),
  }),
});

export const TodoMutations = builder.mutationFields((t) => {
  const createOne = TodoCrud.createOneTodoMutationObject(t);
  const updateOne = TodoCrud.updateOneTodoMutationObject(t);
  const deleteOne = TodoCrud.deleteOneTodoMutationObject(t);
  
  return {
  createTodo: t.prismaField({
    type: 'Todo',
    // authScopes: { authenticated: true },
    args: {
      input: t.arg({ type: CreateTodoInput, required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const todoId = crypto.randomUUID();
      
      const command = CreateTodoCommand.create(
        todoId,
        args.input.title,
        args.input.description ?? null,
        userId,
        args.input.todoListId ?? null,
        args.input.priority as DomainPriorityEnum || DomainPriorityEnum.MEDIUM,
        args.input.dueDate
      );

      await context.container.createTodoHandler.handle(command);

      const newTodo = await prisma.todo.findUnique({
        ...query,
        where: { id: todoId },
      });

      if (newTodo) {
        // Publish subscription event
        const event = SubscriptionManager.createTodoCreatedEvent(newTodo, userId);
        subscriptionManager.publish(event);
      }

      return newTodo;
    },
  }),

  updateTodo: t.prismaField({
    type: 'Todo',
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateTodoInput, required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodo = await prisma.todo.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodo) throw new Error('Todo not found');

      const updateData: any = {};
      if (args.input.title) updateData.title = args.input.title;
      if (args.input.description !== undefined) updateData.description = args.input.description;
      if (args.input.priority) updateData.priority = args.input.priority;
      if (args.input.dueDate !== undefined) updateData.dueDate = args.input.dueDate;
      if (args.input.todoListId !== undefined) updateData.todoListId = args.input.todoListId;

      const todo = await prisma.todo.update({
        ...query,
        where: { id: args.id },
        data: updateData,
      });

      // Publish subscription event
      const event = SubscriptionManager.createTodoUpdatedEvent(todo, userId);
      subscriptionManager.publish(event);

      return todo;
    },
  }),

  completeTodo: t.prismaField({
    type: 'Todo',
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodo = await prisma.todo.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodo) throw new Error('Todo not found');
      if (existingTodo.status === 'COMPLETED') throw new Error('Todo is already completed');

      const todo = await prisma.todo.update({
        ...query,
        where: { id: args.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return todo;
    },
  }),

  cancelTodo: t.prismaField({
    type: 'Todo',
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodo = await prisma.todo.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodo) throw new Error('Todo not found');
      if (existingTodo.status === 'COMPLETED') throw new Error('Cannot cancel completed todo');

      const todo = await prisma.todo.update({
        ...query,
        where: { id: args.id },
        data: {
          status: 'CANCELLED',
        },
      });

      return todo;
    },
  }),

  deleteTodo: t.boolean({
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodo = await prisma.todo.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodo) throw new Error('Todo not found');

      await prisma.todo.delete({
        where: { id: args.id },
      });

      // Publish subscription event
      if (existingTodo.todoListId) {
        const event = SubscriptionManager.createTodoDeletedEvent(
          args.id, 
          existingTodo.todoListId, 
          userId
        );
        subscriptionManager.publish(event);
      }

      return true;
    },
  }),

  setTodoStatus: t.prismaField({
    type: 'Todo',
    authScopes: { authenticated: true },
    args: {
      id: t.arg.id({ required: true }),
      status: t.arg({ type: TodoStatusEnum, required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const userId = context.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const existingTodo = await prisma.todo.findFirst({
        where: { id: args.id, userId },
      });

      if (!existingTodo) throw new Error('Todo not found');

      const updateData: any = { status: args.status };
      if (args.status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      const todo = await prisma.todo.update({
        ...query,
        where: { id: args.id },
        data: updateData,
      });

      return todo;
    },
  }),

  // Auto-generated CRUD mutations with custom args
  createOneTodo: t.prismaField({
    ...createOne,
    args: {...createOne.args, customArg: t.arg({ type: 'String', required: false })},
    // authScopes: { authenticated: true },
    resolve: async (query, root, args, context, info) => {
      const { customArg } = args;
      console.log(customArg);
      return createOne.resolve(query, root, args, context, info);
    },
  }),

  updateOneTodo: t.prismaField({
    ...updateOne,
    args: {...updateOne.args, customArg: t.arg({ type: 'String', required: false })},
    authScopes: { authenticated: true },
    resolve: async (query, root, args, context, info) => {
      const { customArg } = args;
      console.log(customArg);
      return updateOne.resolve(query, root, args, context, info);
    },
  }),

  deleteOneTodo: t.prismaField({
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