# Performance Optimization Guide

Comprehensive guide to optimizing performance across all layers of the GraphQL application, including monitoring, profiling, and optimization techniques.

## Overview

Performance optimization covers:

- **Query Performance**: GraphQL query optimization and N+1 problem solving
- **Caching Strategies**: Multi-level caching for maximum efficiency  
- **Database Optimization**: Connection pooling, query optimization, indexing
- **Memory Management**: Heap optimization and garbage collection tuning
- **Network Optimization**: Compression, bundling, and CDN usage
- **Monitoring & Profiling**: Real-time performance monitoring and alerting

## Performance Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Side   │────│   Network       │────│   Server Side   │
│   Optimization  │    │   Optimization  │    │   Optimization  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Caching       │────│   Monitoring    │────│   Database      │
│   Strategies    │    │   & Metrics     │    │   Performance   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## GraphQL Query Optimization

### Query Complexity Analysis

```typescript
import { createComplexityLimitRule } from 'graphql-query-complexity';

// Configure query complexity limits
const complexityLimitRule = createComplexityLimitRule(1000, {
  maximumComplexity: 1000,
  variables: {},
  onComplete: (complexity: number) => {
    console.log('Query complexity:', complexity);
  },
  estimators: [
    // Custom complexity estimators
    {
      introspection: 10,
      scalarIntrospection: 1,
      objectIntrospection: 5,
      enumIntrospection: 2,
      typeIntrospection: 3,
    },
  ],
});

// Add to GraphQL validation rules
const server = createYoga({
  schema,
  validationRules: [complexityLimitRule],
});
```

### Query Depth Limiting

```typescript
import depthLimit from 'graphql-depth-limit';

// Limit query depth to prevent deep nested queries
const server = createYoga({
  schema,
  validationRules: [depthLimit(10)],
});

// Example: This query has depth 4
/*
query {
  user {           # depth 1
    todos {        # depth 2  
      comments {   # depth 3
        author {   # depth 4
          name
        }
      }
    }
  }
}
*/
```

### Resolver Performance Optimization

```typescript
// Bad: N+1 problem
const resolvers = {
  Todo: {
    user: async (todo) => {
      return await prisma.user.findUnique({ where: { id: todo.userId } });
    },
  },
};

// Good: DataLoader batching
const resolvers = {
  Todo: {
    user: async (todo, args, context) => {
      return await context.loaders.userLoader.load(todo.userId);
    },
  },
};

// Even better: Include in initial query
const getTodos = async () => {
  return await prisma.todo.findMany({
    include: {
      user: true, // Fetch user data in single query
    },
  });
};
```

### Query Optimization Techniques

```typescript
// 1. Field selection optimization
const optimizedResolver = async (parent, args, context, info) => {
  const selectedFields = getSelectedFields(info);
  
  // Only fetch requested fields
  const selectClause = {};
  if (selectedFields.includes('name')) selectClause.name = true;
  if (selectedFields.includes('email')) selectClause.email = true;
  
  return await prisma.user.findMany({ select: selectClause });
};

// 2. Pagination optimization  
const paginatedResolver = async (parent, args, context) => {
  const { first = 10, after, orderBy = 'createdAt' } = args;
  
  return await prisma.todo.findMany({
    take: Math.min(first, 100), // Limit max page size
    skip: after ? 1 : 0,
    cursor: after ? { id: after } : undefined,
    orderBy: { [orderBy]: 'desc' },
  });
};

// 3. Conditional field resolution
const conditionalResolver = async (parent, args, context, info) => {
  // Skip expensive operations if field not requested
  if (!info.fieldNodes.some(field => 
    field.selectionSet?.selections.some(selection => 
      selection.kind === 'Field' && selection.name.value === 'expensiveField'
    )
  )) {
    return { ...baseData };
  }
  
  const expensiveData = await fetchExpensiveData();
  return { ...baseData, expensiveField: expensiveData };
};
```

## Caching Performance

### Cache Hit Rate Optimization

```typescript
// Monitor and optimize cache hit rates
const optimizeCacheHitRates = async () => {
  const stats = await cacheManager.getStats();
  
  // Log performance metrics
  console.log('Cache Performance:', {
    l1HitRate: stats.l1.hitRate,
    l2HitRate: stats.l2.hitRate, 
    l3HitRate: stats.l3.hitRate,
    overallHitRate: stats.overall.overallHitRate,
  });
  
  // Optimize based on hit rates
  if (stats.l2.hitRate < 0.7) {
    // Increase L2 cache size
    await cacheManager.updateConfig({
      levels: {
        l2: { maxSize: stats.l2.size * 1.5 }
      }
    });
  }
  
  if (stats.l3.hitRate < 0.5) {
    // Increase TTL for stable data
    await cacheManager.updateDefaultTTL(7200); // 2 hours
  }
};
```

### Smart Cache Warming

```typescript
// Proactive cache warming for frequently accessed data
const warmCache = async () => {
  const popularQueries = [
    { key: 'active-users', query: () => getActiveUsers() },
    { key: 'recent-todos', query: () => getRecentTodos() },
    { key: 'user-stats', query: () => getUserStatistics() },
  ];
  
  // Warm cache in parallel
  await Promise.all(
    popularQueries.map(async ({ key, query }) => {
      try {
        const data = await query();
        await cacheManager.set(key, data, 3600);
        logger.info('Cache warmed', { key });
      } catch (error) {
        logger.warn('Cache warming failed', { key, error });
      }
    })
  );
};

// Schedule cache warming
setInterval(warmCache, 30 * 60 * 1000); // Every 30 minutes
```

### Cache Compression Optimization

```typescript
// Optimize cache compression settings
const compressionConfig = {
  enabled: true,
  algorithm: 'gzip',
  threshold: 1024,     // Compress objects > 1KB
  level: 6,            // Compression level (1-9)
};

// Monitor compression effectiveness
const monitorCompression = async () => {
  const compressionStats = await cacheManager.getCompressionStats();
  
  console.log('Compression Stats:', {
    averageCompressionRatio: compressionStats.averageRatio,
    totalBytesSaved: compressionStats.totalBytesSaved,
    compressionTime: compressionStats.averageCompressionTime,
  });
  
  // Adjust compression settings based on performance
  if (compressionStats.averageCompressionTime > 10) {
    // Compression too slow, reduce level
    await cacheManager.updateCompressionLevel(4);
  }
};
```

## Database Performance

### Index Optimization

```sql
-- Analyze query patterns
SELECT 
  query,
  calls,
  mean_time,
  stddev_time,
  total_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Create optimal indexes
CREATE INDEX CONCURRENTLY idx_todos_user_id_status 
ON todos (user_id, status) 
WHERE status IN ('pending', 'in_progress');

CREATE INDEX CONCURRENTLY idx_todos_created_at_desc 
ON todos (created_at DESC);

-- Partial indexes for filtered queries  
CREATE INDEX CONCURRENTLY idx_todos_active 
ON todos (id, title) 
WHERE deleted_at IS NULL;
```

### Query Performance Analysis

```typescript
// Automatic query performance analysis
const analyzeQueryPerformance = async () => {
  const slowQueries = await dbClient.getSlowQueries({
    threshold: 1000,    // > 1 second
    limit: 20,
  });
  
  for (const query of slowQueries) {
    const analysis = await dbClient.explainQuery(query.sql, query.params);
    
    console.log('Slow Query Analysis:', {
      query: query.sql,
      executionTime: query.duration,
      executionPlan: analysis.plan,
      recommendations: analysis.recommendations,
    });
    
    // Auto-apply safe optimizations
    if (analysis.recommendations.includes('add_index')) {
      await suggestIndexCreation(query);
    }
  }
};
```

### Connection Pool Tuning

```typescript
// Dynamic connection pool adjustment
const tuneConnectionPool = async () => {
  const stats = connectionPool.getStats();
  const systemLoad = await getSystemLoad();
  
  // Adjust pool size based on load
  if (stats.pending > 5 && systemLoad.cpu < 70) {
    // Increase pool size if requests are waiting and CPU is available
    await connectionPool.setMaxSize(Math.min(stats.max + 5, 50));
    logger.info('Increased connection pool size', { 
      newSize: stats.max + 5 
    });
  }
  
  // Decrease pool size if underutilized
  if (stats.borrowed < stats.max * 0.3 && stats.max > 10) {
    await connectionPool.setMaxSize(Math.max(stats.max - 2, 10));
    logger.info('Decreased connection pool size', { 
      newSize: stats.max - 2 
    });
  }
};

setInterval(tuneConnectionPool, 60000); // Every minute
```

## Memory Optimization

### Heap Management

```typescript
// Monitor memory usage patterns
const monitorMemoryUsage = () => {
  const usage = process.memoryUsage();
  const stats = {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),     // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),   // MB
    external: Math.round(usage.external / 1024 / 1024),     // MB
    rss: Math.round(usage.rss / 1024 / 1024),               // MB
    heapUtilization: usage.heapUsed / usage.heapTotal,
  };
  
  // Alert on high memory usage
  if (stats.heapUtilization > 0.8) {
    logger.warn('High heap utilization detected', stats);
    
    // Trigger garbage collection if needed
    if (global.gc && stats.heapUtilization > 0.9) {
      global.gc();
      logger.info('Manual garbage collection triggered');
    }
  }
  
  return stats;
};

// Schedule memory monitoring
setInterval(monitorMemoryUsage, 30000); // Every 30 seconds
```

### Object Pool Management

```typescript
// Object pooling for frequently created objects
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  
  constructor(
    createFn: () => T, 
    resetFn: (obj: T) => void,
    initialSize = 10
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }
  
  acquire(): T {
    return this.pool.pop() || this.createFn();
  }
  
  release(obj: T): void {
    this.resetFn(obj);
    if (this.pool.length < 100) { // Max pool size
      this.pool.push(obj);
    }
  }
}

// Example: Pool for GraphQL context objects
const contextPool = new ObjectPool(
  () => ({ loaders: {}, cache: null, user: null }),
  (ctx) => {
    ctx.user = null;
    ctx.cache = null;
    Object.keys(ctx.loaders).forEach(key => delete ctx.loaders[key]);
  }
);
```

### Memory Leak Prevention

```typescript
// Monitor for memory leaks
const detectMemoryLeaks = () => {
  const memoryHistory: number[] = [];
  
  setInterval(() => {
    const usage = process.memoryUsage().heapUsed;
    memoryHistory.push(usage);
    
    // Keep last 10 measurements
    if (memoryHistory.length > 10) {
      memoryHistory.shift();
    }
    
    // Check for consistent growth (potential leak)
    if (memoryHistory.length >= 10) {
      const trend = memoryHistory.slice(-5).every((val, i, arr) => 
        i === 0 || val > arr[i - 1]
      );
      
      if (trend) {
        logger.warn('Potential memory leak detected', {
          currentUsage: Math.round(usage / 1024 / 1024),
          trend: memoryHistory.map(m => Math.round(m / 1024 / 1024)),
        });
      }
    }
  }, 60000); // Every minute
};
```

## Network Performance

### Response Compression

```typescript
import { compression } from 'h3-compression';

// Configure response compression
const compressionMiddleware = compression({
  threshold: 1024,        // Compress responses > 1KB
  level: 6,               // Compression level
  chunkSize: 1024,        // Chunk size
  windowBits: 15,         // Window size
  memLevel: 8,            // Memory level
  
  // Compress these content types
  filter: (contentType) => {
    return /^text\/|application\/(json|javascript|xml|graphql)/.test(contentType);
  },
});

// Apply to GraphQL endpoint
app.use('/graphql', compressionMiddleware);
```

### Request Batching

```typescript
// GraphQL request batching
const batchingConfig = {
  maxBatchSize: 10,       // Max queries per batch
  batchTimeout: 10,       // Max wait time (ms)
  cache: true,            // Cache identical queries
};

// Implement query batching middleware
const batchExecutor = async (requests: GraphQLRequest[]) => {
  // Group identical queries
  const queryGroups = new Map<string, GraphQLRequest[]>();
  
  requests.forEach(req => {
    const key = JSON.stringify({ query: req.query, variables: req.variables });
    if (!queryGroups.has(key)) {
      queryGroups.set(key, []);
    }
    queryGroups.get(key)!.push(req);
  });
  
  // Execute unique queries
  const results = await Promise.all(
    Array.from(queryGroups.entries()).map(async ([key, reqs]) => {
      const result = await execute({
        schema,
        document: reqs[0].query,
        variableValues: reqs[0].variables,
        contextValue: reqs[0].context,
      });
      
      return reqs.map(() => result);
    })
  );
  
  return results.flat();
};
```

### CDN Integration

```typescript
// Configure CDN headers for static resources
const setCDNHeaders = (event: H3Event, path: string) => {
  if (path.match(/\.(js|css|png|jpg|gif|svg|woff2?)$/)) {
    // Long cache for static assets
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable');
    setHeader(event, 'CDN-Cache-Control', 'max-age=31536000');
  } else if (path === '/graphql') {
    // No cache for GraphQL endpoint
    setHeader(event, 'Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    // Short cache for dynamic content
    setHeader(event, 'Cache-Control', 'public, max-age=300'); // 5 minutes
  }
};
```

## Real-time Performance Monitoring

### Custom Metrics

```typescript
import { Histogram, Counter, Gauge } from 'prom-client';

// Custom performance metrics
const graphqlQueryDuration = new Histogram({
  name: 'graphql_query_duration_seconds',
  help: 'Duration of GraphQL queries',
  labelNames: ['operation', 'type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const activeConnections = new Gauge({
  name: 'active_connections_total',
  help: 'Number of active connections',
});

const errorRate = new Counter({
  name: 'errors_total', 
  help: 'Total number of errors',
  labelNames: ['type', 'operation'],
});

// Middleware to collect metrics
const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const operation = req.body?.operationName || 'unknown';
    
    graphqlQueryDuration
      .labels(operation, req.body?.query?.includes('mutation') ? 'mutation' : 'query')
      .observe(duration);
      
    if (res.statusCode >= 400) {
      errorRate.labels('http', operation).inc();
    }
  });
  
  next();
};
```

### Performance Dashboards

```typescript
// Performance dashboard data
const getPerformanceDashboard = async () => {
  const [
    dbStats,
    cacheStats, 
    memoryStats,
    queryStats,
  ] = await Promise.all([
    dbClient.getStats(),
    cacheManager.getStats(),
    getMemoryStats(),
    getQueryPerformanceStats(),
  ]);
  
  return {
    timestamp: new Date(),
    
    // Database performance
    database: {
      activeConnections: dbStats.borrowed,
      avgQueryTime: dbStats.averageQueryTime,
      slowQueries: dbStats.slowQueryCount,
      queryThroughput: dbStats.queriesPerSecond,
    },
    
    // Cache performance
    cache: {
      hitRate: cacheStats.overall.overallHitRate,
      avgResponseTime: cacheStats.overall.averageResponseTime,
      memoryUsage: cacheStats.l2.memory + cacheStats.l3.memory,
      evictionRate: cacheStats.l2.evictions,
    },
    
    // Memory performance
    memory: {
      heapUsed: memoryStats.heapUsed,
      heapTotal: memoryStats.heapTotal,
      heapUtilization: memoryStats.heapUtilization,
      gcFrequency: memoryStats.gcFrequency,
    },
    
    // Query performance
    queries: {
      avgDuration: queryStats.averageDuration,
      throughput: queryStats.requestsPerSecond,
      errorRate: queryStats.errorRate,
      complexity: queryStats.averageComplexity,
    },
  };
};

// Expose dashboard endpoint
app.get('/dashboard/performance', async (req, res) => {
  const dashboard = await getPerformanceDashboard();
  res.json(dashboard);
});
```

### Alerting System

```typescript
// Performance alerting
const performanceAlerts = {
  highMemoryUsage: {
    threshold: 0.8,
    check: (stats) => stats.memory.heapUtilization > 0.8,
    message: 'High memory usage detected',
  },
  
  slowQueries: {
    threshold: 1000,
    check: (stats) => stats.database.avgQueryTime > 1000,
    message: 'Slow database queries detected',
  },
  
  lowCacheHitRate: {
    threshold: 0.6,
    check: (stats) => stats.cache.hitRate < 0.6,
    message: 'Low cache hit rate detected',
  },
  
  highErrorRate: {
    threshold: 0.05,
    check: (stats) => stats.queries.errorRate > 0.05,
    message: 'High error rate detected',
  },
};

// Check alerts periodically
setInterval(async () => {
  const stats = await getPerformanceDashboard();
  
  Object.entries(performanceAlerts).forEach(([name, alert]) => {
    if (alert.check(stats)) {
      logger.error(`Performance Alert: ${alert.message}`, {
        alert: name,
        threshold: alert.threshold,
        currentValue: getCurrentValue(stats, name),
      });
      
      // Send notification (Slack, PagerDuty, etc.)
      sendAlert(alert.message, stats);
    }
  });
}, 60000); // Every minute
```

## Optimization Best Practices

### Query Optimization Checklist

- ✅ Use DataLoaders to batch database queries
- ✅ Implement query complexity analysis
- ✅ Add query depth limiting
- ✅ Optimize resolver field selection
- ✅ Use proper database indexes
- ✅ Implement query result caching
- ✅ Monitor slow queries regularly
- ✅ Use prepared statements

### Caching Best Practices

- ✅ Implement multi-level caching strategy
- ✅ Use appropriate TTL values for different data types
- ✅ Implement cache warming for popular data
- ✅ Monitor cache hit rates and optimize accordingly
- ✅ Use cache compression for large objects
- ✅ Implement proper cache invalidation
- ✅ Use cache tags for grouped invalidation

### Database Best Practices

- ✅ Use connection pooling
- ✅ Monitor connection pool utilization
- ✅ Implement proper indexing strategy
- ✅ Use query performance analysis
- ✅ Monitor slow queries
- ✅ Implement query retries with backoff
- ✅ Use database-level optimizations

### Memory Management Best Practices

- ✅ Monitor heap utilization regularly
- ✅ Implement object pooling for frequently created objects
- ✅ Detect and prevent memory leaks
- ✅ Use appropriate garbage collection settings
- ✅ Monitor external memory usage
- ✅ Implement memory pressure handling

## Performance Testing

### Load Testing

```typescript
// Load testing configuration
const loadTestConfig = {
  concurrent: 100,        // Concurrent users
  duration: '5m',         // Test duration
  rampUp: '30s',         // Ramp up time
  
  scenarios: {
    query_todos: {
      weight: 60,
      query: `query { todos { id title completed } }`,
    },
    
    query_users: {
      weight: 30,
      query: `query { users { id name email } }`,
    },
    
    create_todo: {
      weight: 10,
      query: `mutation($input: CreateTodoInput!) { 
        createTodo(input: $input) { id title } 
      }`,
      variables: { input: { title: 'Test Todo' } },
    },
  },
};

// Performance benchmarks
const performanceBenchmarks = {
  responseTime: {
    p95: 200,     // 95th percentile < 200ms
    p99: 500,     // 99th percentile < 500ms
  },
  
  throughput: {
    min: 1000,    // > 1000 requests/second
  },
  
  errorRate: {
    max: 0.01,    // < 1% error rate
  },
  
  resources: {
    cpu: 70,      // < 70% CPU usage
    memory: 80,   // < 80% memory usage
  },
};
```

### Continuous Performance Monitoring

```bash
# Set up performance monitoring
npm install -g clinic
npm install -g autocannon

# Profile application performance
clinic doctor -- node index.js
clinic bubbleprof -- node index.js  
clinic flame -- node index.js

# Load test GraphQL endpoint
autocannon -c 10 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"query":"{ todos { id title } }"}' \
  http://localhost:4000/graphql
```

This comprehensive performance guide provides the foundation for building and maintaining a high-performance GraphQL application with proper monitoring, optimization, and alerting systems in place.