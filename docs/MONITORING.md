# Comprehensive Health Monitoring System

The Pothos GraphQL API includes a comprehensive health monitoring system with Prometheus metrics, detailed health checks, and production-ready observability.

## Features

### Health Check Endpoints

- **`/health`** - Comprehensive health status with detailed component checks
- **`/ready`** - Readiness probe for load balancers (simple OK/NOT READY)
- **`/live`** - Liveness probe for container orchestrators (ALIVE/DEAD)
- **`/metrics`** - Prometheus-compatible metrics endpoint

### Health Check Components

1. **Database Health**
   - Connection verification
   - Basic query execution
   - User and todo count statistics
   - Connection timing metrics

2. **System Resources**
   - Memory usage monitoring with thresholds (warning >75%, critical >90%)
   - CPU usage tracking
   - Process uptime and platform information
   - Node.js version tracking

3. **GraphQL Schema**
   - Schema availability verification
   - Query/Mutation/Subscription support validation

4. **Subscription System**
   - Subscription manager functionality
   - Event creation and publishing validation

5. **External Dependencies**
   - Redis status (when configured)
   - External API health (extensible)

### Health Status Levels

- **Healthy**: All systems operational
- **Degraded**: Some non-critical components have issues
- **Unhealthy**: Critical systems (e.g., database) are failing

## Prometheus Metrics

### HTTP Metrics
- `pothos_http_request_duration_seconds` - Request duration histogram
- `pothos_http_requests_total` - Total request counter
- `pothos_http_active_connections` - Active connection gauge

### GraphQL Metrics
- `pothos_graphql_operation_duration_seconds` - Operation execution times
- `pothos_graphql_operations_total` - Operation counters by type
- `pothos_graphql_errors_total` - Error tracking by type and field
- `pothos_graphql_validation_errors_total` - Query validation errors

### Subscription Metrics
- `pothos_graphql_subscriptions_active` - Active subscription count
- `pothos_graphql_subscription_events_total` - Published events counter
- `pothos_websocket_connections_active` - WebSocket connection count
- `pothos_websocket_messages_total` - WebSocket message counters

### Database Metrics
- `pothos_database_query_duration_seconds` - Query execution times
- `pothos_database_queries_total` - Query counters by operation
- `pothos_database_connection_pool_size` - Connection pool status
- `pothos_database_connection_errors_total` - Connection error tracking

### Cache Metrics
- `pothos_cache_operations_total` - Cache hit/miss/error counters
- `pothos_cache_operation_duration_seconds` - Cache operation timing
- `pothos_cache_memory_usage_bytes` - Cache memory consumption

### Authentication Metrics
- `pothos_auth_attempts_total` - Authentication attempt counters
- `pothos_auth_active_sessions_total` - Active session count
- `pothos_auth_session_duration_seconds` - Session duration histogram

### Business Logic Metrics
- `pothos_todos_created_total` - Todo creation counter
- `pothos_todos_completed_total` - Todo completion counter
- `pothos_active_users_total` - Active user gauges by time window

### System Health Metrics
- `pothos_application_uptime_seconds` - Application uptime
- `pothos_health_check_status` - Health check results (1=healthy, 0=unhealthy)

## Usage Examples

### Basic Health Check
```bash
curl http://localhost:4000/health
```

Example response:
```json
{
  "status": "healthy",
  "timestamp": 1753205627890,
  "uptime": 120.45,
  "version": "1.0.0",
  "checks": {
    "database": { "status": "healthy", "duration": 2 },
    "system": { "status": "healthy", "duration": 1 },
    "graphql": { "status": "healthy", "duration": 0 },
    "subscriptions": { "status": "healthy", "duration": 1 },
    "dependencies": { "status": "healthy", "duration": 0 }
  },
  "summary": {
    "total": 5,
    "healthy": 5,
    "degraded": 0,
    "unhealthy": 0
  }
}
```

### Load Balancer Readiness Check
```bash
curl http://localhost:4000/ready
# Returns: OK (200) or NOT READY (503)
```

### Container Liveness Check
```bash
curl http://localhost:4000/live  
# Returns: ALIVE (200) or DEAD (503)
```

### Prometheus Metrics
```bash
curl http://localhost:4000/metrics
```

## Startup Health Validation

The server performs comprehensive health checks during startup:
- Validates database connectivity
- Verifies all system components
- Prevents startup if critical components are unhealthy
- Allows startup with warnings for degraded (non-critical) components

## Integration with Subscription System

The monitoring system tracks subscription-specific metrics:
- Subscription connection counts by type
- Event publishing rates and success/failure
- WebSocket connection lifecycle tracking
- Real-time subscription health validation

## Docker Health Checks

The production Docker image includes health check integration:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ./healthcheck.sh
```

The health check script validates:
- GraphQL endpoint responsiveness
- Database connectivity via GraphQL
- Memory usage thresholds
- Process health verification

## Grafana Integration

Pre-configured Grafana dashboards include:
- **API Overview**: Response times, error rates, operation counts
- **System Resources**: Memory, CPU, connection pool status
- **GraphQL Operations**: Query performance, subscription activity
- **Health Status**: Component health over time

Dashboard location: `docker/grafana/dashboards/pothos-api-overview.json`

## Production Monitoring Setup

1. **Prometheus Configuration**: `docker/prometheus/prometheus.yml`
2. **Grafana Dashboards**: Pre-built dashboards in `docker/grafana/`
3. **Alert Rules**: Configure based on health check metrics
4. **Log Aggregation**: Structured logging with correlation IDs

## Custom Health Checks

To add custom health checks, extend the health check registry:

```typescript
// src/lib/monitoring/health.ts
const customHealthCheck = async (): Promise<HealthCheckResult> => {
  // Your health check logic
  return {
    status: 'healthy',
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  };
};

// Add to healthChecks registry
const healthChecks = {
  // ... existing checks
  custom: customHealthCheck,
};
```

## Performance Considerations

- Health checks run in parallel for optimal performance
- Metrics collection has minimal performance impact
- Database health checks use lightweight queries
- Memory usage is monitored to prevent OOM conditions
- Connection tracking prevents resource leaks

## Security Features

- Health endpoints provide operational data only
- No sensitive information exposed in health responses
- Rate limiting applied to monitoring endpoints
- Metrics scraping can be restricted by network policy
- Authentication not required for basic health status (by design)