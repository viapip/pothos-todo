import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { CreateTodoCommand } from '../../../application/commands/CreateTodoCommand.js';
import { PriorityEnum } from '../../../domain/value-objects/Priority.js';
import { TodoWithPredictionsType } from '../types/ai.js';

const CreateTodoWithAIInput = builder.inputType('CreateTodoWithAIInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    description: t.string({ required: false }),
    dueDate: t.field({ type: 'DateTime', required: false }),
    tags: t.stringList({ required: false }),
    listId: t.string({ required: false }),
    useSuggestedPriority: t.boolean({ 
      required: false, 
      defaultValue: true,
      description: 'Whether to use AI-suggested priority' 
    }),
  }),
});

// TodoWithPredictions type is imported from types/ai.js

export const aiEnhancedMutations = builder.mutationFields((t) => ({
  // Create a todo with AI-enhanced features
  createTodoWithAI: t.field({
    type: TodoWithPredictionsType,
    args: {
      input: t.arg({ type: CreateTodoWithAIInput, required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const mlService = container.mlPredictionService;
      const createTodoHandler = container.createTodoHandler;
      const todoRepository = container.todoRepository;

      // Get AI-suggested priority if requested
      let prioritySuggestion = null;
      let priority = PriorityEnum.MEDIUM;

      if (args.input.useSuggestedPriority) {
        prioritySuggestion = await mlService.suggestPriority(
          args.input.title,
          args.input.description || null,
          context.user.id
        );
        
        // Use suggested priority if confidence is high enough
        if (prioritySuggestion.confidence > 0.7) {
          priority = prioritySuggestion.suggestedPriority as PriorityEnum;
        }
      }

      // Create the todo
      const todoId = crypto.randomUUID();
      const command = CreateTodoCommand.create(
        todoId,
        args.input.title,
        args.input.description || null,
        context.user.id,
        args.input.listId || null,
        priority,
        args.input.dueDate || null
      );

      const todoAggregate = await createTodoHandler.handle(command);
      const todo = await todoRepository.findById(todoAggregate.id);

      if (!todo) {
        throw new Error('Failed to create todo');
      }

      // Get completion time prediction
      const completionPrediction = await mlService.predictCompletionTime(
        todo.id,
        context.user.id
      );

      return {
        todo,
        predictedCompletionTime: completionPrediction,
        suggestedPriority: prioritySuggestion,
      };
    },
  }),

  // Batch create todos from AI suggestions
  createTodosFromSuggestions: t.prismaField({
    type: ['Todo'],
    args: {
      suggestions: t.arg.stringList({ 
        required: true,
        description: 'List of suggested task titles to create' 
      }),
      listId: t.arg.string({ 
        required: false,
        description: 'Optional list to add todos to' 
      }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const mlService = container.mlPredictionService;
      const createTodoHandler = container.createTodoHandler;
      const todoRepository = container.todoRepository;

      const createdTodos = [];

      for (const title of args.suggestions) {
        try {
          // Get suggested priority for each task
          const prioritySuggestion = await mlService.suggestPriority(
            title,
            null,
            context.user.id
          );

          const priority = prioritySuggestion.confidence > 0.6
            ? prioritySuggestion.suggestedPriority as PriorityEnum
            : PriorityEnum.MEDIUM;

          // Create the todo
          const todoId = crypto.randomUUID();
          const command = CreateTodoCommand.create(
            todoId,
            title,
            null,
            context.user.id,
            args.listId || null,
            priority,
            null
          );

          const todoAggregate = await createTodoHandler.handle(command);
          const todo = await todoRepository.findById(todoAggregate.id);

          if (todo) {
            createdTodos.push(todo);
          }
        } catch (error) {
          // Log error but continue with other todos
          console.error(`Failed to create todo: ${title}`, error);
        }
      }

      return createdTodos;
    },
  }),
}));