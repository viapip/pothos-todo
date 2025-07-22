import { builder } from '../builder.js';
import { Container } from '../../../infrastructure/container/Container.js';
import { 
  CompletionTimePredictionType, 
  PrioritySuggestionType, 
  TaskComplexityAnalysisType, 
  NextActionsPredictionType 
} from '../types/ai.js';

// All types are imported from types/ai.js

export const predictionQueries = builder.queryFields((t) => ({
  // Predict completion time for a todo
  predictCompletionTime: t.field({
    type: CompletionTimePredictionType,
    args: {
      todoId: t.arg.string({ 
        required: true,
        description: 'ID of the todo to predict completion time for' 
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
      const mlService = container.mlPredictionService;

      return await mlService.predictCompletionTime(args.todoId, context.user.id);
    },
  }),

  // Suggest priority for a new task
  suggestPriority: t.field({
    type: PrioritySuggestionType,
    args: {
      title: t.arg.string({ 
        required: true,
        description: 'Title of the task' 
      }),
      description: t.arg.string({ 
        required: false,
        description: 'Description of the task' 
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
      const mlService = container.mlPredictionService;

      return await mlService.suggestPriority(
        args.title,
        args.description || null,
        context.user.id
      );
    },
  }),

  // Analyze task complexity
  analyzeTaskComplexity: t.field({
    type: TaskComplexityAnalysisType,
    args: {
      todoId: t.arg.string({ 
        required: true,
        description: 'ID of the todo to analyze' 
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
      const mlService = container.mlPredictionService;

      return await mlService.analyzeTaskComplexity(args.todoId, context.user.id);
    },
  }),

  // Predict next actions based on user patterns
  predictNextActions: t.field({
    type: NextActionsPredictionType,
    authScopes: {
      authenticated: true,
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const container = Container.getInstance();
      const mlService = container.mlPredictionService;

      return await mlService.predictNextActions(context.user.id);
    },
  }),
}));