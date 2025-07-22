/**
 * Performance monitoring and optimization utilities
 */

import { performance } from 'node:perf_hooks';
import type { H3Event } from 'h3';
import { type AppResult, Ok, Err, Errors } from '../result/index.js';

/**
 * Performance metrics collector
 */
export interface PerformanceMetrics {
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  eventLoopDelay?: number;
  timestamp: number;
}

export interface RequestMetrics extends PerformanceMetrics {
  method: string;
  url: string;
  statusCode?: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Memory usage tracking
 */
export class MemoryMonitor {
  private static measurements: NodeJS.MemoryUsage[] = [];
  private static maxMeasurements = 100;

  static getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  static track(): void {
    const usage = MemoryMonitor.getCurrentUsage();
    MemoryMonitor.measurements.push(usage);
    
    if (MemoryMonitor.measurements.length > MemoryMonitor.maxMeasurements) {
      MemoryMonitor.measurements.shift();
    }
  }

  static getAverageUsage(): NodeJS.MemoryUsage | null {
    if (MemoryMonitor.measurements.length === 0) return null;

    const totals = MemoryMonitor.measurements.reduce(
      (acc, curr) => ({
        rss: acc.rss + curr.rss,
        heapTotal: acc.heapTotal + curr.heapTotal,
        heapUsed: acc.heapUsed + curr.heapUsed,
        external: acc.external + curr.external,
        arrayBuffers: acc.arrayBuffers + curr.arrayBuffers,
      }),
      { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }
    );

    const count = MemoryMonitor.measurements.length;
    return {
      rss: Math.round(totals.rss / count),
      heapTotal: Math.round(totals.heapTotal / count),
      heapUsed: Math.round(totals.heapUsed / count),
      external: Math.round(totals.external / count),
      arrayBuffers: Math.round(totals.arrayBuffers / count),
    };
  }

  static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static getFormattedUsage(): Record<string, string> {
    const usage = MemoryMonitor.getCurrentUsage();
    return {
      rss: MemoryMonitor.formatBytes(usage.rss),
      heapTotal: MemoryMonitor.formatBytes(usage.heapTotal),
      heapUsed: MemoryMonitor.formatBytes(usage.heapUsed),
      external: MemoryMonitor.formatBytes(usage.external),
      arrayBuffers: MemoryMonitor.formatBytes(usage.arrayBuffers),
    };
  }
}

/**
 * Event loop delay monitoring
 */
export class EventLoopMonitor {
  private static intervalId: NodeJS.Timeout | null = null;
  private static measurements: number[] = [];
  private static maxMeasurements = 50;

  static start(): void {
    if (EventLoopMonitor.intervalId) return;

    EventLoopMonitor.intervalId = setInterval(() => {
      const start = performance.now();
      setImmediate(() => {
        const delay = performance.now() - start;
        EventLoopMonitor.measurements.push(delay);
        
        if (EventLoopMonitor.measurements.length > EventLoopMonitor.maxMeasurements) {
          EventLoopMonitor.measurements.shift();
        }
      });
    }, 1000);
  }

  static stop(): void {
    if (EventLoopMonitor.intervalId) {
      clearInterval(EventLoopMonitor.intervalId);
      EventLoopMonitor.intervalId = null;
    }
  }

  static getAverageDelay(): number {
    if (EventLoopMonitor.measurements.length === 0) return 0;
    
    const sum = EventLoopMonitor.measurements.reduce((a, b) => a + b, 0);
    return sum / EventLoopMonitor.measurements.length;
  }

  static getMaxDelay(): number {
    return EventLoopMonitor.measurements.length > 0 ? Math.max(...EventLoopMonitor.measurements) : 0;
  }
}

/**
 * Request performance tracker
 */
export class RequestTracker {
  private startTime: number;
  private startCpuUsage: NodeJS.CpuUsage;
  private event: H3Event;

  constructor(event: H3Event) {
    this.event = event;
    this.startTime = performance.now();
    this.startCpuUsage = process.cpuUsage();
  }

  finish(statusCode?: number): RequestMetrics {
    const duration = performance.now() - this.startTime;
    const cpuUsage = process.cpuUsage(this.startCpuUsage);
    
    return {
      method: this.event.method || 'UNKNOWN',
      url: this.event.path || this.event.node.req.url || '/',
      statusCode,
      userAgent: this.event.node.req.headers['user-agent'],
      ip: this.getClientIP(),
      duration,
      memoryUsage: process.memoryUsage(),
      cpuUsage,
      eventLoopDelay: EventLoopMonitor.getAverageDelay(),
      timestamp: Date.now(),
    };
  }

  private getClientIP(): string | undefined {
    const forwarded = this.event.node.req.headers['x-forwarded-for'] as string;
    const realIp = this.event.node.req.headers['x-real-ip'] as string;
    const remoteAddress = this.event.node.req.socket?.remoteAddress;
    
    if (forwarded) return forwarded.split(',')[0]?.trim();
    return realIp || remoteAddress;
  }
}

/**
 * Performance metrics aggregator
 */
export class PerformanceAggregator {
  private static metrics: RequestMetrics[] = [];
  private static maxMetrics = 1000;

  static addMetrics(metrics: RequestMetrics): void {
    PerformanceAggregator.metrics.push(metrics);
    
    if (PerformanceAggregator.metrics.length > PerformanceAggregator.maxMetrics) {
      PerformanceAggregator.metrics.shift();
    }
  }

  static getStats(timeWindowMs: number = 300000): {
    totalRequests: number;
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
    errorRate: number;
    requestsPerSecond: number;
    slowestRequests: RequestMetrics[];
  } {
    const now = Date.now();
    const windowStart = now - timeWindowMs;
    
    const recentMetrics = PerformanceAggregator.metrics.filter(m => m.timestamp >= windowStart);
    
    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        requestsPerSecond: 0,
        slowestRequests: [],
      };
    }

    // Sort by duration for percentile calculations
    const sortedByDuration = [...recentMetrics].sort((a, b) => a.duration - b.duration);
    
    const totalRequests = recentMetrics.length;
    const averageDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests;
    
    const p95Index = Math.floor(totalRequests * 0.95);
    const p99Index = Math.floor(totalRequests * 0.99);
    const p95Duration = sortedByDuration[p95Index]?.duration || 0;
    const p99Duration = sortedByDuration[p99Index]?.duration || 0;
    
    const errorCount = recentMetrics.filter(m => m.statusCode && m.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;
    
    const timeWindowSeconds = timeWindowMs / 1000;
    const requestsPerSecond = totalRequests / timeWindowSeconds;
    
    const slowestRequests = [...recentMetrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalRequests,
      averageDuration,
      p95Duration,
      p99Duration,
      errorRate,
      requestsPerSecond,
      slowestRequests,
    };
  }

  static getMethodStats(timeWindowMs: number = 300000): Record<string, any> {
    const now = Date.now();
    const windowStart = now - timeWindowMs;
    
    const recentMetrics = PerformanceAggregator.metrics.filter(m => m.timestamp >= windowStart);
    const methodGroups = new Map<string, RequestMetrics[]>();
    
    for (const metric of recentMetrics) {
      const method = metric.method;
      if (!methodGroups.has(method)) {
        methodGroups.set(method, []);
      }
      methodGroups.get(method)!.push(metric);
    }
    
    const methodStats: Record<string, any> = {};
    
    for (const [method, metrics] of methodGroups) {
      const count = metrics.length;
      const averageDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / count;
      const errorCount = metrics.filter(m => m.statusCode && m.statusCode >= 400).length;
      const errorRate = errorCount / count;
      
      methodStats[method] = {
        count,
        averageDuration: Math.round(averageDuration * 100) / 100,
        errorRate: Math.round(errorRate * 1000) / 1000,
      };
    }
    
    return methodStats;
  }
}

/**
 * Health check system
 */
export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export class HealthCheckManager {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private lastResults: Map<string, HealthCheck> = new Map();

  register(name: string, check: () => Promise<HealthCheck>): void {
    this.checks.set(name, check);
  }

  unregister(name: string): void {
    this.checks.delete(name);
    this.lastResults.delete(name);
  }

  async runAll(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];
    
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      try {
        const result = await Promise.race([
          check(),
          new Promise<HealthCheck>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        this.lastResults.set(name, result);
        return result;
      } catch (error) {
        const errorResult: HealthCheck = {
          name,
          status: 'unhealthy',
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };
        this.lastResults.set(name, errorResult);
        return errorResult;
      }
    });

    const settled = await Promise.allSettled(checkPromises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    return results;
  }

  getLastResults(): HealthCheck[] {
    return Array.from(this.lastResults.values());
  }

  isHealthy(): boolean {
    const results = this.getLastResults();
    return results.length > 0 && results.every(r => r.status === 'healthy');
  }
}

/**
 * Database health check
 */
export async function createDatabaseHealthCheck(): Promise<HealthCheck> {
  const start = performance.now();
  
  try {
    // This would normally use your actual database client
    // For now, we'll simulate it
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    
    const latency = performance.now() - start;
    
    return {
      name: 'database',
      status: latency > 1000 ? 'degraded' : 'healthy',
      latency: Math.round(latency),
      timestamp: Date.now(),
      metadata: {
        query: 'SELECT 1',
      },
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

/**
 * Redis health check
 */
export async function createRedisHealthCheck(): Promise<HealthCheck> {
  const start = performance.now();
  
  try {
    // This would use your actual Redis client
    const { Redis } = await import('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    
    await redis.ping();
    await redis.quit();
    
    const latency = performance.now() - start;
    
    return {
      name: 'redis',
      status: latency > 500 ? 'degraded' : 'healthy',
      latency: Math.round(latency),
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

/**
 * Initialize performance monitoring
 */
export function initializePerformanceMonitoring(): void {
  // Start event loop monitoring
  EventLoopMonitor.start();
  
  // Track memory usage every 30 seconds
  setInterval(() => {
    MemoryMonitor.track();
  }, 30000);
  
  // Clean up old metrics every 10 minutes
  setInterval(() => {
    // This would be implemented to clean up old metrics
  }, 600000);
}

/**
 * Cleanup performance monitoring
 */
export function cleanupPerformanceMonitoring(): void {
  EventLoopMonitor.stop();
}