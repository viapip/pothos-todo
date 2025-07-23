import { builder } from '../../schema/builder.js';
import { TodoType } from '../../schema/types/Todo.js';

/**
 * Todo Subgraph for GraphQL Federation
 * 
 * This subgraph handles todo-related operations and can be deployed independently
 * while participating in a federated GraphQL gateway.
 */

// Federation key directive for Todo entity
builder.externalRef('Todo', builder.selection<{ id: string }>('id')).implement({
  externalFields: (t) => ({
    id: t.exposeID('id'),
  }),
  fields: (t) => ({
    // Federated fields that other subgraphs can extend
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    status: t.exposeString('status'),
    priority: t.exposeString('priority'),
    dueDate: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (todo) => todo.dueDate,
    }),
    completedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (todo) => todo.completedAt,
    }),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (todo) => todo.createdAt,
    }),
    updatedAt: t.field({
      type: 'DateTime',
      resolve: (todo) => todo.updatedAt,
    }),

    // User relationship (external)
    user: t.field({
      type: 'User',
      resolve: (todo) => ({ id: todo.userId }),
    }),

    // Analytics and metrics
    analytics: t.field({
      type: TodoAnalyticsType,
      resolve: async (todo, args, context) => {
        const { Container } = await import('@/infrastructure/container/Container.js');
        const container = Container.getInstance();

        // Get analytics from AI service
        const analytics = await container.todoAnalyticsService.getAnalytics(todo.id);

        return {
          id: todo.id,
          timeTracking: analytics.timeTracking,
          productivityScore: analytics.productivityScore,
          estimatedDuration: analytics.estimatedDuration,
          actualDuration: analytics.actualDuration,
          complexityScore: analytics.complexityScore,
        };
      },
    }),

    // AI insights
    insights: t.field({
      type: [TodoInsightType],
      resolve: async (todo, args, context) => {
        const { Container } = await import('@/infrastructure/container/Container.js');
        const container = Container.getInstance();

        // Get AI insights
        const insights = await container.aiInsightService.getInsights(todo.id);

        return insights.map(insight => ({
          type: insight.type,
          message: insight.message,
          confidence: insight.confidence,
          actionable: insight.actionable,
          createdAt: insight.createdAt,
        }));
      },
    }),

    // Tags and metadata
    tags: t.exposeStringList('tags', { nullable: true }),
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (todo) => todo.metadata,
    }),
  }),
});

// Todo Analytics Type
const TodoAnalyticsType = builder.objectType('TodoAnalytics', {
  fields: (t) => ({
    id: t.exposeID('id'),
    timeTracking: t.field({
      type: TimeTrackingType,
      resolve: (analytics) => analytics.timeTracking,
    }),
    productivityScore: t.exposeFloat('productivityScore'),
    estimatedDuration: t.exposeInt('estimatedDuration', { nullable: true }),
    actualDuration: t.exposeInt('actualDuration', { nullable: true }),
    complexityScore: t.exposeFloat('complexityScore'),
  }),
});

const TimeTrackingType = builder.objectType('TimeTracking', {
  fields: (t) => ({
    started: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (tracking) => tracking.started,
    }),
    paused: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (tracking) => tracking.paused,
    }),
    totalTime: t.exposeInt('totalTime'), // in seconds
    sessions: t.field({
      type: [TimeSessionType],
      resolve: (tracking) => tracking.sessions || [],
    }),
  }),
});

const TimeSessionType = builder.objectType('TimeSession', {
  fields: (t) => ({
    start: t.field({
      type: 'DateTime',
      resolve: (session) => session.start,
    }),
    end: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (session) => session.end,
    }),
    duration: t.exposeInt('duration'), // in seconds
  }),
});

// Todo Insight Type
const TodoInsightType = builder.objectType('TodoInsight', {
  fields: (t) => ({
    type: t.exposeString('type'),
    message: t.exposeString('message'),
    confidence: t.exposeFloat('confidence'),
    actionable: t.exposeBoolean('actionable'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (insight) => insight.createdAt,
    }),
  }),
});

// Todo subgraph queries
builder.queryFields((t) => ({
  // Get todos with advanced filtering
  todos: t.field({
    type: [TodoType],
    args: {
      filter: t.arg({
        type: builder.inputType('TodoFilterInput', {
          fields: (t) => ({
            status: t.stringList({ required: false }),
            priority: t.stringList({ required: false }),
            tags: t.stringList({ required: false }),
            search: t.string({ required: false }),
            dueBefore: t.field({ type: 'DateTime', required: false }),
            dueAfter: t.field({ type: 'DateTime', required: false }),
            completedBefore: t.field({ type: 'DateTime', required: false }),
            completedAfter: t.field({ type: 'DateTime', required: false }),
          }),
        }),
        required: false,
      }),
      sort: t.arg({
        type: builder.inputType('TodoSortInput', {
          fields: (t) => ({
            field: t.string({ required: true }),
            direction: t.string({ required: false }),
          }),
        }),
        required: false,
      }),
      pagination: t.arg({
        type: builder.inputType('PaginationInput', {
          fields: (t) => ({
            first: t.int({ required: false }),
            after: t.string({ required: false }),
            last: t.int({ required: false }),
            before: t.string({ required: false }),
          }),
        }),
        required: false,
      }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Authentication required');

      const { default: prisma } = await import('@/lib/prisma.js');

      // Build where clause
      const where: any = {
        userId: context.user.id,
      };

      if (args.filter) {
        if (args.filter.status) {
          where.status = { in: args.filter.status };
        }
        if (args.filter.priority) {
          where.priority = { in: args.filter.priority };
        }
        if (args.filter.search) {
          where.OR = [
            { title: { contains: args.filter.search, mode: 'insensitive' } },
            { description: { contains: args.filter.search, mode: 'insensitive' } },
          ];
        }
        if (args.filter.dueBefore) {
          where.dueDate = { ...where.dueDate, lte: args.filter.dueBefore };
        }
        if (args.filter.dueAfter) {
          where.dueDate = { ...where.dueDate, gte: args.filter.dueAfter };
        }
      }

      // Build order by
      const orderBy: any = {};
      if (args.sort) {
        orderBy[args.sort.field] = args.sort.direction || 'desc';
      } else {
        orderBy.createdAt = 'desc';
      }

      // Handle pagination
      const take = args.pagination?.first || args.pagination?.last || 20;
      const skip = args.pagination?.after ? 1 : 0; // Simplified cursor logic

      const todos = await prisma.todo.findMany({
        where,
        orderBy,
        take,
        skip,
      });

      return todos;
    },
    performance: {
      cache: {
        ttl: 60,
        scope: 'PRIVATE',
      },
      trace: {
        enabled: true,
        name: 'todo.query.list',
      },
      complexity: {
        value: 5,
        multipliers: ['first', 'last'],
      },
    },
  }),

  // Get todo by ID
  todo: t.field({
    type: TodoType,
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Authentication required');

      const { default: prisma } = await import('@/lib/prisma.js');

      const todo = await prisma.todo.findFirst({
        where: {
          id: args.id,
          userId: context.user.id,
        },
      });

      return todo;
    },
    performance: {
      cache: {
        ttl: 300,
        scope: 'PRIVATE',
      },
    },
  }),

  // Get todo statistics
  todoStats: t.field({
    type: TodoStatsType,
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Authentication required');

      const { default: prisma } = await import('@/lib/prisma.js');

      const [total, completed, pending, overdue] = await Promise.all([
        prisma.todo.count({ where: { userId: context.user.id } }),
        prisma.todo.count({ where: { userId: context.user.id, status: 'COMPLETED' } }),
        prisma.todo.count({ where: { userId: context.user.id, status: 'PENDING' } }),
        prisma.todo.count({
          where: {
            userId: context.user.id,
            status: 'PENDING',
            dueDate: { lt: new Date() },
          },
        }),
      ]);

      return {
        total,
        completed,
        pending,
        overdue,
        completionRate: total > 0 ? completed / total : 0,
      };
    },
  }),
}));

const TodoStatsType = builder.objectType('TodoStats', {
  fields: (t) => ({
    total: t.exposeInt('total'),
    completed: t.exposeInt('completed'),
    pending: t.exposeInt('pending'),
    overdue: t.exposeInt('overdue'),
    completionRate: t.exposeFloat('completionRate'),
  }),
});

// Include existing todo mutations with federation support
builder.mutationFields((t) => ({
  // Time tracking mutations
  startTimeTracking: t.field({
    type: 'Boolean',
    args: {
      todoId: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Authentication required');

      const { Container } = await import('@/infrastructure/container/Container.js');
      const container = Container.getInstance();

      await container.timeTrackingService.startTracking(args.todoId, context.user.id);
      return true;
    },
  }),

  stopTimeTracking: t.field({
    type: 'Boolean',
    args: {
      todoId: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      if (!context.user) throw new Error('Authentication required');

      const { Container } = await import('@/infrastructure/container/Container.js');
      const container = Container.getInstance();

      await container.timeTrackingService.stopTracking(args.todoId, context.user.id);
      return true;
    },
  }),
}));

// Federation schema for todo subgraph
export const todoSubgraphSchema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.0',
});