# Database & Performance Optimization

Advanced database configuration with connection pooling, query optimization, performance monitoring, and automated query analysis.

## Overview

The database system provides:

- **Connection Pooling**: Optimized PostgreSQL connections with automatic scaling
- **Query Optimization**: N+1 detection, prepared statements, and query analysis
- **Performance Monitoring**: Real-time metrics and slow query detection
- **Enhanced Client**: Advanced database operations with automatic retries
- **Health Monitoring**: Comprehensive database health checks

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  GraphQL Query  │────│ Query Optimizer │────│ Connection Pool │
│   Resolution    │    │ (N+1 Detection) │    │ (Load Balanced) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DataLoaders   │────│   Prepared      │────│   PostgreSQL    │
│   (Batching)    │    │  Statements     │    │   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Configuration

### Environment Variables

```bash
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/pothos_todo"
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=pothos_todo

# Connection Pool Settings
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=10000

# Performance Settings  
DB_PREPARED_STATEMENTS=true
DB_QUERY_ANALYSIS=true
DB_SLOW_QUERY_THRESHOLD=1000
DB_MAX_PREPARED_STATEMENTS=100
DB_QUERY_CACHE_SIZE=500

# Monitoring
DB_ENABLE_METRICS=true
DB_ENABLE_PERFORMANCE_INSIGHTS=true
DB_LOG_SLOW_QUERIES=true
```

### Database Configuration

```typescript
import { DatabaseConfig } from './lib/database/types.js';

const databaseConfig: DatabaseConfig = {
  // Prisma configuration
  url: process.env.DATABASE_URL,
  
  // Connection pool settings
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false,
  },
  
  // Query optimization
  optimization: {
    enableQueryAnalysis: true,
    enablePreparedStatements: true,
    slowQueryThreshold: 1000,
    maxPreparedStatements: 100,
    maxQueryCacheSize: 500,
  },
  
  // Performance monitoring
  monitoring: {
    enableMetrics: true,
    enablePerformanceInsights: true,
    logSlowQueries: true,
    healthCheckInterval: 30000,
  },
};
```

## Connection Pool Management

### Pool Configuration

```typescript
import { DatabaseConnectionPool } from './lib/database/connection-pool.js';

const connectionPool = new DatabaseConnectionPool({
  // Pool sizing
  min: 5,                    // Minimum connections
  max: 20,                   // Maximum connections
  
  // Timeouts
  acquireTimeoutMillis: 10000,     // Time to wait for connection
  createTimeoutMillis: 10000,      // Time to create new connection
  idleTimeoutMillis: 30000,        // Time before idle connection is closed
  
  // Connection management
  reapIntervalMillis: 1000,        // How often to check for idle connections
  createRetryIntervalMillis: 200,  // Retry interval for failed connections
  
  // Error handling
  propagateCreateError: false,     // Don't propagate pool creation errors
  
  // Health monitoring
  enableHealthCheck: true,
  healthCheckInterval: 30000,      // Health check every 30 seconds
});
```

### Connection Operations

```typescript
// Get connection from pool
const connection = await connectionPool.acquire();

try {
  // Execute database operations
  const result = await connection.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows;
} finally {
  // Always release connection back to pool
  connectionPool.release(connection);
}

// Using transaction wrapper
await connectionPool.transaction(async (connection) => {
  await connection.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
  await connection.query('INSERT INTO login_logs (user_id, timestamp) VALUES ($1, NOW())', [userId]);
});
```

### Pool Monitoring

```typescript
// Get pool statistics
const stats = connectionPool.getStats();

console.log(stats);
// Output:
{
  size: 15,                    // Current pool size
  available: 8,                // Available connections
  borrowed: 7,                 // Connections in use
  invalid: 0,                  // Invalid connections
  pending: 2,                  // Pending connection requests
  max: 20,                     // Maximum pool size
  min: 5,                      // Minimum pool size
  
  // Performance metrics
  totalAcquires: 1250,         // Total connection acquisitions
  totalReleases: 1240,         // Total connection releases
  totalCreates: 18,            // Total connections created
  totalDestroys: 3,            // Total connections destroyed
  
  // Timing metrics
  averageAcquireTime: 12.5,    // Average time to acquire connection (ms)
  averageCreateTime: 45.2,     // Average time to create connection (ms)
}
```

## Query Optimization

### Automatic N+1 Detection

```typescript
import { DatabaseQueryOptimizer } from './lib/database/query-optimizer.js';

const optimizer = new DatabaseQueryOptimizer(connectionPool, {
  enableQueryAnalysis: true,
  slowQueryThreshold: 1000,
  maxQueryCacheSize: 500,
});

// Automatic analysis during query execution
const analysis = await optimizer.analyzeQuery(`
  SELECT * FROM todos WHERE user_id = $1
`);

console.log(analysis);
// Output:
{
  originalQuery: "SELECT * FROM todos WHERE user_id = $1",
  optimizedQuery: "SELECT * FROM todos WHERE user_id = $1",
  improvements: [
    "Consider using an index on todos(user_id)",
    "Use prepared statement to improve performance"
  ],
  potentialIssues: [
    "Query could benefit from LIMIT clause"
  ],
  performanceGain: 15.2  // Estimated improvement percentage
}
```

### Prepared Statements

```typescript
// Automatic prepared statement caching
const preparedQuery = await optimizer.prepareStatement(
  'getUserTodos',
  'SELECT * FROM todos WHERE user_id = $1 AND completed = $2'
);

// Execute prepared statement
const results = await preparedQuery.execute([userId, false]);

// Statement statistics
console.log(preparedQuery.getStats());
// Output:
{
  id: 'getUserTodos',
  query: 'SELECT * FROM todos WHERE user_id = $1 AND completed = $2',
  usageCount: 45,
  averageExecutionTime: 8.7,
  lastUsed: Date,
  createdAt: Date
}
```

### Query Performance Analysis

```typescript
// Performance analysis with execution plan
const performance = await optimizer.analyzePerformance(`
  SELECT u.name, COUNT(t.id) as todo_count
  FROM users u
  LEFT JOIN todos t ON u.id = t.user_id
  WHERE u.active = true
  GROUP BY u.id, u.name
  ORDER BY todo_count DESC
`);

console.log(performance);
// Output:
{
  executionTime: 125.5,        // Actual execution time (ms)
  planningTime: 2.3,           // Query planning time (ms)
  estimatedCost: 156.34,       // PostgreSQL cost estimation
  actualRows: 1250,            // Actual rows returned
  estimatedRows: 1200,         // Estimated rows
  bufferHits: 45,              // Buffer cache hits
  bufferReads: 5,              // Disk reads
  isOptimized: true,           // Whether query is well optimized
  
  recommendations: [
    "Query is well optimized",
    "Consider partitioning if dataset grows significantly"
  ],
  
  executionPlan: "..."         // Full PostgreSQL execution plan
}
```

## Enhanced Database Client

### Client Configuration

```typescript
import { EnhancedDatabaseClient } from './lib/database/enhanced-client.js';

const dbClient = new EnhancedDatabaseClient(
  // Connection pool config
  {
    min: 10,
    max: 30,
    acquireTimeoutMillis: 15000,
  },
  
  // Query optimizer config
  {
    enableQueryAnalysis: true,
    enablePreparedStatements: true,
    slowQueryThreshold: 500,
    maxPreparedStatements: 200,
    maxQueryCacheSize: 1000,
  }
);

await dbClient.initialize();
```

### Advanced Operations

```typescript
// Execute with automatic optimization
const users = await dbClient.query(
  'SELECT * FROM users WHERE active = $1',
  [true],
  { 
    timeout: 5000,
    retries: 2,
    cacheable: true,
    cacheKey: 'active-users',
    cacheTTL: 300,
  }
);

// Batch operations
const batchResults = await dbClient.batch([
  { query: 'SELECT * FROM users WHERE id = $1', params: ['user1'] },
  { query: 'SELECT * FROM todos WHERE user_id = $1', params: ['user1'] },
  { query: 'SELECT COUNT(*) FROM todos WHERE user_id = $1', params: ['user1'] },
]);

// Stream large result sets
const userStream = dbClient.stream(
  'SELECT * FROM users ORDER BY created_at',
  [],
  { batchSize: 1000 }
);

for await (const batch of userStream) {
  console.log(`Processing batch of ${batch.length} users`);
  // Process batch
}
```

### Error Handling & Retries

```typescript
try {
  const result = await dbClient.query(
    'SELECT * FROM users WHERE id = $1',
    [userId],
    {
      retries: 3,
      retryDelay: 1000,
      retryCondition: (error) => {
        // Retry on connection errors, not on constraint violations
        return error.code === 'ECONNRESET' || error.code === '53300';
      },
    }
  );
} catch (error) {
  if (error instanceof DatabaseConnectionError) {
    // Handle connection issues
    logger.error('Database connection failed', { error });
  } else if (error instanceof QueryTimeoutError) {
    // Handle timeouts
    logger.warn('Query timed out', { error });
  } else {
    // Handle other database errors
    logger.error('Database query failed', { error });
  }
}
```

## DataLoader Integration

### Batch Loading

```typescript
import DataLoader from 'dataloader';

// User batch loader with database optimization
const userLoader = new DataLoader(
  async (userIds: readonly string[]) => {
    // Single optimized query instead of N queries
    const users = await dbClient.query(
      'SELECT * FROM users WHERE id = ANY($1::uuid[])',
      [userIds as string[]]
    );
    
    // Return results in same order as input
    return userIds.map(id => 
      users.find(user => user.id === id) || null
    );
  },
  {
    maxBatchSize: 100,
    cacheKeyFn: (key) => `user:${key}`,
    cache: true,
  }
);

// Todo batch loader with filtering
const todosByUserLoader = new DataLoader(
  async (userIds: readonly string[]) => {
    const todos = await dbClient.query(`
      SELECT * FROM todos 
      WHERE user_id = ANY($1::uuid[])
      ORDER BY user_id, created_at DESC
    `, [userIds as string[]]);
    
    // Group todos by user_id
    const todosByUser = new Map<string, any[]>();
    todos.forEach(todo => {
      if (!todosByUser.has(todo.user_id)) {
        todosByUser.set(todo.user_id, []);
      }
      todosByUser.get(todo.user_id)!.push(todo);
    });
    
    return userIds.map(userId => todosByUser.get(userId) || []);
  }
);
```

### DataLoader Factory

```typescript
export function createDataLoaders(dbClient: EnhancedDatabaseClient) {
  return {
    userLoader: createUserLoader(dbClient),
    todoLoader: createTodoLoader(dbClient),
    todoListLoader: createTodoListLoader(dbClient),
    todosByUserLoader: createTodosByUserLoader(dbClient),
    usersByTodoListLoader: createUsersByTodoListLoader(dbClient),
  };
}

// Usage in GraphQL context
export async function createGraphQLContext(event: H3Event): Promise<Context> {
  return {
    prisma,
    db: dbClient,
    loaders: createDataLoaders(dbClient),
    // ... other context
  };
}
```

## Performance Monitoring

### Database Metrics

```typescript
// Prometheus metrics available
pothos_database_connections_active{pool="main"}
pothos_database_connections_idle{pool="main"}
pothos_database_query_duration_seconds{operation="select",model="user"}
pothos_database_queries_total{operation="select",model="user",status="success"}
pothos_database_slow_queries_total{threshold="1000"}
pothos_database_pool_acquisition_duration_seconds
```

### Query Performance Tracking

```typescript
// Automatic slow query logging
const slowQueries = await dbClient.getSlowQueries({
  threshold: 1000,        // Queries slower than 1 second
  limit: 50,              // Latest 50 slow queries
  includeParams: false,   // Don't log parameters (security)
});

console.log(slowQueries);
// Output:
[
  {
    query: "SELECT * FROM todos WHERE user_id = $1",
    duration: 1250,
    timestamp: Date,
    executionCount: 45,
    averageDuration: 1100,
    recommendations: [
      "Add index on todos(user_id)",
      "Consider query optimization"
    ]
  }
]
```

### Health Monitoring

```typescript
// Database health check
const health = await dbClient.getHealthStatus();

console.log(health);
// Output:
{
  status: 'healthy',
  timestamp: Date,
  
  // Connection status
  connections: {
    total: 15,
    active: 7,
    idle: 8,
    maxConnections: 20,
    status: 'healthy'
  },
  
  // Performance metrics
  performance: {
    averageQueryTime: 25.5,      // ms
    slowQueryCount: 3,           // Last hour
    totalQueries: 15420,         // Since startup
    queriesPerSecond: 42.5,      // Current rate
  },
  
  // Database metrics
  database: {
    size: '245MB',
    connections: 45,
    locksCount: 2,
    deadlocksCount: 0,
    cacheHitRatio: 0.98,
  }
}
```

## Schema Management

### Migrations

```bash
# Generate migration from schema changes
bun run db:migrate

# Apply migrations
bun run db:deploy

# Reset database (development only)
bun run db:reset

# View migration status
bun run db:status
```

### Schema Introspection

```typescript
// Get database schema information
const schema = await dbClient.introspectSchema();

console.log(schema.tables);
// Output:
{
  users: {
    columns: {
      id: { type: 'uuid', nullable: false, default: 'gen_random_uuid()' },
      email: { type: 'varchar', nullable: false, unique: true },
      name: { type: 'varchar', nullable: true },
      created_at: { type: 'timestamp', nullable: false, default: 'now()' },
    },
    indexes: {
      users_pkey: { columns: ['id'], unique: true, primary: true },
      users_email_key: { columns: ['email'], unique: true },
    },
    relations: [
      { table: 'todos', column: 'user_id', references: 'id' }
    ]
  }
}
```

## Best Practices

### Connection Management

```typescript
// Good: Use connection pooling
const result = await dbClient.query('SELECT * FROM users');

// Bad: Create new connection each time
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
const result = await client.query('SELECT * FROM users');
await client.end();
```

### Query Optimization

```typescript
// Good: Use proper indexes and prepared statements
const users = await dbClient.query(
  'SELECT * FROM users WHERE email = $1 AND active = $2',
  [email, true]
);

// Bad: String concatenation and no indexes
const users = await dbClient.query(
  `SELECT * FROM users WHERE email = '${email}' AND active = true`
);
```

### Error Handling

```typescript
// Good: Specific error handling
try {
  const result = await dbClient.query(query, params);
  return result;
} catch (error) {
  if (error.code === '23505') {
    throw new UniqueConstraintError('Email already exists');
  } else if (error.code === '23503') {
    throw new ForeignKeyConstraintError('Referenced record not found');
  } else {
    logger.error('Database query failed', { error, query });
    throw new DatabaseError('Query execution failed');
  }
}
```

### Performance Guidelines

1. **Use prepared statements** for repeated queries
2. **Implement proper indexing** on frequently queried columns
3. **Use LIMIT clauses** to prevent unbounded result sets
4. **Batch operations** when possible using DataLoaders
5. **Monitor slow queries** and optimize them regularly
6. **Use connection pooling** to manage database connections
7. **Implement proper error handling** with retries for transient errors
8. **Cache frequently accessed data** at appropriate levels

## Troubleshooting

### Common Issues

1. **Connection Pool Exhaustion**
   ```typescript
   // Monitor pool usage
   const stats = connectionPool.getStats();
   if (stats.pending > 0) {
     logger.warn('Connection pool under pressure', { stats });
   }
   ```

2. **Slow Queries**
   ```bash
   # Enable slow query logging
   ALTER SYSTEM SET log_min_duration_statement = 1000;
   SELECT pg_reload_conf();
   ```

3. **Memory Usage**
   ```typescript
   // Monitor memory usage
   const usage = process.memoryUsage();
   if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
     logger.warn('High memory usage detected', { usage });
   }
   ```

### Debug Mode

```bash
# Enable database debugging
DEBUG=db:* bun run start

# Enable query logging
DB_LOG_QUERIES=true bun run start

# Enable performance insights
DB_ENABLE_PERFORMANCE_INSIGHTS=true bun run start
```