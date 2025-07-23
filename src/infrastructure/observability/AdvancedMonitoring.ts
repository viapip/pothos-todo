/**
 * Advanced Monitoring and Observability System
 * Comprehensive monitoring with OpenTelemetry, custom metrics, and alerting
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { z } from 'zod';

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
  unit?: string;
}

export interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  duration: number;
  tags: Record<string, any>;
  logs: Array<{ timestamp: Date; message: string; level: string }>;
}

/**
 * Advanced monitoring system with metrics, tracing, and alerting
 */
export class AdvancedMonitoringSystem {
  private metrics: Map<string, MetricPoint[]> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private traces: Map<string, TraceSpan[]> = new Map();
  private retentionPeriod = 24 * 60 * 60 * 1000; // 24 hours
  private alertCallbacks: Map<string, (alert: Alert, metric: MetricPoint) => void> = new Map();

  constructor() {
    this.setupValidationSchemas();
    this.startCleanupProcess();
    this.registerDefaultHealthChecks();
    this.registerDefaultAlerts();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const metricSchema = z.object({
      name: z.string().min(1),
      value: z.number(),
      timestamp: z.date().optional(),
      tags: z.record(z.string()).default({}),
      unit: z.string().optional(),
    });

    const alertSchema = z.object({
      name: z.string().min(1),
      condition: z.enum(['>', '<', '>=', '<=', '==']),
      threshold: z.number(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      enabled: z.boolean().default(true),
    });

    validationService.registerSchema('metric', metricSchema);
    validationService.registerSchema('alert', alertSchema);
  }

  /**
   * Record a metric point
   */
  recordMetric(metric: Omit<MetricPoint, 'timestamp'> & { timestamp?: Date }): void {
    const metricPoint: MetricPoint = {
      ...metric,
      timestamp: metric.timestamp || new Date(),
    };

    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const points = this.metrics.get(metric.name)!;
    points.push(metricPoint);

    // Keep only recent points
    const cutoff = Date.now() - this.retentionPeriod;
    this.metrics.set(
      metric.name,
      points.filter(p => p.timestamp.getTime() > cutoff)
    );

    // Check alerts
    this.checkAlerts(metricPoint);

    logger.debug('Metric recorded', {
      name: metric.name,
      value: metric.value,
      tags: metric.tags,
    });
  }

  /**
   * Get metrics by name with optional filtering
   */
  getMetrics(
    name: string, 
    options: {
      since?: Date;
      tags?: Record<string, string>;
      limit?: number;
    } = {}
  ): MetricPoint[] {
    const points = this.metrics.get(name) || [];
    let filtered = points;

    if (options.since) {
      filtered = filtered.filter(p => p.timestamp >= options.since!);
    }

    if (options.tags) {
      filtered = filtered.filter(p => {
        return Object.entries(options.tags!).every(([key, value]) => 
          p.tags[key] === value
        );
      });
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(
    name: string,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count',
    options: {
      since?: Date;
      groupBy?: string;
      interval?: number; // milliseconds
    } = {}
  ): Array<{ timestamp: Date; value: number; tags?: Record<string, string> }> {
    const points = this.getMetrics(name, { since: options.since });
    
    if (points.length === 0) return [];

    // Group by interval if specified
    if (options.interval) {
      const groups = new Map<number, MetricPoint[]>();
      
      points.forEach(point => {
        const bucket = Math.floor(point.timestamp.getTime() / options.interval!) * options.interval!;
        if (!groups.has(bucket)) {
          groups.set(bucket, []);
        }
        groups.get(bucket)!.push(point);
      });

      return Array.from(groups.entries()).map(([bucket, groupPoints]) => {
        const values = groupPoints.map(p => p.value);
        let aggregatedValue: number;

        switch (aggregation) {
          case 'sum':
            aggregatedValue = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'min':
            aggregatedValue = Math.min(...values);
            break;
          case 'max':
            aggregatedValue = Math.max(...values);
            break;
          case 'count':
            aggregatedValue = values.length;
            break;
        }

        return {
          timestamp: new Date(bucket),
          value: aggregatedValue,
        };
      });
    }

    // Simple aggregation without grouping
    const values = points.map(p => p.value);
    let value: number;

    switch (aggregation) {
      case 'sum':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'count':
        value = values.length;
        break;
    }

    return [{
      timestamp: new Date(),
      value,
    }];
  }

  /**
   * Register an alert
   */
  registerAlert(alert: Omit<Alert, 'id' | 'lastTriggered' | 'triggerCount'>): string {
    const alertId = stringUtils.random(8);
    
    this.alerts.set(alertId, {
      id: alertId,
      lastTriggered: undefined,
      triggerCount: 0,
      ...alert,
    });

    logger.info('Alert registered', { alertId, name: alert.name });
    return alertId;
  }

  /**
   * Register alert callback
   */
  onAlert(alertId: string, callback: (alert: Alert, metric: MetricPoint) => void): void {
    this.alertCallbacks.set(alertId, callback);
  }

  /**
   * Check alerts against a metric
   */
  private checkAlerts(metric: MetricPoint): void {
    for (const alert of this.alerts.values()) {
      if (!alert.enabled) continue;

      const shouldTrigger = this.evaluateAlertCondition(alert, metric);
      
      if (shouldTrigger) {
        alert.lastTriggered = new Date();
        alert.triggerCount++;

        logger.warn('Alert triggered', {
          alertId: alert.id,
          alertName: alert.name,
          metricName: metric.name,
          metricValue: metric.value,
          threshold: alert.threshold,
          severity: alert.severity,
        });

        // Execute callback if registered
        const callback = this.alertCallbacks.get(alert.id);
        if (callback) {
          try {
            callback(alert, metric);
          } catch (error) {
            logger.error('Alert callback error', { alertId: alert.id, error });
          }
        }

        // Send alert notification
        this.sendAlertNotification(alert, metric);
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateAlertCondition(alert: Alert, metric: MetricPoint): boolean {
    switch (alert.condition) {
      case '>':
        return metric.value > alert.threshold;
      case '<':
        return metric.value < alert.threshold;
      case '>=':
        return metric.value >= alert.threshold;
      case '<=':
        return metric.value <= alert.threshold;
      case '==':
        return metric.value === alert.threshold;
      default:
        return false;
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlertNotification(alert: Alert, metric: MetricPoint): Promise<void> {
    try {
      // In a real implementation, this would send to Slack, email, PagerDuty, etc.
      const notification = {
        alert: {
          id: alert.id,
          name: alert.name,
          severity: alert.severity,
          threshold: alert.threshold,
        },
        metric: {
          name: metric.name,
          value: metric.value,
          timestamp: metric.timestamp,
        },
        timestamp: new Date(),
      };

      // Mock notification endpoint
      await httpClient.post('/notifications/alerts', notification, {
        skipCache: true,
      });

      logger.debug('Alert notification sent', { alertId: alert.id });

    } catch (error) {
      logger.error('Failed to send alert notification', { alertId: alert.id, error });
    }
  }

  /**
   * Register a health check
   */
  registerHealthCheck(
    name: string,
    checkFunction: () => Promise<Omit<HealthCheck, 'name' | 'timestamp'>>
  ): void {
    const executeCheck = async () => {
      const start = Date.now();
      
      try {
        const result = await checkFunction();
        const healthCheck: HealthCheck = {
          name,
          timestamp: new Date(),
          duration: Date.now() - start,
          ...result,
        };

        this.healthChecks.set(name, healthCheck);
        
        // Record as metric
        this.recordMetric({
          name: `health_check.${name}`,
          value: healthCheck.status === 'healthy' ? 1 : 0,
          tags: { 
            status: healthCheck.status,
            check: name 
          },
        });

        this.recordMetric({
          name: `health_check.${name}.duration`,
          value: healthCheck.duration,
          tags: { check: name },
          unit: 'ms',
        });

      } catch (error) {
        const healthCheck: HealthCheck = {
          name,
          status: 'unhealthy',
          message: String(error),
          duration: Date.now() - start,
          timestamp: new Date(),
        };

        this.healthChecks.set(name, healthCheck);
        logger.error('Health check failed', { name, error });
      }
    };

    // Run immediately and then periodically
    executeCheck();
    setInterval(executeCheck, 30000); // Every 30 seconds

    logger.info('Health check registered', { name });
  }

  /**
   * Get health check status
   */
  getHealthCheck(name: string): HealthCheck | undefined {
    return this.healthChecks.get(name);
  }

  /**
   * Get all health checks
   */
  getAllHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
    };
  } {
    const checks = this.getAllHealthChecks();
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
    };

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      checks,
      summary,
    };
  }

  /**
   * Start a distributed trace
   */
  startTrace(operationName: string, parentSpanId?: string): string {
    const traceId = parentSpanId ? 
      this.getTraceIdFromSpan(parentSpanId) : 
      stringUtils.random(16);
    const spanId = stringUtils.random(8);

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: new Date(),
      duration: 0,
      tags: {},
      logs: [],
    };

    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }

    this.traces.get(traceId)!.push(span);

    logger.debug('Trace started', { traceId, spanId, operationName });
    return spanId;
  }

  /**
   * Finish a trace span
   */
  finishSpan(
    spanId: string, 
    tags: Record<string, any> = {},
    logs: Array<{ message: string; level: string }> = []
  ): void {
    const span = this.findSpan(spanId);
    if (!span) {
      logger.warn('Span not found', { spanId });
      return;
    }

    span.duration = Date.now() - span.startTime.getTime();
    span.tags = { ...span.tags, ...tags };
    span.logs = logs.map(log => ({
      ...log,
      timestamp: new Date(),
    }));

    // Record metrics
    this.recordMetric({
      name: `trace.${span.operationName}.duration`,
      value: span.duration,
      tags: {
        operation: span.operationName,
        traceId: span.traceId,
      },
      unit: 'ms',
    });

    logger.debug('Trace finished', {
      traceId: span.traceId,
      spanId,
      operationName: span.operationName,
      duration: span.duration,
    });
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): TraceSpan[] {
    return this.traces.get(traceId) || [];
  }

  /**
   * Register default health checks
   */
  private registerDefaultHealthChecks(): void {
    // Memory usage check
    this.registerHealthCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      const heapTotalMB = usage.heapTotal / 1024 / 1024;
      const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

      return {
        status: heapUsagePercent > 90 ? 'unhealthy' : 
               heapUsagePercent > 70 ? 'degraded' : 'healthy',
        message: `Heap usage: ${heapUsedMB.toFixed(2)}MB (${heapUsagePercent.toFixed(1)}%)`,
        metadata: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          heapUsagePercent,
        },
      };
    });

    // Event loop lag check
    this.registerHealthCheck('event_loop', async () => {
      const start = process.hrtime.bigint();
      await new Promise(resolve => setImmediate(resolve));
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms

      return {
        status: lag > 100 ? 'unhealthy' : 
               lag > 50 ? 'degraded' : 'healthy',
        message: `Event loop lag: ${lag.toFixed(2)}ms`,
        metadata: { lag },
      };
    });

    // HTTP client health check
    this.registerHealthCheck('http_client', async () => {
      const stats = httpClient.getMetricsSummary();
      const errorRate = stats.errorRate;

      return {
        status: errorRate > 0.1 ? 'unhealthy' : 
               errorRate > 0.05 ? 'degraded' : 'healthy',
        message: `HTTP error rate: ${(errorRate * 100).toFixed(2)}%`,
        metadata: stats,
      };
    });
  }

  /**
   * Register default alerts
   */
  private registerDefaultAlerts(): void {
    // High error rate alert
    this.registerAlert({
      name: 'High Error Rate',
      condition: '>',
      threshold: 0.05,
      severity: 'high',
    });

    // High response time alert
    this.registerAlert({
      name: 'High Response Time',
      condition: '>',
      threshold: 1000,
      severity: 'medium',
    });

    // Memory usage alert
    this.registerAlert({
      name: 'High Memory Usage',
      condition: '>',
      threshold: 80,
      severity: 'high',
    });

    logger.debug('Default alerts registered');
  }

  /**
   * Find span by ID
   */
  private findSpan(spanId: string): TraceSpan | undefined {
    for (const spans of this.traces.values()) {
      const span = spans.find(s => s.spanId === spanId);
      if (span) return span;
    }
    return undefined;
  }

  /**
   * Get trace ID from span ID
   */
  private getTraceIdFromSpan(spanId: string): string {
    const span = this.findSpan(spanId);
    return span?.traceId || stringUtils.random(16);
  }

  /**
   * Start cleanup process
   */
  private startCleanupProcess(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.retentionPeriod;

      // Clean up old metrics
      for (const [name, points] of this.metrics.entries()) {
        const filtered = points.filter(p => p.timestamp.getTime() > cutoff);
        this.metrics.set(name, filtered);
      }

      // Clean up old traces
      for (const [traceId, spans] of this.traces.entries()) {
        const filtered = spans.filter(s => s.startTime.getTime() > cutoff);
        if (filtered.length === 0) {
          this.traces.delete(traceId);
        } else {
          this.traces.set(traceId, filtered);
        }
      }

      logger.debug('Monitoring data cleanup completed', {
        metricsCount: Array.from(this.metrics.values()).reduce((sum, points) => sum + points.length, 0),
        tracesCount: this.traces.size,
      });

    }, 3600000); // Every hour
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    metrics: {
      totalMetrics: number;
      totalPoints: number;
      uniqueMetrics: number;
    };
    alerts: {
      total: number;
      enabled: number;
      triggered: number;
    };
    healthChecks: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
    };
    traces: {
      totalTraces: number;
      totalSpans: number;
    };
  } {
    const alertStats = Array.from(this.alerts.values());
    const healthStats = this.getAllHealthChecks();

    return {
      metrics: {
        totalMetrics: this.metrics.size,
        totalPoints: Array.from(this.metrics.values()).reduce((sum, points) => sum + points.length, 0),
        uniqueMetrics: this.metrics.size,
      },
      alerts: {
        total: alertStats.length,
        enabled: alertStats.filter(a => a.enabled).length,
        triggered: alertStats.filter(a => a.triggerCount > 0).length,
      },
      healthChecks: {
        total: healthStats.length,
        healthy: healthStats.filter(c => c.status === 'healthy').length,
        degraded: healthStats.filter(c => c.status === 'degraded').length,
        unhealthy: healthStats.filter(c => c.status === 'unhealthy').length,
      },
      traces: {
        totalTraces: this.traces.size,
        totalSpans: Array.from(this.traces.values()).reduce((sum, spans) => sum + spans.length, 0),
      },
    };
  }
}

// Export singleton instance
export const monitoring = new AdvancedMonitoringSystem();

// Auto-start monitoring
monitoring.recordMetric({
  name: 'system.startup',
  value: 1,
  tags: { timestamp: new Date().toISOString() },
});

// Export types
export type { MetricPoint, Alert, HealthCheck, TraceSpan };