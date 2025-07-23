import type { H3Event } from 'h3';
import { MetricsCollector } from '@/infrastructure/monitoring/MetricsCollector.js';
import { logger } from '@/logger.js';

/**
 * Get system metrics in JSON format
 */
export async function handleMetrics(event: H3Event): Promise<Response> {
  try {
    const collector = MetricsCollector.getInstance();
    const metrics = await collector.getSystemMetrics();
    
    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Failed to collect metrics', { error });
    
    return new Response(JSON.stringify({
      error: 'Failed to collect metrics',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Get specific metrics for a time range
 */
export async function handleMetricsHistory(event: H3Event): Promise<Response> {
  try {
    const url = new URL(event.node.req.url!, `http://${event.node.req.headers.host}`);
    const params = url.searchParams;
    
    const startTime = parseInt(params.get('start') || '0');
    const endTime = parseInt(params.get('end') || Date.now().toString());
    const metricName = params.get('metric') || undefined;
    
    if (startTime && endTime && startTime > endTime) {
      return new Response(JSON.stringify({
        error: 'Invalid time range',
        message: 'Start time must be before end time',
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const collector = MetricsCollector.getInstance();
    const metrics = collector.getMetrics(startTime, endTime, metricName);
    
    return new Response(JSON.stringify({
      metrics,
      count: metrics.length,
      timeRange: {
        start: startTime,
        end: endTime,
      },
      metricName,
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Failed to get metrics history', { error });
    
    return new Response(JSON.stringify({
      error: 'Failed to get metrics history',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function handlePrometheusMetrics(event: H3Event): Promise<Response> {
  try {
    const collector = MetricsCollector.getInstance();
    const metrics = await collector.getSystemMetrics();
    
    // Convert metrics to Prometheus format
    const prometheusMetrics = [
      // System metrics
      `# HELP system_cpu_usage CPU usage percentage`,
      `# TYPE system_cpu_usage gauge`,
      `system_cpu_usage ${metrics.cpu.usage}`,
      
      `# HELP system_memory_usage Memory usage percentage`,
      `# TYPE system_memory_usage gauge`,
      `system_memory_usage ${metrics.memory.percentage}`,
      
      `# HELP system_memory_heap_used Heap memory used in bytes`,
      `# TYPE system_memory_heap_used gauge`,
      `system_memory_heap_used ${metrics.memory.heap.used}`,
      
      // Database metrics
      `# HELP database_connections_active Active database connections`,
      `# TYPE database_connections_active gauge`,
      `database_connections_active ${metrics.database.connectionCount}`,
      
      `# HELP database_queries_total Total database queries`,
      `# TYPE database_queries_total counter`,
      `database_queries_total ${metrics.database.queryCount}`,
      
      `# HELP database_errors_total Total database errors`,
      `# TYPE database_errors_total counter`,
      `database_errors_total ${metrics.database.errorCount}`,
      
      `# HELP database_pool_utilization Database connection pool utilization percentage`,
      `# TYPE database_pool_utilization gauge`,
      `database_pool_utilization ${metrics.database.poolUtilization}`,
      
      `# HELP database_query_duration_avg Average query duration in milliseconds`,
      `# TYPE database_query_duration_avg gauge`,
      `database_query_duration_avg ${metrics.database.avgQueryTime}`,
      
      // GraphQL metrics
      `# HELP graphql_requests_total Total GraphQL requests`,
      `# TYPE graphql_requests_total counter`,
      `graphql_requests_total ${metrics.graphql.requestCount}`,
      
      `# HELP graphql_errors_total Total GraphQL errors`,
      `# TYPE graphql_errors_total counter`,
      `graphql_errors_total ${metrics.graphql.errorCount}`,
      
      `# HELP graphql_response_duration_avg Average GraphQL response time in milliseconds`,
      `# TYPE graphql_response_duration_avg gauge`,
      `graphql_response_duration_avg ${metrics.graphql.avgResponseTime}`,
      
      `# HELP graphql_complexity_avg Average GraphQL query complexity`,
      `# TYPE graphql_complexity_avg gauge`,
      `graphql_complexity_avg ${metrics.graphql.complexityAvg}`,
      
      // HTTP metrics
      `# HELP http_requests_total Total HTTP requests`,
      `# TYPE http_requests_total counter`,
      `http_requests_total ${metrics.http.requestCount}`,
      
      `# HELP http_response_duration_p50 HTTP response time 50th percentile in milliseconds`,
      `# TYPE http_response_duration_p50 gauge`,
      `http_response_duration_p50 ${metrics.http.responseTime.p50}`,
      
      `# HELP http_response_duration_p95 HTTP response time 95th percentile in milliseconds`,
      `# TYPE http_response_duration_p95 gauge`,
      `http_response_duration_p95 ${metrics.http.responseTime.p95}`,
      
      `# HELP http_response_duration_p99 HTTP response time 99th percentile in milliseconds`,
      `# TYPE http_response_duration_p99 gauge`,
      `http_response_duration_p99 ${metrics.http.responseTime.p99}`,
    ];
    
    // Add HTTP status code metrics
    for (const [status, count] of Object.entries(metrics.http.statusCodes)) {
      prometheusMetrics.push(
        `# HELP http_responses_total Total HTTP responses by status code`,
        `# TYPE http_responses_total counter`,
        `http_responses_total{status="${status.replace('status_', '')}"} ${count}`
      );
    }
    
    // Add cache metrics if available
    if (metrics.cache) {
      prometheusMetrics.push(
        `# HELP cache_hit_rate Cache hit rate percentage`,
        `# TYPE cache_hit_rate gauge`,
        `cache_hit_rate ${metrics.cache.hitRate}`,
        
        `# HELP cache_miss_rate Cache miss rate percentage`,
        `# TYPE cache_miss_rate gauge`,
        `cache_miss_rate ${metrics.cache.missRate}`,
        
        `# HELP cache_size Cache size`,
        `# TYPE cache_size gauge`,
        `cache_size ${metrics.cache.size}`,
        
        `# HELP cache_connections Cache connections`,
        `# TYPE cache_connections gauge`,
        `cache_connections ${metrics.cache.connections}`
      );
    }
    
    return new Response(prometheusMetrics.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Failed to generate Prometheus metrics', { error });
    
    return new Response('# Failed to generate metrics\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}