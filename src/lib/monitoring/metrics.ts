/**
 * Prometheus Metrics Collection for Pothos GraphQL API
 * Comprehensive monitoring of API performance, GraphQL operations, and system health
 */

import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from '../../logger.js';

// Enable default system metrics collection
collectDefaultMetrics({
  prefix: 'pothos_',
  register,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ================================
// HTTP Metrics
// ================================ 

/**
 * HTTP request duration histogram
 * Tracks response times by method, route, and status code
 */
export const httpRequestDuration = new Histogram({
  name: 'pothos_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

/**
 * HTTP request counter
 * Counts total HTTP requests by method, route, and status code
 */
export const httpRequestsTotal = new Counter({
  name: 'pothos_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Active HTTP connections gauge
 * Tracks current number of active HTTP connections
 */
export const httpActiveConnections = new Gauge({
  name: 'pothos_http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

// ================================
// GraphQL Metrics
// ================================

/**
 * GraphQL operation duration histogram
 * Tracks GraphQL operation execution times
 */
export const graphqlOperationDuration = new Histogram({
  name: 'pothos_graphql_operation_duration_seconds',
  help: 'Duration of GraphQL operations in seconds',
  labelNames: ['operation_type', 'operation_name', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/**
 * GraphQL operations counter
 * Counts total GraphQL operations by type and name
 */
export const graphqlOperationsTotal = new Counter({
  name: 'pothos_graphql_operations_total',
  help: 'Total number of GraphQL operations',
  labelNames: ['operation_type', 'operation_name', 'status'],
  registers: [register],
});

/**
 * GraphQL errors counter
 * Counts GraphQL errors by type and field
 */
export const graphqlErrorsTotal = new Counter({
  name: 'pothos_graphql_errors_total',
  help: 'Total number of GraphQL errors',
  labelNames: ['error_type', 'field_name', 'error_code'],
  registers: [register],
});

/**
 * GraphQL validation errors counter
 * Counts GraphQL query validation errors
 */
export const graphqlValidationErrorsTotal = new Counter({
  name: 'pothos_graphql_validation_errors_total',
  help: 'Total number of GraphQL validation errors',
  labelNames: ['validation_rule'],
  registers: [register],
});

// ================================
// Subscription Metrics
// ================================

/**
 * Active GraphQL subscriptions gauge
 * Tracks current number of active subscriptions
 */
export const graphqlSubscriptionsActive = new Gauge({
  name: 'pothos_graphql_subscriptions_active',
  help: 'Number of active GraphQL subscriptions',
  labelNames: ['subscription_type'],
  registers: [register],
});

/**
 * GraphQL subscription events counter
 * Counts subscription events published
 */
export const graphqlSubscriptionEventsTotal = new Counter({
  name: 'pothos_graphql_subscription_events_total',
  help: 'Total number of GraphQL subscription events published',
  labelNames: ['event_type', 'topic'],
  registers: [register],
});

/**
 * WebSocket connections gauge
 * Tracks current number of WebSocket connections
 */
export const websocketConnectionsActive = new Gauge({
  name: 'pothos_websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

/**
 * WebSocket messages counter
 * Counts WebSocket messages by type
 */
export const websocketMessagesTotal = new Counter({
  name: 'pothos_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['message_type', 'direction'],
  registers: [register],
});

// ================================
// Database Metrics
// ================================

/**
 * Database query duration histogram
 * Tracks database query execution times
 */
export const databaseQueryDuration = new Histogram({
  name: 'pothos_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

/**
 * Database queries counter
 * Counts total database queries
 */
export const databaseQueriesTotal = new Counter({
  name: 'pothos_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'model', 'status'],
  registers: [register],
});

/**
 * Database connection pool gauge
 * Tracks database connection pool status
 */
export const databaseConnectionPoolSize = new Gauge({
  name: 'pothos_database_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['state'], // 'active', 'idle', 'waiting'
  registers: [register],
});

/**
 * Database connection errors counter
 * Counts database connection errors
 */
export const databaseConnectionErrorsTotal = new Counter({
  name: 'pothos_database_connection_errors_total',
  help: 'Total number of database connection errors',
  labelNames: ['error_type'],
  registers: [register],
});

/**
 * Database slow queries counter
 * Counts queries that exceed the slow query threshold
 */
export const databaseSlowQueries = new Counter({
  name: 'pothos_database_slow_queries_total',
  help: 'Total number of slow database queries',
  labelNames: ['operation'],
  registers: [register],
});

/**
 * Database connections gauge - active connections
 * Tracks the number of active database connections
 */
export const databaseConnectionsActive = new Gauge({
  name: 'pothos_database_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

/**
 * Database connections gauge - idle connections
 * Tracks the number of idle database connections
 */
export const databaseConnectionsIdle = new Gauge({
  name: 'pothos_database_connections_idle',
  help: 'Number of idle database connections',
  registers: [register],
});

// ================================
// Cache Metrics
// ================================

/**
 * Cache operations counter
 * Counts cache hits, misses, and operations
 */
export const cacheOperationsTotal = new Counter({
  name: 'pothos_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'status'], // operation: get, set, del; status: hit, miss, success, error
  registers: [register],
});

/**
 * Cache operation duration histogram
 * Tracks cache operation execution times
 */
export const cacheOperationDuration = new Histogram({
  name: 'pothos_cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5],
  registers: [register],
});

/**
 * Cache memory usage gauge
 * Tracks cache memory consumption
 */
export const cacheMemoryUsage = new Gauge({
  name: 'pothos_cache_memory_usage_bytes',
  help: 'Cache memory usage in bytes',
  registers: [register],
});

// ================================
// Authentication Metrics
// ================================

/**
 * Authentication attempts counter
 * Counts authentication attempts by provider and result
 */
export const authAttemptsTotal = new Counter({
  name: 'pothos_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['provider', 'status'], // provider: google, github; status: success, failure
  registers: [register],
});

/**
 * Active sessions gauge
 * Tracks current number of active user sessions
 */
export const authActiveSessionsTotal = new Gauge({
  name: 'pothos_auth_active_sessions_total',
  help: 'Number of active user sessions',
  registers: [register],
});

/**
 * Session duration histogram
 * Tracks user session durations
 */
export const authSessionDuration = new Histogram({
  name: 'pothos_auth_session_duration_seconds',
  help: 'Duration of user sessions in seconds',
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400],
  registers: [register],
});

// ================================
// API Versioning Metrics
// ================================

/**
 * API version usage counter
 * Counts requests by API version
 */
export const versionUsageTotal = new Counter({
  name: 'pothos_api_version_usage_total',
  help: 'Total number of requests by API version',
  labelNames: ['version'],
  registers: [register],
});

/**
 * Deprecation warnings counter
 * Counts deprecation warnings by field and severity
 */
export const deprecationWarningsTotal = new Counter({
  name: 'pothos_api_deprecation_warnings_total',
  help: 'Total number of deprecation warnings issued',
  labelNames: ['field', 'severity'],
  registers: [register],
});

/**
 * Active clients by version gauge
 * Tracks unique clients per API version
 */
export const activeClientsByVersion = new Gauge({
  name: 'pothos_api_active_clients_by_version',
  help: 'Number of active clients by API version',
  labelNames: ['version'],
  registers: [register],
});

/**
 * Migration recommendations counter
 * Counts migration recommendations issued to clients
 */
export const migrationRecommendationsTotal = new Counter({
  name: 'pothos_api_migration_recommendations_total',
  help: 'Total number of migration recommendations issued',
  labelNames: ['from_version', 'to_version', 'type'],
  registers: [register],
});

// ================================
// Business Logic Metrics
// ================================

/**
 * Todos created counter
 * Counts total todos created
 */
export const todosCreatedTotal = new Counter({
  name: 'pothos_todos_created_total',
  help: 'Total number of todos created',
  labelNames: ['user_id'],
  registers: [register],
});

/**
 * Todos completed counter
 * Counts total todos completed
 */
export const todosCompletedTotal = new Counter({
  name: 'pothos_todos_completed_total',
  help: 'Total number of todos completed',
  labelNames: ['user_id'],
  registers: [register],
});

/**
 * Active users gauge
 * Tracks number of active users in time windows
 */
export const activeUsersTotal = new Gauge({
  name: 'pothos_active_users_total',
  help: 'Number of active users',
  labelNames: ['time_window'], // '1h', '24h', '7d'
  registers: [register],
});

// ================================
// System Health Metrics
// ================================

/**
 * Application uptime gauge
 * Tracks application uptime in seconds
 */
export const applicationUptimeSeconds = new Gauge({
  name: 'pothos_application_uptime_seconds',
  help: 'Application uptime in seconds',
  registers: [register],
});

/**
 * Health check status gauge
 * Tracks health check results
 */
export const healthCheckStatus = new Gauge({
  name: 'pothos_health_check_status',
  help: 'Health check status (1 = healthy, 0 = unhealthy)',
  labelNames: ['check_name'],
  registers: [register],
});

// ================================
// Metric Collection Functions
// ================================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number,
): void {
  const labels = { method, route, status_code: statusCode.toString() };
  
  httpRequestDuration.observe(labels, duration);
  httpRequestsTotal.inc(labels);
}

/**
 * Record GraphQL operation metrics
 */
export function recordGraphqlOperation(
  operationType: string,
  operationName: string,
  status: 'success' | 'error',
  duration: number,
): void {
  const labels = { operation_type: operationType, operation_name: operationName, status };
  
  graphqlOperationDuration.observe(labels, duration);
  graphqlOperationsTotal.inc(labels);
}

/**
 * Record GraphQL error
 */
export function recordGraphqlError(
  errorType: string,
  fieldName: string,
  errorCode?: string,
): void {
  graphqlErrorsTotal.inc({
    error_type: errorType,
    field_name: fieldName,
    error_code: errorCode || 'unknown',
  });
}

/**
 * Record subscription event
 */
export function recordSubscriptionEvent(eventType: string, topic: string): void {
  graphqlSubscriptionEventsTotal.inc({ event_type: eventType, topic });
}

/**
 * Record database query
 */
export function recordDatabaseQuery(
  operation: string,
  model: string,
  status: 'success' | 'error',
  duration: number,
): void {
  const labels = { operation, model, status };
  
  databaseQueryDuration.observe({ operation, model }, duration);
  databaseQueriesTotal.inc(labels);
}

/**
 * Record cache operation
 */
export function recordCacheOperation(
  operation: string,
  status: 'hit' | 'miss' | 'success' | 'error',
  duration: number,
): void {
  cacheOperationsTotal.inc({ operation, status });
  cacheOperationDuration.observe({ operation }, duration);
}

/**
 * Record API version usage
 */
export function recordVersionUsage(version: string): void {
  versionUsageTotal.inc({ version });
}

/**
 * Record deprecation warning
 */
export function recordDeprecationWarning(typeName: string, fieldName: string, severity: string): void {
  deprecationWarningsTotal.inc({ 
    field: `${typeName}.${fieldName}`,
    severity,
  });
}

/**
 * Initialize application start time
 */
const appStartTime = Date.now();

/**
 * Update application uptime metric
 */
export function updateApplicationUptime(): void {
  const uptimeSeconds = (Date.now() - appStartTime) / 1000;
  applicationUptimeSeconds.set(uptimeSeconds);
}

/**
 * Update health check status
 */
export function updateHealthCheckStatus(checkName: string, isHealthy: boolean): void {
  healthCheckStatus.set({ check_name: checkName }, isHealthy ? 1 : 0);
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  try {
    // Update dynamic metrics before returning
    updateApplicationUptime();
    
    return await register.metrics();
  } catch (error) {
    logger.error('Failed to collect metrics', { error });
    throw error;
  }
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.clear();
}

logger.info('Prometheus metrics initialized', {
  metricsCount: register.getMetricsAsArray().length,
});

