import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { CreateTodoCommand } from '../../../application/commands/CreateTodoCommand.js';
import { UpdateTodoCommand } from '../../../application/commands/UpdateTodoCommand.js';
import { CompleteTodoCommand } from '../../../application/commands/CompleteTodoCommand.js';
import { DeleteTodoCommand } from '../../../application/commands/DeleteTodoCommand.js';

const CreateTodoInput = builder.inputType('CreateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    description: t.string({ required: false }),
    priority: t.string({ required: false, defaultValue: 'medium' }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    tags: t.stringList({ required: false }),
    listId: t.string({ required: false }),
  }),
});

const UpdateTodoInput = builder.inputType('UpdateTodoInput', {
  fields: (t) => ({
    title: t.string({ required: false }),
    description: t.string({ required: false }),
    priority: t.string({ required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    tags: t.stringList({ required: false }),
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
        args.input.description || null,
        context.user.id,
        args.input.listId || null,
        args.input.priority as any,
        args.input.dueDate || null
      );

      const todoAggregate = await handler.handle(command);
      const todo = await todoRepository.findById(todoAggregate.id);

      if (!todo) {
        throw new Error('Failed to create todo');
      }

      return todo;
    },
    performance: {
      rateLimit: {
        limit: 10,
        window: 60, // 10 todos per minute
        keyType: 'user',
      },
      trace: {
        enabled: true,
        name: 'mutation.createTodo',
      },
      timeout: 3000, // 3 seconds
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
          description: args.input.description,
          priority: args.input.priority as any,
          dueDate: args.input.dueDate || undefined,
          todoListId: undefined, // tags are not handled in UpdateTodoCommand
        }
      );

      await handler.handle(command);
      const todo = await todoRepository.findById(args.id);

      if (!todo) {
        throw new Error('Todo not found');
      }

      return todo;
    },
    performance: {
      rateLimit: {
        limit: 20,
        window: 60, // 20 updates per minute
        keyType: 'user',
      },
      trace: {
        enabled: true,
        name: 'mutation.updateTodo',
      },
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
    performance: {
      rateLimit: {
        limit: 30,
        window: 60, // 30 completions per minute
        keyType: 'user',
      },
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
    performance: {
      rateLimit: {
        limit: 5,
        window: 60, // 5 deletions per minute for safety
        keyType: 'user',
      },
      trace: {
        enabled: true,
        name: 'mutation.deleteTodo',
      },
    },
  }),
}));