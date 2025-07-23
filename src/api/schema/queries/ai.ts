import { builder } from '../builder.js';
import { Container } from '@/infrastructure/container/Container';
import { 
  UserProductivityReport, 
  SchedulingSuggestions, 
  AIServiceHealth,
  ProductivityInsight,
  WorkPatternAnalysis,
  SmartRecommendation,
  BurnoutRiskAssessment,
  ProductivityReportInput
} from '../types/ai.js';
import { aiPipelineService } from '@/infrastructure/ai/AIPipelineService.js';
import prisma from '@/lib/prisma';

// Input type for semantic search
const SemanticSearchInput = builder.inputType('SemanticSearchInput', {
  fields: (t) => ({
    query: t.string({ required: true, description: 'Natural language search query' }),
    limit: t.int({ required: false, defaultValue: 10, description: 'Maximum number of results' }),
    scoreThreshold: t.float({ required: false, defaultValue: 0.7, description: 'Minimum similarity score (0-1)' }),
  }),
});

// Search result type
const SearchResult = builder.simpleObject('SearchResult', {
  fields: (t) => ({
    id: t.string(),
    score: t.float(),
    content: t.string(),
    type: t.string(),
  }),
});

// Add AI queries
builder.queryFields((t) => ({
  // Semantic search for todos
  searchTodos: t.field({
    type: [SearchResult],
    args: {
      input: t.arg({ type: SemanticSearchInput, required: true }),
    },
    authScopes: { authenticated: true },
    complexity: (args) => {
      const limit = args.input.limit || 10;
      return 5 + limit * 2; // Base cost 5 + 2 per result (embedding calculation)
    },
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      const { query, limit, scoreThreshold } = args.input;
      const container = Container.getInstance();
      const embeddingService = container.embeddingService;

      try {
        const results = await embeddingService.findSimilarTodos(
          query,
          context.user.id,
          limit || 10
        );

        return results
          .filter(r => r.score >= (scoreThreshold || 0.7))
          .map(r => ({
            id: r.id,
            score: r.score,
            content: r.content,
            type: 'todo',
          }));
      } catch (error) {
        console.error('Search error:', error);
        throw new Error('Search failed');
      }
    },
  }),

  // Find similar todos to a specific todo
  findSimilarTodos: t.prismaField({
    type: ['Todo'],
    args: {
      todoId: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false, defaultValue: 5 }),
    },
    authScopes: { authenticated: true },
    complexity: (args, childComplexity) => {
      const limit = args.limit || 5;
      return 5 + limit * (2 + childComplexity); // Base 5 + embedding cost + child queries
    },
    resolve: async (query, root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Get the todo
      const todo = await prisma.todo.findFirst({
        where: {
          id: args.todoId,
          userId: context.user.id,
        },
      });

      if (!todo) {
        throw new Error('Todo not found');
      }

      // Build search query from todo content
      const searchQuery = `${todo.title} ${todo.description || ''}`;
      const container = Container.getInstance();
      const embeddingService = container.embeddingService;

      try {
        const results = await embeddingService.findSimilarTodos(
          searchQuery,
          context.user.id,
          (args.limit || 5) + 1 // +1 to filter out the source todo
        );

        // Filter out the source todo and get the actual todos
        const similarTodoIds = results
          .filter(r => r.id !== args.todoId)
          .slice(0, args.limit || 5)
          .map(r => r.id);

        if (similarTodoIds.length === 0) {
          return [];
        }

        return await prisma.todo.findMany({
          where: {
            id: { in: similarTodoIds },
            userId: context.user.id,
          },
        });
      } catch (error) {
        console.error('Find similar error:', error);
        throw new Error('Failed to find similar todos');
      }
    },
  }),

  // AI-powered todo suggestions based on user's existing todos
  suggestTodos: t.field({
    type: ['String'],
    args: {
      context: t.arg.string({
        required: false,
        description: 'Optional context for suggestions (e.g., "weekend", "work", "personal")'
      }),
      limit: t.arg.int({ required: false, defaultValue: 5 }),
    },
    authScopes: { authenticated: true },
    complexity: 20, // Fixed high cost for AI processing
    resolve: async (root, args, context) => {
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // Get user's recent todos for context
      const recentTodos = await prisma.todo.findMany({
        where: { userId: context.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { title: true, description: true },
      });

      if (recentTodos.length === 0) {
        // Default suggestions for new users
        return [
          'Set up workspace environment',
          'Create a daily routine checklist',
          'Plan weekly goals',
          'Organize important documents',
          'Schedule regular breaks',
        ].slice(0, args.limit || 5);
      }

      // Build context from recent todos
      const todoContext = recentTodos
        .map(t => `${t.title} ${t.description || ''}`)
        .join('. ');

      // For now, return simple pattern-based suggestions
      // In a real implementation, this would use an LLM
      const suggestions = generateSimpleSuggestions(todoContext, args.context);

      return suggestions.slice(0, args.limit || 5);
    },
  }),
}));

// Simple suggestion generator (placeholder for LLM integration)
function generateSimpleSuggestions(todoContext: string, userContext?: string | null): string[] {
  const suggestions: string[] = [];

  // Analyze patterns in existing todos
  const lowerContext = todoContext.toLowerCase();

  if (lowerContext.includes('meeting') || lowerContext.includes('call')) {
    suggestions.push('Prepare meeting agenda');
    suggestions.push('Follow up on action items');
    suggestions.push('Schedule next team sync');
  }

  if (lowerContext.includes('code') || lowerContext.includes('development') || lowerContext.includes('bug')) {
    suggestions.push('Review code quality metrics');
    suggestions.push('Update project documentation');
    suggestions.push('Plan next sprint tasks');
  }

  if (lowerContext.includes('learn') || lowerContext.includes('study') || lowerContext.includes('course')) {
    suggestions.push('Review learning progress');
    suggestions.push('Practice new concepts');
    suggestions.push('Take notes on key insights');
  }

  if (userContext) {
    const lowerUserContext = userContext.toLowerCase();

    if (lowerUserContext.includes('weekend')) {
      suggestions.push('Plan weekend activities');
      suggestions.push('Grocery shopping list');
      suggestions.push('Home maintenance tasks');
    }

    if (lowerUserContext.includes('work')) {
      suggestions.push('Update project status');
      suggestions.push('Review inbox and emails');
      suggestions.push('Plan tomorrow\'s priorities');
    }

    if (lowerUserContext.includes('personal')) {
      suggestions.push('Exercise routine');
      suggestions.push('Call family or friends');
      suggestions.push('Personal development goals');
    }
  }

  // Add some general suggestions if needed
  while (suggestions.length < 10) {
    const general = [
      'Review and prioritize tasks',
      'Clean up completed items',
      'Plan next week',
      'Update task deadlines',
      'Organize by priority',
      'Archive old tasks',
      'Set daily goals',
      'Review progress',
    ];

    for (const g of general) {
      if (!suggestions.includes(g)) {
        suggestions.push(g);
        break;
      }
    }
  }

  return suggestions;
}

// Add Advanced AI queries for productivity insights
builder.queryFields((t) => ({
  // Comprehensive productivity report
  productivityReport: t.field({
    type: UserProductivityReport,
    args: {
      input: t.arg({ type: ProductivityReportInput, required: false }),
    },
    authScopes: {
      authenticated: true,
    },
    complexity: 50, // Very expensive AI analysis
    resolve: async (_, { input }, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      const pipeline = aiPipelineService(prisma);
      const report = await pipeline.generateProductivityReport(session.user.id);

      return report;
    },
  }),

  // Task scheduling suggestions powered by AI
  taskSchedulingSuggestions: t.field({
    type: SchedulingSuggestions,
    authScopes: {
      authenticated: true,
    },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      const pipeline = aiPipelineService(prisma);
      const suggestions = await pipeline.suggestTaskScheduling(session.user.id);

      return suggestions;
    },
  }),

  // AI service health monitoring
  aiServiceHealth: t.field({
    type: AIServiceHealth,
    authScopes: {
      admin: true,
    },
    resolve: async () => {
      const pipeline = aiPipelineService(prisma);
      const health = pipeline.getHealthStatus();

      return health;
    },
  }),

  // Individual productivity insights
  productivityInsights: t.field({
    type: [ProductivityInsight],
    authScopes: {
      authenticated: true,
    },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      try {
        const pipeline = aiPipelineService(prisma);
        const report = await pipeline.generateProductivityReport(session.user.id);
        return report.insights || [];
      } catch (error) {
        console.error('Failed to get productivity insights:', error);
        return [];
      }
    },
  }),

  // Work pattern analysis
  workPatterns: t.field({
    type: WorkPatternAnalysis,
    nullable: true,
    authScopes: {
      authenticated: true,
    },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      try {
        const pipeline = aiPipelineService(prisma);
        const report = await pipeline.generateProductivityReport(session.user.id);
        return report.patterns || null;
      } catch (error) {
        console.error('Failed to get work patterns:', error);
        return null;
      }
    },
  }),

  // Smart recommendations
  smartRecommendations: t.field({
    type: [SmartRecommendation],
    authScopes: {
      authenticated: true,
    },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      try {
        const pipeline = aiPipelineService(prisma);
        const report = await pipeline.generateProductivityReport(session.user.id);
        return report.recommendations || [];
      } catch (error) {
        console.error('Failed to get smart recommendations:', error);
        return [];
      }
    },
  }),

  // Burnout risk assessment
  burnoutRiskAssessment: t.field({
    type: BurnoutRiskAssessment,
    nullable: true,
    authScopes: {
      authenticated: true,
    },
    resolve: async (_, __, { session }) => {
      if (!session?.user) {
        throw new Error('Authentication required');
      }

      try {
        const pipeline = aiPipelineService(prisma);
        const report = await pipeline.generateProductivityReport(session.user.id);
        return report.burnoutRisk || null;
      } catch (error) {
        console.error('Failed to get burnout risk assessment:', error);
        return null;
      }
    },
  }),
}));