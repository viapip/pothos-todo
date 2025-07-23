import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { CreateTodoCommand } from '../../../application/commands/CreateTodoCommand.js';
import { UpdateTodoCommand } from '../../../application/commands/UpdateTodoCommand.js';
import { CompleteTodoCommand } from '../../../application/commands/CompleteTodoCommand.js';
import { DeleteTodoCommand } from '../../../application/commands/DeleteTodoCommand.js';
import { Priority, TodoStatus } from '../enums.js';
import { Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { aiPipelineService } from '@/infrastructure/ai/AIPipelineService.js';
import prisma from '@/lib/prisma';

const CreateTodoInput = builder.inputType('CreateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    priority: t.field({ type: Priority, required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    tags: t.stringList({ required: false }),
    listId: t.string({ required: false }),
    description: t.string({ required: false }),
    status: t.field({ type: TodoStatus, required: false }),
    completedAt: t.field({ type: 'DateTime', required: false }),
    enableAIAnalysis: t.boolean({ required: false, defaultValue: true }),
  }),
});

const UpdateTodoInput = builder.inputType('UpdateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: false }),
    priority: t.field({ type: Priority, required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    tags: t.stringList({ required: false }),
    listId: t.string({ required: false }),
    status: t.field({ type: TodoStatus, required: false }),
    description: t.string({ required: false }),
    completedAt: t.field({ type: 'DateTime', required: false }),
  }),
});

export const todoMutations = builder.mutationFields((t) => ({
  createTodo: t.prismaField({
    type: 'Todo',
    args: {
      input: t.arg({ type: CreateTodoInput, required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const handler = container.createTodoHandler;
      const todoRepository = container.todoRepository;

      const todoId = crypto.randomUUID();
      const command = CreateTodoCommand.create(
        todoId,
        args.input.title,
        context.user.id,
        args.input.listId || null,
        args.input.priority as PrismaPriority,
        args.input.dueDate as Date,
        args.input.tags as string[],
        args.input.description as string | null,
        args.input.status as PrismaTodoStatus,
        args.input.completedAt as Date | null,
        new Date(),
        new Date(),
        1,
      );

      const todoAggregate = await handler.handle(command);
      const todo = await todoRepository.findById(todoAggregate.id);

      if (!todo) {
        throw new Error('Failed to create todo');
      }

      // Trigger AI analysis in the background (non-blocking) if enabled
      if (args.input.enableAIAnalysis !== false) {
        try {
          const pipeline = aiPipelineService(prisma);
          pipeline.analyzeTodoCreation(
            todo.id,
            todo.title,
            todo.description,
            context.user.id
          ).catch(error => {
            console.error('Background AI analysis failed:', error);
          });
        } catch (error) {
          // Don't fail the todo creation if AI analysis fails
          console.error('Failed to start AI analysis:', error);
        }
      }

      return todo;
    },

  }),

  updateTodo: t.prismaField({
    type: 'Todo',
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateTodoInput, required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const handler = container.updateTodoHandler;
      const todoRepository = container.todoRepository;

      const command = UpdateTodoCommand.create(
        args.id,
        context.user.id,
        {
          title: args.input.title || undefined,
          priority: args.input.priority as PrismaPriority | null,
          status: args.input.status as PrismaTodoStatus | null,
          dueDate: args.input.dueDate as Date | null,
          tags: args.input.tags as string[] | undefined,
          todoListId: args.input.listId || undefined,
          description: args.input.description || undefined,
          completedAt: args.input.completedAt as Date | null,
        }
      );

      await handler.handle(command);
      const todo = await todoRepository.findById(args.id);

      if (!todo) {
        throw new Error('Todo not found');
      }

      return todo;
    },

  }),

  completeTodo: t.prismaField({
    type: 'Todo',
    args: {
      id: t.arg.string({ required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const handler = container.completeTodoHandler;
      const todoRepository = container.todoRepository;

      const command = new CompleteTodoCommand(
        args.id,
        context.user.id
      );

      await handler.handle(command);
      const todo = await todoRepository.findById(args.id);

      if (!todo) {
        throw new Error('Todo not found');
      }

      return todo;
    },

  }),

  deleteTodo: t.field({
    type: 'Boolean',
    args: {
      id: t.arg.string({ required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const handler = container.deleteTodoHandler;

      const command = new DeleteTodoCommand(
        args.id,
        context.user.id
      );

      await handler.handle(command);
      return true;
    },

  }),
}));