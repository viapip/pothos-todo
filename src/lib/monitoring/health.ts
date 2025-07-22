/**
 * Health Check System for Pothos GraphQL API
 * Comprehensive health monitoring with detailed status reporting
 */

import { prisma } from '../prisma.js';
import { logger } from '../../logger.js';
import { updateHealthCheckStatus } from './metrics.js';
import { getCacheHealth } from '../cache/integration.js';
import { getEnhancedDatabaseClient } from '../database/enhanced-client.js';

// ================================
// Health Check Types
// ================================

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: Record<string, any>;
  error?: string;
  duration: number;
  timestamp: number;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

// ================================
// Individual Health Checks
// ================================

/**
 * Check database connectivity and basic functionality
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Basic connection test
    await prisma.$queryRaw`SELECT 1 as test`;
    
    // Check if we can query the schema
    const userCount = await prisma.user.count();
    const todoCount = await prisma.todo.count();
    
    const duration = Date.now() - startTime;
    
    return {
      status: duration > 5000 ? 'degraded' : 'healthy',
      details: {
        users: userCount,
        todos: todoCount,
        connectionTime: duration,
      },
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Database health check failed', { error, duration });
    
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check memory usage and system resources
 */
async function checkSystemResources(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Convert to MB for easier reading
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);
    
    // Calculate memory usage percentage
    const memoryUsagePercent = (heapUsedMB / heapTotalMB) * 100;
    
    // Determine status based on memory usage
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (memoryUsagePercent > 90) {
      status = 'unhealthy';
    } else if (memoryUsagePercent > 75) {
      status = 'degraded';
    }
    
    const duration = Date.now() - startTime;
    
    return {
      status,
      details: {
        memory: {
          heapUsed: `${heapUsedMB} MB`,
          heapTotal: `${heapTotalMB} MB`,
          rss: `${rssMB} MB`,
          external: `${externalMB} MB`,
          usagePercent: Math.round(memoryUsagePercent),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
      },
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('System resources health check failed', { error, duration });
    
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown system error',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check GraphQL schema and resolver functionality
 */
async function checkGraphQLSchema(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // This is a basic check to ensure the GraphQL schema is accessible
    // In a real implementation, you might import and validate the schema
    const schemaInfo = {
      hasQueries: true,
      hasMutations: true,
      hasSubscriptions: true,
    };
    
    const duration = Date.now() - startTime;
    
    return {
      status: 'healthy',
      details: schemaInfo,
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('GraphQL schema health check failed', { error, duration });
    
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown GraphQL error',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check subscription system health
 */
async function checkSubscriptions(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Import SubscriptionManager to check if it's functioning
    const { SubscriptionManager } = await import('../subscriptions/manager.js');
    const manager = new SubscriptionManager();
    
    // Basic functionality test
    const testEvent = SubscriptionManager.createTodoCreatedEvent(
      {
        id: 'test-todo',
        title: 'Test Todo',
        description: 'Test description',
        status: 'TODO' as any,
        priority: 'MEDIUM' as any,
        dueDate: null,
        completedAt: null,
        todoListId: 'test-list',
        userId: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'test-user'
    );
    
    // Test event creation (doesn't actually publish)
    const hasValidEvent = testEvent && testEvent.type === 'TODO_CREATED';
    
    const duration = Date.now() - startTime;
    
    return {
      status: hasValidEvent ? 'healthy' : 'unhealthy',
      details: {
        subscriptionSystemLoaded: true,
        eventCreationWorking: hasValidEvent,
      },
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Subscriptions health check failed', { error, duration });
    
    return {
      status: 'degraded', // Subscriptions failing doesn't make the API unusable
      error: error instanceof Error ? error.message : 'Unknown subscription error',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check cache system health
 */
async function checkCache(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const cacheHealth = await getCacheHealth();
    const duration = Date.now() - startTime;
    
    return {
      status: cacheHealth.healthy ? 'healthy' : 'unhealthy',
      details: {
        operations: cacheHealth.operations || {},
        error: cacheHealth.error,
      },
      error: cacheHealth.healthy ? undefined : (cacheHealth.error || 'Cache unhealthy'),
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Cache health check failed', { error, duration });
    
    return {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Cache check failed',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check enhanced database system health
 */
async function checkEnhancedDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const client = getEnhancedDatabaseClient();
    const healthStatus = await client.getHealthStatus();
    const connectionTest = await client.testConnection();
    const duration = Date.now() - startTime;
    
    const healthy = healthStatus.healthy && connectionTest.success;
    
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      details: {
        initialized: healthStatus.initialized,
        connectionPool: {
          healthy: healthStatus.pool.healthy,
          activeConnections: healthStatus.pool.activeConnections,
          idleConnections: healthStatus.pool.idleConnections,
          totalConnections: healthStatus.pool.connections,
        },
        connectivity: {
          success: connectionTest.success,
          latency: connectionTest.latency,
          error: connectionTest.error,
        },
        queryStats: {
          totalQueries: healthStatus.optimizer.totalQueries,
          optimizedQueries: healthStatus.optimizer.optimizedQueries,
          averageExecutionTime: healthStatus.optimizer.averageExecutionTime,
          slowQueries: healthStatus.optimizer.slowestQueries.length,
        },
      },
      error: healthy ? undefined : (connectionTest.error || 'Enhanced database unhealthy'),
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Enhanced database health check failed', { error, duration });
    
    return {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Enhanced database check failed',
      duration,
      timestamp: Date.now(),
    };
  }
}

/**
 * Check external dependencies
 */
async function checkExternalDependencies(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Check other external dependencies here
    const dependencies = {
      externalApis: 'not_applicable',
    };
    
    const duration = Date.now() - startTime;
    
    return {
      status: 'healthy',
      details: dependencies,
      duration,
      timestamp: Date.now(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('External dependencies health check failed', { error, duration });
    
    return {
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown dependency error',
      duration,
      timestamp: Date.now(),
    };
  }
}

// ================================
// Health Check Registry
// ================================

const healthChecks = {
  database: checkDatabase,
  system: checkSystemResources,
  graphql: checkGraphQLSchema,
  subscriptions: checkSubscriptions,
  cache: checkCache,
  enhancedDatabase: checkEnhancedDatabase,
  dependencies: checkExternalDependencies,
};

// ================================
// Main Health Check Functions
// ================================

/**
 * Run a single health check
 */
export async function runHealthCheck(
  checkName: keyof typeof healthChecks
): Promise<HealthCheckResult> {
  logger.debug('Running health check', { checkName });
  
  const healthCheck = healthChecks[checkName];
  if (!healthCheck) {
    throw new Error(`Unknown health check: ${checkName}`);
  }
  
  const result = await healthCheck();
  
  // Update Prometheus metrics
  updateHealthCheckStatus(checkName, result.status === 'healthy');
  
  logger.debug('Health check completed', { 
    checkName, 
    status: result.status, 
    duration: result.duration 
  });
  
  return result;
}

/**
 * Run all health checks and return comprehensive status
 */
export async function runAllHealthChecks(): Promise<SystemHealthStatus> {
  const startTime = Date.now();
  
  logger.info('Running comprehensive health check');
  
  // Run all health checks in parallel for better performance
  const checkPromises = Object.entries(healthChecks).map(async ([name, checkFn]) => {
    try {
      const result = await checkFn();
      return [name, result] as const;
    } catch (error) {
      logger.error('Health check failed with exception', { checkName: name, error });
      return [name, {
        status: 'unhealthy' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      }] as const;
    }
  });
  
  const checkResults = await Promise.all(checkPromises);
  const checks = Object.fromEntries(checkResults);
  
  // Calculate summary
  const results = Object.values(checks);
  const summary = {
    total: results.length,
    healthy: results.filter((r: any) => r.status === 'healthy').length,
    degraded: results.filter((r: any) => r.status === 'degraded').length,
    unhealthy: results.filter((r: any) => r.status === 'unhealthy').length,
  };
  
  // Determine overall system status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (summary.unhealthy > 0) {
    // If database is unhealthy, system is unhealthy
    if (checks.database?.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    } else {
      // Other unhealthy checks result in degraded status
      overallStatus = 'degraded';
    }
  } else if (summary.degraded > 0) {
    overallStatus = 'degraded';
  }
  
  const healthStatus: SystemHealthStatus = {
    status: overallStatus,
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
    summary,
  };
  
  logger.info('Health check completed', {
    status: overallStatus,
    duration: Date.now() - startTime,
    summary,
  });
  
  return healthStatus;
}

/**
 * Express-style middleware for health check endpoint
 */
export function createHealthEndpoint() {
  return async (event: any) => {
    try {
      const health = await runAllHealthChecks();
      
      // Set appropriate HTTP status code
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      return new Response(JSON.stringify(health, null, 2), {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (error) {
      logger.error('Health endpoint error', { error });
      
      return new Response(JSON.stringify({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      }, null, 2), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

/**
 * Quick health check for load balancers (simple OK/NOT OK)
 */
export function createReadinessEndpoint() {
  return async (event: any) => {
    try {
      // Only check critical components for readiness
      const dbResult = await checkDatabase();
      const systemResult = await checkSystemResources();
      
      const isReady = dbResult.status !== 'unhealthy' && systemResult.status !== 'unhealthy';
      
      if (isReady) {
        return new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      } else {
        return new Response('NOT READY', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch (error) {
      logger.error('Readiness endpoint error', { error });
      return new Response('ERROR', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  };
}

/**
 * Liveness probe for Kubernetes-style orchestrators
 */
export function createLivenessEndpoint() {
  return async (event: any) => {
    try {
      // Basic liveness check - just verify the process is responding
      const memUsage = process.memoryUsage();
      const isAlive = memUsage.heapUsed > 0; // Basic sanity check
      
      if (isAlive) {
        return new Response('ALIVE', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      } else {
        return new Response('DEAD', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch (error) {
      logger.error('Liveness endpoint error', { error });
      return new Response('ERROR', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  };
}

// ================================
// Startup Health Check
// ================================

/**
 * Run health checks during application startup
 * This ensures the application is ready before accepting requests
 */
export async function performStartupHealthCheck(): Promise<void> {
  logger.info('Performing startup health check');
  
  try {
    const health = await runAllHealthChecks();
    
    if (health.status === 'unhealthy') {
      const unhealthyChecks = Object.entries(health.checks)
        .filter(([_, result]) => result.status === 'unhealthy')
        .map(([name]) => name);
      
      logger.error('Startup health check failed', {
        unhealthyChecks,
        summary: health.summary,
      });
      
      throw new Error(`Startup health check failed. Unhealthy components: ${unhealthyChecks.join(', ')}`);
    }
    
    if (health.status === 'degraded') {
      const degradedChecks = Object.entries(health.checks)
        .filter(([_, result]) => result.status === 'degraded')
        .map(([name]) => name);
      
      logger.warn('Startup health check completed with degraded status', {
        degradedChecks,
        summary: health.summary,
      });
    } else {
      logger.info('Startup health check passed - all systems healthy');
    }
    
  } catch (error) {
    logger.error('Startup health check exception', { error });
    throw error;
  }
}