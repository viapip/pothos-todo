# Database Connection Pooling

This project implements optimized database connection pooling using Prisma with PostgreSQL to efficiently manage database connections and improve performance.

## Overview

Connection pooling prevents the overhead of establishing and tearing down database connections for each request by maintaining a pool of reusable connections.

## Architecture

### PrismaService

The `PrismaService` class wraps Prisma Client with enhanced connection pooling features:

```typescript
const prismaService = PrismaService.getInstance({
  connectionLimit: 10,        // Max connections in pool
  connectTimeout: 30000,      // Connection timeout (30s)
  poolTimeout: 10000,         // Pool timeout (10s)
  idleTimeout: 60000,         // Idle timeout (1 minute)
  queryTimeout: 30000,        // Query timeout (30s)
  enableQueryLogging: false,  // Query logging
  enableMetrics: true,        // Performance metrics
});
```

## Configuration

### Environment Variables

```bash
# Database connection pool size
DATABASE_POOL_SIZE=10

# Connection URL with pooling parameters
DATABASE_URL="postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=10&connect_timeout=30"
```

### Pool Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `connection_limit` | 10 | Maximum number of connections |
| `connect_timeout` | 30s | Time to wait for connection |
| `pool_timeout` | 10s | Time to wait for available connection |
| `idle_timeout` | 60s | Connection idle timeout |
| `statement_timeout` | 30s | Query execution timeout |

## Features

### 1. Connection Management

Automatic connection lifecycle management:

```typescript
// Initialize connection pool
await prismaService.connect();

// Use pooled connections
const prisma = prismaService.getClient();
const users = await prisma.user.findMany();

// Graceful shutdown
await prismaService.disconnect();
```

### 2. Health Monitoring

Built-in health checks and metrics:

```typescript
// Health check
const health = await prismaService.healthCheck();
console.log(health); // { status: 'healthy', latency: 12, details: {...} }

// Pool statistics
const stats = prismaService.getPoolStats();
console.log(stats); // { connectionCount: 5, queryCount: 1250, errorRate: '0.1%' }
```

### 3. Retry Logic

Automatic retry for transient failures:

```typescript
// Connection with retry
await prismaService.connect(); // Retries 3 times with exponential backoff

// Transaction with retry
await prismaService.transaction(async (prisma) => {
  // Transaction operations
}, { maxWait: 5000, timeout: 10000 });
```

### 4. Query Optimization

Middleware for performance monitoring:

```typescript
// Slow query logging
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    logger.warn('Slow query', { model: params.model, duration });
  }
  
  return result;
});
```

## Monitoring

### Pool Statistics

The service provides detailed pool statistics:

```json
{
  "connectionCount": 8,
  "queryCount": 1523,
  "errorCount": 2,
  "uptime": 3600000,
  "avgQueryTime": 45,
  "errorRate": "0.13%"
}
```

### Health Checks

Health endpoints include pool status:

```bash
curl http://localhost:4000/health/ready
```

```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "pass",
      "responseTime": 12,
      "metadata": {
        "poolStats": {
          "connectionCount": 5,
          "queryCount": 1250
        }
      }
    }
  }
}
```

## Performance Optimization

### Connection Pool Sizing

Rule of thumb for pool size:

```
Pool Size = ((Core Count × 2) + Effective Spindle Count)
```

For most applications:
- Development: 5-10 connections
- Production: 10-20 connections
- High traffic: 20-50 connections

### Query Optimization

1. **Use appropriate indexes**:
   ```sql
   CREATE INDEX idx_user_todos ON todos(user_id);
   ```

2. **Batch operations**:
   ```typescript
   // Instead of multiple queries
   for (const todo of todos) {
     await prisma.todo.create({ data: todo });
   }
   
   // Use batch insert
   await prisma.todo.createMany({ data: todos });
   ```

3. **Use DataLoader for N+1 prevention**:
   ```typescript
   const todos = await context.loaders.todosByUserId.loadMany(userIds);
   ```

### Connection String Optimization

Optimized PostgreSQL connection string:

```
postgresql://user:pass@host:port/db?
  connection_limit=10&
  pool_timeout=10&
  connect_timeout=30&
  idle_in_transaction_session_timeout=60&
  statement_timeout=30&
  schema=public&
  pgbouncer=true&
  sslmode=prefer
```

## Best Practices

### 1. Pool Configuration

- Start with conservative pool sizes
- Monitor connection usage patterns
- Adjust based on actual load
- Consider database server limits

### 2. Error Handling

```typescript
try {
  await prisma.user.create({ data: userData });
} catch (error) {
  if (error.code === 'P2002') {
    // Handle unique constraint violation
  }
  throw error;
}
```

### 3. Transaction Management

```typescript
// Use transactions for related operations
await prisma.$transaction([
  prisma.user.create({ data: userData }),
  prisma.profile.create({ data: profileData }),
]);
```

### 4. Resource Cleanup

```typescript
// Always disconnect on shutdown
process.on('SIGTERM', async () => {
  await prismaService.disconnect();
  process.exit(0);
});
```

## Troubleshooting

### Connection Pool Exhausted

**Symptoms**: "Too many connections" errors

**Solutions**:
1. Increase pool size (carefully)
2. Check for connection leaks
3. Implement connection timeout
4. Review query patterns

### Slow Queries

**Symptoms**: High response times

**Solutions**:
1. Add database indexes
2. Optimize query structure
3. Use query batching
4. Implement result caching

### Memory Issues

**Symptoms**: High memory usage

**Solutions**:
1. Reduce pool size
2. Implement query result streaming
3. Use pagination for large datasets
4. Monitor connection lifetime

## Production Considerations

### Load Balancing

Use PgBouncer for connection pooling at the database level:

```
# pgbouncer.ini
[databases]
mydb = host=postgres port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
max_client_conn = 100
default_pool_size = 10
```

### Monitoring

Track these metrics:
- Connection pool utilization
- Average query execution time
- Error rates by query type
- Connection lifecycle events

### Scaling

For horizontal scaling:
- Use read replicas for read-heavy workloads
- Implement database sharding for write scaling
- Use connection pooling at application and database levels