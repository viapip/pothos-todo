import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { CompositePropagator } from '@opentelemetry/core';
import { logger } from '@/logger';
import EventEmitter from 'events';

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  jaegerEndpoint?: string;
  zipkinEndpoint?: string;
  sampleRate: number;
  enableB3Propagation: boolean;
  enableJaegerPropagation: boolean;
  enableBaggage: boolean;
}

export interface SpanInfo {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    fields: Record<string, any>;
  }>;
  status: 'ok' | 'error' | 'timeout';
}

export interface TraceAnalytics {
  totalSpans: number;
  errorRate: number;
  averageDuration: number;
  p95Duration: number;
  p99Duration: number;
  serviceMap: Array<{
    from: string;
    to: string;
    callCount: number;
    errorCount: number;
    avgDuration: number;
  }>;
  criticalPath: string[];
}

export class DistributedTracing extends EventEmitter {
  private static instance: DistributedTracing;
  private config: TracingConfig;
  private tracer: any;
  private activeSpans: Map<string, SpanInfo> = new Map();
  private completedSpans: SpanInfo[] = [];
  private serviceMap: Map<string, Map<string, any>> = new Map();
  private initialized: boolean = false;

  private constructor(config: TracingConfig) {
    super();
    this.config = config;
  }

  public static getInstance(config?: TracingConfig): DistributedTracing {
    if (!DistributedTracing.instance && config) {
      DistributedTracing.instance = new DistributedTracing(config);
    }
    return DistributedTracing.instance;
  }

  /**
   * Initialize distributed tracing with comprehensive configuration
   */
  public async initialize(): Promise<void> {
    try {
      if (this.initialized) {
        logger.warn('Distributed tracing already initialized');
        return;
      }

      // Setup propagators
      const propagators = [];
      if (this.config.enableB3Propagation) {
        propagators.push(new B3Propagator());
      }
      if (this.config.enableJaegerPropagation) {
        propagators.push(new JaegerPropagator());
      }

      // Initialize tracer
      this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);

      // Setup span collection
      this.setupSpanCollection();

      this.initialized = true;

      logger.info('Distributed tracing initialized', {
        serviceName: this.config.serviceName,
        sampleRate: this.config.sampleRate,
        propagators: propagators.length,
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize distributed tracing', error);
      throw error;
    }
  }

  /**
   * Start a new distributed trace
   */
  public startTrace(
    operationName: string,
    parentContext?: any,
    tags?: Record<string, any>
  ): any {
    const span = this.tracer.startSpan(operationName, {
      parent: parentContext,
      kind: SpanKind.SERVER,
    });

    // Add standard tags
    span.setAttributes({
      'service.name': this.config.serviceName,
      'service.version': this.config.serviceVersion,
      'environment': this.config.environment,
    });

    // Add custom tags
    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }

    // Track span
    const spanInfo: SpanInfo = {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: Date.now(),
      tags: tags || {},
      logs: [],
      status: 'ok',
    };

    this.activeSpans.set(spanInfo.spanId, spanInfo);

    logger.debug('Trace started', {
      traceId: spanInfo.traceId,
      spanId: spanInfo.spanId,
      operationName,
    });

    return span;
  }

  /**
   * Create child span with automatic parent context
   */
  public createChildSpan(
    operationName: string,
    parentSpan: any,
    tags?: Record<string, any>
  ): any {
    return context.with(trace.setSpan(context.active(), parentSpan), () => {
      const childSpan = this.tracer.startSpan(operationName, {
        kind: SpanKind.INTERNAL,
      });

      if (tags) {
        Object.entries(tags).forEach(([key, value]) => {
          childSpan.setAttribute(key, value);
        });
      }

      // Track child span
      const parentSpanContext = parentSpan.spanContext();
      const spanInfo: SpanInfo = {
        traceId: childSpan.spanContext().traceId,
        spanId: childSpan.spanContext().spanId,
        parentSpanId: parentSpanContext.spanId,
        operationName,
        startTime: Date.now(),
        tags: tags || {},
        logs: [],
        status: 'ok',
      };

      this.activeSpans.set(spanInfo.spanId, spanInfo);

      return childSpan;
    });
  }

  /**
   * Add structured logging to span
   */
  public addSpanLog(
    span: any,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    fields?: Record<string, any>
  ): void {
    const spanContext = span.spanContext();
    const spanInfo = this.activeSpans.get(spanContext.spanId);

    if (spanInfo) {
      spanInfo.logs.push({
        timestamp: Date.now(),
        fields: {
          level,
          message,
          ...fields,
        },
      });
    }

    // Also add as span event
    span.addEvent(message, {
      level,
      ...fields,
    });
  }

  /**
   * Set span status and finish
   */
  public finishSpan(
    span: any,
    status: 'ok' | 'error' | 'timeout' = 'ok',
    error?: Error
  ): void {
    const spanContext = span.spanContext();
    const spanInfo = this.activeSpans.get(spanContext.spanId);

    if (spanInfo) {
      spanInfo.duration = Date.now() - spanInfo.startTime;
      spanInfo.status = status;

      // Move to completed spans
      this.activeSpans.delete(spanContext.spanId);
      this.completedSpans.push(spanInfo);

      // Update service map
      this.updateServiceMap(spanInfo);

      // Keep only recent completed spans
      if (this.completedSpans.length > 10000) {
        this.completedSpans = this.completedSpans.slice(-5000);
      }
    }

    // Set OpenTelemetry span status
    if (status === 'error') {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Operation failed',
      });
      if (error) {
        span.recordException(error);
      }
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();

    logger.debug('Span finished', {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      status,
      duration: spanInfo?.duration,
    });
  }

  /**
   * Trace cross-service calls
   */
  public traceCrossServiceCall(
    serviceName: string,
    operationName: string,
    parentSpan: any
  ): any {
    const span = this.createChildSpan(`${serviceName}.${operationName}`, parentSpan, {
      'service.remote': serviceName,
      'span.kind': 'client',
    });

    // Inject trace context for propagation
    const headers: Record<string, string> = {};
    trace.setSpan(context.active(), span);
    
    // In real implementation, you would inject context into HTTP headers
    // context.inject(context.active(), headers, new HttpTraceContextPropagator());

    return { span, headers };
  }

  /**
   * Extract trace context from incoming request
   */
  public extractTraceContext(headers: Record<string, string>): any {
    // In real implementation, you would extract context from HTTP headers
    // return context.extract(context.active(), headers, new HttpTraceContextPropagator());
    return context.active();
  }

  /**
   * Generate comprehensive trace analytics
   */
  public getTraceAnalytics(timeRange?: { start: Date; end: Date }): TraceAnalytics {
    let spans = this.completedSpans;

    // Filter by time range if provided
    if (timeRange) {
      spans = spans.filter(span => {
        const spanTime = new Date(span.startTime);
        return spanTime >= timeRange.start && spanTime <= timeRange.end;
      });
    }

    if (spans.length === 0) {
      return {
        totalSpans: 0,
        errorRate: 0,
        averageDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        serviceMap: [],
        criticalPath: [],
      };
    }

    // Calculate metrics
    const totalSpans = spans.length;
    const errorSpans = spans.filter(span => span.status === 'error').length;
    const errorRate = errorSpans / totalSpans;

    const durations = spans
      .filter(span => span.duration !== undefined)
      .map(span => span.duration!)
      .sort((a, b) => a - b);

    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Duration = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99Duration = durations[Math.floor(durations.length * 0.99)] || 0;

    // Generate service map
    const serviceMap = this.generateServiceMap();

    // Find critical path (simplified)
    const criticalPath = this.findCriticalPath(spans);

    return {
      totalSpans,
      errorRate,
      averageDuration,
      p95Duration,
      p99Duration,
      serviceMap,
      criticalPath,
    };
  }

  /**
   * Get trace timeline for specific trace ID
   */
  public getTraceTimeline(traceId: string): Array<{
    spanId: string;
    operationName: string;
    startTime: number;
    duration: number;
    level: number;
    status: string;
  }> {
    const traceSpans = this.completedSpans.filter(span => span.traceId === traceId);
    
    // Build hierarchy
    const timeline = traceSpans.map(span => ({
      spanId: span.spanId,
      operationName: span.operationName,
      startTime: span.startTime,
      duration: span.duration || 0,
      level: this.calculateSpanLevel(span, traceSpans),
      status: span.status,
    }));

    // Sort by start time
    return timeline.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Monitor trace performance and detect anomalies
   */
  public detectTraceAnomalies(): Array<{
    type: 'slow_trace' | 'error_spike' | 'memory_leak' | 'dependency_issue';
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    traces: string[];
    recommendations: string[];
  }> {
    const anomalies = [];
    const recentSpans = this.completedSpans.slice(-1000); // Last 1000 spans

    // Detect slow traces
    const avgDuration = recentSpans.reduce((sum, span) => sum + (span.duration || 0), 0) / recentSpans.length;
    const slowTraces = recentSpans.filter(span => (span.duration || 0) > avgDuration * 3);

    if (slowTraces.length > 10) {
      anomalies.push({
        type: 'slow_trace',
        description: `${slowTraces.length} traces are significantly slower than average`,
        severity: 'high' as const,
        traces: slowTraces.map(s => s.traceId).slice(0, 5),
        recommendations: [
          'Check for database performance issues',
          'Review external service dependencies',
          'Consider adding caching',
        ],
      });
    }

    // Detect error spikes
    const errorSpans = recentSpans.filter(span => span.status === 'error');
    const errorRate = errorSpans.length / recentSpans.length;

    if (errorRate > 0.05) { // More than 5% error rate
      anomalies.push({
        type: 'error_spike',
        description: `Error rate is ${Math.round(errorRate * 100)}%, above normal threshold`,
        severity: errorRate > 0.15 ? 'critical' : 'high',
        traces: errorSpans.map(s => s.traceId).slice(0, 5),
        recommendations: [
          'Check service health and dependencies',
          'Review recent deployments',
          'Monitor system resources',
        ],
      });
    }

    return anomalies;
  }

  /**
   * Export trace data for external analysis
   */
  public exportTraceData(format: 'jaeger' | 'zipkin' | 'json' = 'json'): any {
    const exportData = {
      traces: this.completedSpans.map(span => ({
        traceID: span.traceId,
        spanID: span.spanId,
        parentSpanID: span.parentSpanId,
        operationName: span.operationName,
        startTime: span.startTime * 1000, // Convert to microseconds
        duration: (span.duration || 0) * 1000,
        tags: Object.entries(span.tags).map(([key, value]) => ({
          key,
          value: String(value),
        })),
        logs: span.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          fields: Object.entries(log.fields).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        })),
        process: {
          serviceName: this.config.serviceName,
          tags: [
            { key: 'service.version', value: this.config.serviceVersion },
            { key: 'environment', value: this.config.environment },
          ],
        },
      })),
      serviceMap: this.generateServiceMap(),
      analytics: this.getTraceAnalytics(),
    };

    return exportData;
  }

  // Private helper methods

  private setupSpanCollection(): void {
    // In a real implementation, you would setup span processors
    // to collect and forward spans to your tracing backend
    logger.debug('Span collection setup completed');
  }

  private updateServiceMap(spanInfo: SpanInfo): void {
    const serviceName = this.config.serviceName;
    const remoteService = spanInfo.tags['service.remote'] as string;

    if (remoteService) {
      if (!this.serviceMap.has(serviceName)) {
        this.serviceMap.set(serviceName, new Map());
      }

      const serviceConnections = this.serviceMap.get(serviceName)!;
      const existing = serviceConnections.get(remoteService) || {
        callCount: 0,
        errorCount: 0,
        totalDuration: 0,
      };

      existing.callCount++;
      if (spanInfo.status === 'error') {
        existing.errorCount++;
      }
      existing.totalDuration += spanInfo.duration || 0;

      serviceConnections.set(remoteService, existing);
    }
  }

  private generateServiceMap(): Array<{
    from: string;
    to: string;
    callCount: number;
    errorCount: number;
    avgDuration: number;
  }> {
    const serviceMap = [];

    for (const [fromService, connections] of this.serviceMap) {
      for (const [toService, stats] of connections) {
        serviceMap.push({
          from: fromService,
          to: toService,
          callCount: stats.callCount,
          errorCount: stats.errorCount,
          avgDuration: stats.totalDuration / stats.callCount,
        });
      }
    }

    return serviceMap;
  }

  private findCriticalPath(spans: SpanInfo[]): string[] {
    // Simplified critical path detection
    // In reality, this would involve more complex graph analysis
    const sortedSpans = spans
      .filter(span => span.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    return sortedSpans.slice(0, 5).map(span => span.operationName);
  }

  private calculateSpanLevel(span: SpanInfo, allSpans: SpanInfo[]): number {
    let level = 0;
    let currentParent = span.parentSpanId;

    while (currentParent) {
      level++;
      const parentSpan = allSpans.find(s => s.spanId === currentParent);
      currentParent = parentSpan?.parentSpanId;
    }

    return level;
  }

  /**
   * Get current tracing statistics
   */
  public getTracingStats(): {
    activeSpans: number;
    completedSpans: number;
    services: number;
    averageSpanDuration: number;
  } {
    const completedWithDuration = this.completedSpans.filter(s => s.duration !== undefined);
    const avgDuration = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, s) => sum + s.duration!, 0) / completedWithDuration.length
      : 0;

    return {
      activeSpans: this.activeSpans.size,
      completedSpans: this.completedSpans.length,
      services: this.serviceMap.size,
      averageSpanDuration: avgDuration,
    };
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
    this.serviceMap.clear();
    logger.info('Distributed tracing cleaned up');
  }
}

// Export singleton factory
export const createDistributedTracing = (config: TracingConfig) => {
  return DistributedTracing.getInstance(config);
};