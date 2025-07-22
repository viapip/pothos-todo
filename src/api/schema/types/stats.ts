import { builder } from '../builder.js';

export const TodoPriorityStats = builder.objectType('TodoPriorityStats', {
  fields: (t) => ({
    low: t.int({
      resolve: (stats) => stats.low,
    }),
    medium: t.int({
      resolve: (stats) => stats.medium,
    }),
    high: t.int({
      resolve: (stats) => stats.high,
    }),
    critical: t.int({
      resolve: (stats) => stats.critical,
    }),
  }),
});

export const TodoStats = builder.objectType('TodoStats', {
  fields: (t) => ({
    total: t.int({
      resolve: (stats) => stats.total,
    }),
    pending: t.int({
      resolve: (stats) => stats.pending,
    }),
    inProgress: t.int({
      resolve: (stats) => stats.inProgress,
    }),
    completed: t.int({
      resolve: (stats) => stats.completed,
    }),
    cancelled: t.int({
      resolve: (stats) => stats.cancelled,
    }),
    byPriority: t.field({
      type: TodoPriorityStats,
      resolve: (stats) => stats.byPriority,
    }),
  }),
});