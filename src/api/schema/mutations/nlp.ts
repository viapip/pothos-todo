import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { NLPCommandResultType, NLPSuggestionType } from '../types/ai.js';

// All types are imported from types/ai.js

export const nlpMutations = builder.mutationFields((t) => ({
  executeNLPCommand: t.field({
    type: NLPCommandResultType,
    args: {
      command: t.arg.string({
        required: true,
        description: 'Natural language command to execute',
      }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const handler = container.executeNLPCommandHandler;

      const result = await handler.handle({
        command: args.command,
        userId: context.user.id,
      });

      return result;
    },
  }),

  generateTaskSuggestions: t.field({
    type: NLPSuggestionType,
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const nlpService = container.nlpService;
      const todoRepository = container.todoRepository;

      // Get user's recent todos
      const todos = await todoRepository.findByUserId(context.user.id);
      const recentTodos = todos
        .slice(0, 10)
        .map(todo => ({
          title: todo.title,
          priority: todo.priority.value,
          status: todo.status.value,
        }));

      // Get current time context
      const now = new Date();
      const timeOfDay = now.getHours() < 12 ? 'morning' : 
                       now.getHours() < 17 ? 'afternoon' : 'evening';
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

      const suggestions = await nlpService.generateSuggestions({
        recentTodos,
        timeOfDay,
        dayOfWeek,
      });

      return { suggestions };
    },
  }),
}));