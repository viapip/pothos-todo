import { builder } from '../builder.js';
import { Container } from '@/infrastructure/container/Container';
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