import { builder } from '../builder.js';
import { performanceMonitor } from '@/infrastructure/telemetry/PerformanceMonitor.js';

// Performance metrics type
const PerformanceMetricsType = builder.objectType('PerformanceMetrics', {
  description: 'Performance metrics for the GraphQL API',
  fields: (t) => ({
    requestCount: t.int({
      description: 'Total number of GraphQL requests',
      resolve: (parent) => parent.requestCount,
    }),
    errorCount: t.int({
      description: 'Total number of GraphQL errors',
      resolve: (parent) => parent.errorCount,
    }),
    averageResponseTime: t.float({
      description: 'Average response time in milliseconds',
      resolve: (parent) => parent.averageResponseTime,
    }),
    p95ResponseTime: t.float({
      description: '95th percentile response time in milliseconds',
      resolve: (parent) => parent.p95ResponseTime,
    }),
    p99ResponseTime: t.float({
      description: '99th percentile response time in milliseconds',
      resolve: (parent) => parent.p99ResponseTime,
    }),
    cacheHitRate: t.float({
      description: 'Cache hit rate (0-1)',
      resolve: (parent) => parent.cacheHitRate,
    }),
    activeConnections: t.int({
      description: 'Number of active WebSocket connections',
      resolve: (parent) => parent.activeConnections,
    }),
    slowQueries: t.field({
      type: [SlowQueryType],
      description: 'List of slow queries',
      resolve: (parent) => parent.slowQueries,
    }),
  }),
});

// Slow query type
const SlowQueryType = builder.objectType('SlowQuery', {
  description: 'Information about a slow GraphQL query',
  fields: (t) => ({
    query: t.string({
      description: 'The GraphQL query',
      resolve: (parent) => parent.query,
    }),
    duration: t.float({
      description: 'Query duration in milliseconds',
      resolve: (parent) => parent.duration,
    }),
    timestamp: t.field({
      type: 'DateTime',
      description: 'When the query was executed',
      resolve: (parent) => parent.timestamp,
    }),
  }),
});

// Performance anomaly type
const PerformanceAnomalyType = builder.objectType('PerformanceAnomaly', {
  description: 'Detected performance anomaly',
  fields: (t) => ({
    type: t.string({
      description: 'Type of anomaly',
      resolve: (parent) => parent.type,
    }),
    severity: t.string({
      description: 'Severity level',
      resolve: (parent) => parent.severity,
    }),
    message: t.string({
      description: 'Human-readable message',
      resolve: (parent) => parent.message,
    }),
    value: t.float({
      description: 'Current value',
      resolve: (parent) => parent.value,
    }),
    threshold: t.float({
      description: 'Threshold that was exceeded',
      resolve: (parent) => parent.threshold,
    }),
  }),
});

// Query complexity analysis type
const QueryComplexityAnalysisType = builder.objectType('QueryComplexityAnalysis', {
  description: 'Query complexity analysis',
  fields: (t) => ({
    averageComplexity: t.float({
      description: 'Average query complexity',
      resolve: (parent) => parent.averageComplexity,
    }),
    maxComplexity: t.float({
      description: 'Maximum query complexity',
      resolve: (parent) => parent.maxComplexity,
    }),
    complexQueries: t.field({
      type: [ComplexQueryType],
      description: 'List of complex queries',
      resolve: (parent) => parent.complexQueries,
    }),
  }),
});

// Complex query type
const ComplexQueryType = builder.objectType('ComplexQuery', {
  description: 'Information about a complex GraphQL query',
  fields: (t) => ({
    query: t.string({
      description: 'The GraphQL query',
      resolve: (parent) => parent.query,
    }),
    complexity: t.float({
      description: 'Query complexity score',
      resolve: (parent) => parent.complexity,
    }),
    timestamp: t.field({
      type: 'DateTime',
      description: 'When the query was executed',
      resolve: (parent) => parent.timestamp,
    }),
  }),
});

// Add performance queries
builder.queryField('performanceMetrics', (t) =>
  t.field({
    type: PerformanceMetricsType,
    description: 'Get current performance metrics',
    authScopes: {
      admin: true,
    },
    resolve: async () => {
      return await performanceMonitor.getMetrics();
    },
  })
);

builder.queryField('performanceAnomalies', (t) =>
  t.field({
    type: [PerformanceAnomalyType],
    description: 'Detect performance anomalies',
    authScopes: {
      admin: true,
    },
    resolve: async () => {
      return await performanceMonitor.detectAnomalies();
    },
  })
);

builder.queryField('complexityAnalysis', (t) =>
  t.field({
    type: QueryComplexityAnalysisType,
    description: 'Get query complexity analysis',
    authScopes: {
      admin: true,
    },
    resolve: async () => {
      return await performanceMonitor.getComplexityAnalysis();
    },
  })
);