import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { RAGResponseType, UserInsightsType, TaskExplanationType } from '../types/ai.js';

// All types are imported from types/ai.js

export const ragQueries = builder.queryFields((t) => ({
  // Ask questions about your todos using RAG
  askAboutTodos: t.field({
    type: RAGResponseType,
    args: {
      query: t.arg.string({ 
        required: true,
        description: 'Natural language question about your todos' 
      }),
      maxContextItems: t.arg.int({ 
        required: false, 
        defaultValue: 5,
        description: 'Maximum number of todos to use as context' 
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
      const ragService = container.ragService;

      return await ragService.queryWithContext({
        query: args.query,
        userId: context.user.id,
        maxContextItems: args.maxContextItems,
      });
    },
  }),

  // Get AI-generated insights about user's productivity
  getUserInsights: t.field({
    type: UserInsightsType,
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const ragService = container.ragService;

      return await ragService.generateInsights(context.user.id);
    },
  }),

  // Get detailed explanation of a specific task
  explainTask: t.field({
    type: TaskExplanationType,
    args: {
      todoId: t.arg.string({ 
        required: true,
        description: 'ID of the todo to explain' 
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
      const ragService = container.ragService;

      return await ragService.explainTask(args.todoId, context.user.id);
    },
  }),
}));