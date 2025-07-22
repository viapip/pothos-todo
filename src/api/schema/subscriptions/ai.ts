import { builder } from '../builder.js';
import { PubSubManager } from '../../../infrastructure/realtime/PubSubManager.js';

export const AISuggestionPayload = builder.objectType('AISuggestionPayload', {
  fields: (t) => ({
    suggestions: t.stringList({
      resolve: (payload) => payload.suggestions,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: () => new Date(),
    }),
    trigger: t.string({
      nullable: true,
      resolve: (payload) => payload.trigger || null,
      description: 'What triggered the suggestions (e.g., "todo_completed", "pattern_detected")',
    }),
  }),
});

export const AIInsightPayload = builder.objectType('AIInsightPayload', {
  fields: (t) => ({
    insightType: t.string({
      resolve: (payload) => payload.insightType,
      description: 'Type of insight: productivity, patterns, recommendations',
    }),
    data: t.field({
      type: 'JSON',
      resolve: (payload) => payload.data,
    }),
    confidence: t.float({
      nullable: true,
      resolve: (payload) => payload.confidence || null,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: () => new Date(),
    }),
  }),
});

export const TaskComplexityPayload = builder.objectType('TaskComplexityPayload', {
  fields: (t) => ({
    todoId: t.string({
      resolve: (payload) => payload.todoId,
    }),
    complexity: t.string({
      resolve: (payload) => payload.complexity,
      description: 'simple, moderate, or complex',
    }),
    factors: t.stringList({
      nullable: true,
      resolve: (payload) => payload.factors || [],
      description: 'Factors contributing to complexity',
    }),
  }),
});

export const aiSubscriptions = builder.subscriptionFields((t) => ({
  // Real-time AI suggestions
  aiSuggestions: t.field({
    type: AISuggestionPayload,
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const userId = context.user.id;

      // Filter to only the user's suggestions
      return pubsub.subscribe('aiSuggestionGenerated', {
        filter: (payload: any) => payload.userId === userId,
      });
    },
    resolve: (payload: any) => ({
      suggestions: payload.suggestions,
      trigger: payload.trigger,
    }),
  }),

  // Real-time AI insights
  aiInsights: t.field({
    type: AIInsightPayload,
    args: {
      insightTypes: t.arg.stringList({
        required: false,
        description: 'Filter by specific insight types',
      }),
    },
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const userId = context.user.id;
      const allowedTypes = args.insightTypes;

      return pubsub.subscribe('aiInsightAvailable', {
        filter: (payload: any) => {
          if (payload.userId !== userId) return false;
          if (allowedTypes && allowedTypes.length > 0) {
            return allowedTypes.includes(payload.insightType);
          }
          return true;
        },
      });
    },
    resolve: (payload: any) => ({
      insightType: payload.insightType,
      data: payload.data,
      confidence: payload.data.confidence,
    }),
  }),

  // Real-time task complexity analysis
  taskComplexityAnalyzed: t.field({
    type: TaskComplexityPayload,
    authScopes: {
      authenticated: true,
    },
    subscribe: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const pubsub = PubSubManager.getInstance().getPubSub();
      const userId = context.user.id;

      return pubsub.subscribe('taskComplexityAnalyzed', {
        filter: (payload: any) => payload.userId === userId,
      });
    },
    resolve: (payload: any) => ({
      todoId: payload.todoId,
      complexity: payload.complexity,
      factors: payload.data?.factors,
    }),
  }),
}));