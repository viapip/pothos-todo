# Multi-Level Caching System

A comprehensive caching system with three levels: DataLoader (L1), in-memory cache (L2), and Redis (L3) for optimal performance.

## Overview

The caching system implements a hierarchical approach with automatic fallback and intelligent cache warming:

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│     L1      │───▶│      L2      │───▶│     L3      │
│ DataLoader  │    │  In-Memory   │    │   Redis     │
│ (Request)   │    │ (Process)    │    │(Distributed)│
└─────────────┘    └──────────────┘    └─────────────┘
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redispassword
REDIS_DB=0
REDIS_KEY_PREFIX=pothos:
```

### Cache Configuration

```typescript
import { CacheConfig } from './lib/cache/types.js';

const cacheConfig: CacheConfig = {
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'redispassword',
    db: 0,
    keyPrefix: 'pothos:',
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    lazyConnect: true,
  },
  levels: {
    l1: {
      enabled: true,
      maxBatchSize: 100,
      maxCacheSize: 1000,
    },
    l2: {
      enabled: true,
      maxSize: 10000,
      ttl: 300, // 5 minutes
      checkInterval: 60,
      deleteOnExpire: true,
    },
    l3: {
      enabled: true,
      defaultTTL: 3600, // 1 hour
      maxRetries: 3,
      compression: {
        enabled: true,
        algorithm: 'gzip',
        threshold: 1024, // 1KB
      },
    },
  },
  invalidation: {
    enabled: true,
    strategies: {
      timeBasedInvalidation: true,
      tagBasedInvalidation: true,
      eventBasedInvalidation: true,
      versionBasedInvalidation: false,
    },
  },
  monitoring: {
    enabled: true,
    metricsPrefix: 'cache',
    detailedMetrics: true,
    slowQueryThreshold: 100,
  },
};
```

## Cache Levels

### L1 Cache (DataLoader)

**Purpose**: Request-scoped batching and deduplication
**Scope**: Per GraphQL request
**Storage**: In-memory (request lifecycle)

```typescript
import DataLoader from 'dataloader';

// User DataLoader
const userLoader = new DataLoader(async (userIds: readonly string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds as string[] } },
  });
  
  return userIds.map(id => users.find(user => user.id === id) || null);
}, {
  cache: true,
  maxBatchSize: 100,
});

// Usage in resolvers
const user = await context.loaders.userLoader.load(userId);
```

### L2 Cache (In-Memory)

**Purpose**: Process-scoped fast access
**Scope**: Application process
**Storage**: Node.js heap memory

```typescript
// Automatic cache population from L3
const result = await cacheManager.get<User>('user:123');
if (!result.hit) {
  // Cache miss - fetch from database
  const user = await fetchUserFromDatabase('123');
  await cacheManager.set('user:123', user, 300); // 5 min TTL
}
```

### L3 Cache (Redis)

**Purpose**: Distributed persistent cache
**Scope**: Multiple application instances
**Storage**: Redis database

```typescript
// Direct Redis operations
await cacheManager.set('user:123', userData, 3600);
const cached = await cacheManager.get('user:123');

// With tags for invalidation
await cacheManager.set(
  { key: 'user:123', tags: ['users', 'profile'], ttl: 3600 },
  userData
);
```

## Cache Strategies

### Cache-First

Check cache first, fallback to source on miss:

```typescript
const CACHE_FIRST_POLICY = {
  strategy: 'cache-first',
  ttl: 1800, // 30 minutes
  tags: ['todos'],
  invalidateOn: ['todo:created', 'todo:updated'],
};

// Usage
const todo = await cacheManager.getOrSet(
  'todo:123',
  () => fetchTodoFromDatabase('123'),
  1800,
  'cache-first'
);
```

### Network-First

Check source first, fallback to stale cache on failure:

```typescript
const NETWORK_FIRST_POLICY = {
  strategy: 'network-first',
  ttl: 300,
  tags: ['dynamic-data'],
  invalidateOn: ['data:updated'],
};
```

### Stale-While-Revalidate

Return stale cache immediately, revalidate in background:

```typescript
const SWR_POLICY = {
  strategy: 'stale-while-revalidate',
  ttl: 3600,
  staleWhileRevalidate: 7200, // 2 hours stale tolerance
  tags: ['aggregations'],
  invalidateOn: ['data:significant_change'],
};
```

## Cache Invalidation

### Tag-Based Invalidation

Invalidate multiple cache entries by tag:

```typescript
// Invalidate all user-related cache entries
await cacheManager.invalidateByTag('users');

// Invalidate specific patterns
await cacheManager.invalidateByPattern('user:*');
```

### Event-Based Invalidation

Automatic invalidation on specific events:

```typescript
// Configure invalidation rules
const invalidationRules = {
  'todo:created': ['todos', 'user:*:todos', 'statistics'],
  'user:updated': ['users', 'profiles'],
  'todo:deleted': ['todos', 'counts'],
};

// Trigger invalidation
eventEmitter.emit('todo:created', { todoId: '123', userId: '456' });
```

### Time-Based Invalidation

Automatic expiration with configurable TTL:

```typescript
// Set with TTL
await cacheManager.set('temporary-data', data, 60); // 1 minute

// Different TTLs for different data types
const TTL_CONFIG = {
  users: 1800,        // 30 minutes
  todos: 1200,        // 20 minutes
  statistics: 3600,   // 1 hour
  sessions: 86400,    // 24 hours
};
```

## Resolver Integration

### Cached Resolver Pattern

```typescript
import { createCachedResolver } from './lib/cache/resolvers.js';

const getTodos = createCachedResolver(
  'Query',           // Type name
  'todos',           // Field name
  async (source, args, context, info) => {
    // Original resolver logic
    return await context.prisma.todo.findMany({
      where: { userId: context.user.id },
    });
  },
  CACHE_POLICIES.TODO_DATA  // Cache policy
);

// Usage in schema
builder.queryField('todos', (t) => t.prismaField({
  type: [Todo],
  resolve: getTodos,
}));
```

### Custom Cache Keys

```typescript
const getCachedResolver = createCachedResolver(
  'Query',
  'userTodos',
  {
    resolve: async (source, args, context) => {
      return fetchUserTodos(args.userId);
    },
    cacheKeyGenerator: (source, args, context) => {
      return `todos:user:${args.userId}:page:${args.page || 1}`;
    },
  },
  {
    strategy: 'cache-first',
    ttl: 1200,
    tags: ['todos'],
    invalidateOn: ['todo:created', 'todo:updated'],
  }
);
```

## Monitoring

### Cache Metrics

Monitor cache performance with built-in metrics:

```typescript
// Prometheus metrics available
pothos_cache_operations_total{operation="get",level="l2",status="hit"}
pothos_cache_operation_duration_seconds{operation="get",level="l3"}
pothos_cache_memory_usage_bytes{level="l2"}
pothos_cache_hit_rate{level="all"}
```

### Cache Statistics

```typescript
// Get detailed statistics
const stats = await cacheManager.getStats();

console.log(stats);
// Output:
{
  l1: { hits: 1250, misses: 150, hitRate: 0.89, size: 500 },
  l2: { hits: 800, misses: 200, hitRate: 0.80, size: 2000, memory: 50000 },
  l3: { hits: 400, misses: 100, hitRate: 0.80, size: 5000, memory: 200000 },
  overall: {
    totalHits: 2450,
    totalMisses: 450, 
    overallHitRate: 0.845,
    averageResponseTime: 12.5
  }
}
```

### Health Checks

Cache health is monitored via health check endpoint:

```bash
curl http://localhost:4000/health
```

```json
{
  "cache": {
    "status": "healthy",
    "l1": { "status": "healthy", "size": 500 },
    "l2": { "status": "healthy", "size": 2000, "memory": "48.8KB" },
    "l3": { "status": "healthy", "connected": true, "memory": "195KB" }
  }
}
```

## Best Practices

### Cache Key Design

```typescript
// Good: Hierarchical, descriptive keys
"user:123:profile"
"todo:456:details" 
"list:789:todos:page:1"

// Bad: Flat, unclear keys
"u123"
"data456"
"temp789"
```

### TTL Guidelines

```typescript
// Very dynamic data (1-5 minutes)
const DYNAMIC_TTL = 300;

// Semi-static data (15-30 minutes)
const SEMI_STATIC_TTL = 1800;

// Static data (1-24 hours)
const STATIC_TTL = 86400;
```

### Memory Management

```typescript
// Configure appropriate sizes
const L2_CONFIG = {
  maxSize: process.env.NODE_ENV === 'production' ? 50000 : 10000,
  ttl: 1800,
  checkInterval: 300,
};

// Use compression for large objects
const COMPRESSION_CONFIG = {
  enabled: true,
  threshold: 1024, // 1KB
  algorithm: 'gzip',
};
```

### Error Handling

```typescript
try {
  const result = await cacheManager.get('key');
  return result.value || await fetchFromDatabase();
} catch (error) {
  // Log cache error but don't fail the request
  logger.warn('Cache error, falling back to database', { error });
  return await fetchFromDatabase();
}
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce L2 cache size
   - Lower TTL values
   - Enable compression

2. **Cache Misses**
   - Check cache key consistency
   - Verify TTL configuration
   - Review invalidation patterns

3. **Redis Connection Issues**
   - Verify Redis server status
   - Check network connectivity
   - Review connection pool settings

### Debug Mode

Enable debug logging for cache operations:

```bash
NODE_ENV=development DEBUG=cache:* bun run start
```

### Performance Tuning

```typescript
// Optimize for your workload
const PERFORMANCE_CONFIG = {
  l1: {
    maxBatchSize: 200,     // Increase for batch-heavy workloads
    maxCacheSize: 2000,    // Increase for request-heavy patterns
  },
  l2: {
    maxSize: 20000,        // Adjust based on available memory
    ttl: 1200,             // Balance between freshness and hits
  },
  l3: {
    defaultTTL: 7200,      // Longer for stable data
    compression: {
      threshold: 512,      // Lower threshold for better compression
    },
  },
};
```