/**
 * Database Management Endpoints
 * HTTP endpoints for database monitoring, statistics, and administration
 */

import { getEnhancedDatabaseClient } from './enhanced-client.js';
import { logger } from '../../logger.js';
import { readBody } from 'h3';
import type { H3Event } from 'h3';

// ================================
// Database Statistics Endpoint
// ================================

export function createDatabaseStatsEndpoint() {
  return async () => {
    try {
      const client = getEnhancedDatabaseClient();
      
      const [healthStatus, connectionStats, queryStats] = await Promise.all([
        client.getHealthStatus(),
        Promise.resolve(client.getConnectionStats()),
        Promise.resolve(client.getQueryStats()),
      ]);

      const stats = {
        health: healthStatus,
        connections: connectionStats,
        queries: queryStats,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(stats, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get database statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Database Health Endpoint
// ================================

export function createDatabaseHealthEndpoint() {
  return async () => {
    try {
      const client = getEnhancedDatabaseClient();
      
      const [healthStatus, connectionTest] = await Promise.all([
        client.getHealthStatus(),
        client.testConnection(),
      ]);

      const health = {
        healthy: healthStatus.healthy && connectionTest.success,
        status: healthStatus.healthy ? 'healthy' : 'unhealthy',
        details: {
          initialized: healthStatus.initialized,
          connections: {
            healthy: healthStatus.pool.healthy,
            active: healthStatus.pool.activeConnections,
            idle: healthStatus.pool.idleConnections,
            total: healthStatus.pool.connections,
          },
          connectivity: {
            success: connectionTest.success,
            latency: connectionTest.latency,
            error: connectionTest.error,
          },
          queries: {
            total: healthStatus.optimizer.totalQueries,
            optimized: healthStatus.optimizer.optimizedQueries,
            slow: healthStatus.optimizer.slowestQueries.length,
            averageTime: healthStatus.optimizer.averageExecutionTime,
          },
        },
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(health, null, 2), {
        status: health.healthy ? 200 : 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Database health check failed', { error });
      
      return new Response(JSON.stringify({
        healthy: false,
        status: 'error',
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Query Analysis Endpoint
// ================================

export function createQueryAnalysisEndpoint() {
  return async (event: H3Event) => {
    try {
      const client = getEnhancedDatabaseClient();
      
      if (event.node.req.method === 'POST') {
        const body = await readBody(event).catch(() => ({}));
        const query = body.query;
        
        if (!query || typeof query !== 'string') {
          return new Response(JSON.stringify({
            error: 'Missing or invalid query parameter',
            usage: 'POST with JSON body containing "query" field',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const analysis = client.analyzeQuery(query);
        
        // If query analysis is requested, also get the execution plan
        let queryPlan = null;
        try {
          queryPlan = await client.explainQuery(query);
        } catch (error) {
          logger.warn('Failed to get query execution plan', { error });
        }

        return new Response(JSON.stringify({
          query,
          analysis,
          queryPlan,
          timestamp: new Date().toISOString(),
        }, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else if (event.node.req.method === 'GET') {
        // Return cached query analyses
        const cachedAnalyses = client.getQueryAnalysisCache();
        
        return new Response(JSON.stringify({
          cachedAnalyses: cachedAnalyses.slice(0, 20), // Limit to recent 20
          count: cachedAnalyses.length,
          timestamp: new Date().toISOString(),
        }, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else {
        return new Response(JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['GET', 'POST'],
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'GET, POST',
          },
        });
      }
    } catch (error) {
      logger.error('Query analysis endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Query analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Prepared Statements Endpoint
// ================================

export function createPreparedStatementsEndpoint() {
  return async () => {
    try {
      const client = getEnhancedDatabaseClient();
      const preparedStatements = client.getPreparedStatements();

      const stats = {
        totalStatements: preparedStatements.length,
        statements: preparedStatements.map(stmt => ({
          id: stmt.id,
          query: stmt.query.slice(0, 100) + (stmt.query.length > 100 ? '...' : ''),
          usageCount: stmt.usageCount,
          averageExecutionTime: stmt.averageExecutionTime,
          lastUsed: new Date(stmt.lastUsed).toISOString(),
          parameters: stmt.parameters,
        })),
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(stats, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get prepared statements', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get prepared statements',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Slow Queries Endpoint
// ================================

export function createSlowQueriesEndpoint() {
  return async () => {
    try {
      const client = getEnhancedDatabaseClient();
      const queryStats = client.getQueryStats();

      const slowQueries = {
        threshold: 1000, // ms
        totalSlowQueries: queryStats.slowestQueries.length,
        queries: queryStats.slowestQueries.map(query => ({
          query: query.query.slice(0, 200) + (query.query.length > 200 ? '...' : ''),
          duration: query.duration,
          timestamp: new Date(query.timestamp).toISOString(),
        })),
        recommendations: [
          'Consider adding indexes for frequently queried columns',
          'Use LIMIT clauses to prevent unbounded result sets',
          'Break complex queries into smaller operations',
          'Use prepared statements for repeated queries',
          'Consider query result caching for expensive operations',
        ],
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(slowQueries, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get slow queries', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get slow queries',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Database Maintenance Endpoint
// ================================

export function createDatabaseMaintenanceEndpoint() {
  return async (event: H3Event) => {
    try {
      if (event.node.req.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['POST'],
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'POST',
          },
        });
      }

      const body = await readBody(event).catch(() => ({}));
      const action = body.action;

      const client = getEnhancedDatabaseClient();

      switch (action) {
        case 'cleanup':
          client.cleanup();
          
          return new Response(JSON.stringify({
            action: 'cleanup',
            status: 'completed',
            message: 'Database cache cleanup completed',
            timestamp: new Date().toISOString(),
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        case 'connection_test': {
          const testResult = await client.testConnection();
          
          return new Response(JSON.stringify({
            action: 'connection_test',
            result: testResult,
            timestamp: new Date().toISOString(),
          }), {
            status: testResult.success ? 200 : 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        default:
          return new Response(JSON.stringify({
            error: 'Invalid action',
            supportedActions: ['cleanup', 'connection_test'],
            usage: 'POST with JSON body containing "action" field',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
      }
    } catch (error) {
      logger.error('Database maintenance endpoint error', { error });
      
      return new Response(JSON.stringify({
        error: 'Maintenance operation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

// ================================
// Database Configuration Endpoint
// ================================

export function createDatabaseConfigEndpoint() {
  return async () => {
    try {
      const client = getEnhancedDatabaseClient();
      const config = client.getConfig();
      
      // Remove sensitive information
      const safeConfig = {
        ...config,
        url: config.url ? '[REDACTED]' : undefined,
        // Keep non-sensitive configuration
        maxConnections: 10, // This would come from pool config
        minConnections: 2,
        connectionTimeout: 10000,
      };

      return new Response(JSON.stringify({
        database: safeConfig,
        features: {
          connectionPooling: true,
          queryOptimization: true,
          preparedStatements: true,
          queryAnalysis: true,
          performanceMonitoring: true,
        },
        timestamp: new Date().toISOString(),
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get database config', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get database configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  };
}