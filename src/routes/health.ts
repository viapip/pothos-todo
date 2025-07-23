import type { H3Event } from 'h3';
import { logger } from '@/logger';
import prisma from '@/lib/prisma';
import { CacheManager } from '@/infrastructure/cache/CacheManager';
import { Container } from '@/infrastructure/container/Container';
import { env } from '@/config/env.validation';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
      metadata?: Record<string, any>;
    };
  };
}

/**
 * Basic health check - returns 200 if service is responding
 */
export async function handleHealthCheck(event: H3Event): Promise<Response> {
  return new Response('OK', { 
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  });
}

/**
 * Liveness probe - checks if the service is alive and able to handle requests
 */
export async function handleLivenessProbe(event: H3Event): Promise<Response> {
  const start = Date.now();
  
  try {
    // Basic liveness check - can we respond to requests?
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: env.TELEMETRY_SERVICE_NAME,
      version: env.TELEMETRY_SERVICE_VERSION,
      checks: {
        service: {
          status: 'pass',
          responseTime: Date.now() - start,
        },
      },
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('Liveness probe failed', { error });
    
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: env.TELEMETRY_SERVICE_NAME,
      version: env.TELEMETRY_SERVICE_VERSION,
      checks: {
        service: {
          status: 'fail',
          message: 'Service is not responding',
        },
      },
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}

/**
 * Readiness probe - checks if the service is ready to accept traffic
 */
export async function handleReadinessProbe(event: H3Event): Promise<Response> {
  const start = Date.now();
  const checks: HealthCheckResult['checks'] = {};
  let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'pass',
      responseTime: Date.now() - dbStart,
    };
  } catch (error) {
    logger.error('Database health check failed', { error });
    checks.database = {
      status: 'fail',
      message: 'Cannot connect to database',
    };
    overallStatus = 'unhealthy';
  }

  // Check cache connectivity (if enabled)
  if (env.CACHE_ENABLED) {
    try {
      const cacheStart = Date.now();
      const cacheManager = CacheManager.getInstance();
      const testKey = '__health_check__';
      await cacheManager.set(testKey, 'ok', { ttl: 10 });
      const value = await cacheManager.get(testKey);
      
      if (value === 'ok') {
        checks.cache = {
          status: 'pass',
          responseTime: Date.now() - cacheStart,
        };
      } else {
        checks.cache = {
          status: 'warn',
          message: 'Cache is responding but may have issues',
        };
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    } catch (error) {
      logger.warn('Cache health check failed', { error });
      checks.cache = {
        status: 'warn',
        message: 'Cache is unavailable',
      };
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }
  }

  // Check AI services (if enabled)
  if (env.AI_ENABLED) {
    try {
      const container = Container.getInstance();
      const aiStart = Date.now();
      
      // Check vector store connectivity
      if (container.vectorStore) {
        const collections = await container.vectorStore.getCollections();
        checks.vectorStore = {
          status: 'pass',
          responseTime: Date.now() - aiStart,
          metadata: {
            collections: collections.length,
          },
        };
      }
      
      // Check if AI services are initialized
      if (env.OPENAI_API_KEY) {
        checks.aiServices = {
          status: 'pass',
          message: 'AI services initialized',
        };
      } else {
        checks.aiServices = {
          status: 'warn',
          message: 'AI services not configured',
        };
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    } catch (error) {
      logger.warn('AI services health check failed', { error });
      checks.aiServices = {
        status: 'warn',
        message: 'AI services unavailable',
      };
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  if (heapUsedPercent > 90) {
    checks.memory = {
      status: 'fail',
      message: 'Memory usage critical',
      metadata: {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    };
    overallStatus = 'unhealthy';
  } else if (heapUsedPercent > 75) {
    checks.memory = {
      status: 'warn',
      message: 'Memory usage high',
      metadata: {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    };
    if (overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
  } else {
    checks.memory = {
      status: 'pass',
      metadata: {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    };
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: env.TELEMETRY_SERVICE_NAME,
    version: env.TELEMETRY_SERVICE_VERSION,
    checks,
  };

  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return new Response(JSON.stringify(result, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * Detailed health check with all subsystem checks
 */
export async function handleDetailedHealthCheck(event: H3Event): Promise<Response> {
  // For now, use the same implementation as readiness probe
  // In the future, this could include more detailed checks
  return handleReadinessProbe(event);
}