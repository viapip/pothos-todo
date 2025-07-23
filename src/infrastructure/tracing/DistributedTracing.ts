import { trace, context, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '@/logger.js';
import { MetricsCollector } from '../monitoring/MetricsCollector.js';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

export interface SpanOptions {
  name: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  parent?: Span;
}

export interface DatabaseSpanOptions extends SpanOptions {
  operation: string;
  table?: string;
  query?: string;
}

export interface HttpSpanOptions extends SpanOptions {
  method: string;
  url: string;
  statusCode?: number;
}

export interface GraphQLSpanOptions extends SpanOptions {
  operationType: 'query' | 'mutation' | 'subscription';
  operationName?: string;
  complexity?: number;
  variables?: Record<string, any>;
}

export class DistributedTracing {
  private static instance: DistributedTracing;
  private tracer = trace.getTracer('pothos-todo-api');
  private traceStorage = new AsyncLocalStorage<TraceContext>();
  private metrics: MetricsCollector;

  private constructor() {
    this.metrics = MetricsCollector.getInstance();
  }

  public static getInstance(): DistributedTracing {
    if (!DistributedTracing.instance) {
      DistributedTracing.instance = new DistributedTracing();
    }
    return DistributedTracing.instance;
  }

  /**
   * Start a new span with automatic context management
   */
  public async startSpan<T>(
    options: SpanOptions,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = this.tracer.startSpan(options.name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes,
    }, options.parent ? trace.setSpan(context.active(), options.parent) : undefined);

    const traceContext: TraceContext = {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      parentSpanId: this.getCurrentSpanId(),
    };

    try {
      return await this.traceStorage.run(traceContext, async () => {
        const result = await trace.getTracer('pothos-todo-api').startActiveSpan(
          options.name,
          { 
            kind: options.kind || SpanKind.INTERNAL,
            attributes: options.attributes 
          },
          async (activeSpan) => {
            try {
              const result = await fn(activeSpan);
              activeSpan.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (error) {
              activeSpan.recordException(error as Error);
              activeSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: (error as Error).message,
              });
              throw error;
            } finally {
              activeSpan.end();
            }
          }
        );
        return result;
      });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Create a database operation span
   */
  public async traceDatabaseOperation<T>(
    options: DatabaseSpanOptions,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const attributes = {
      'db.operation': options.operation,
      'db.system': 'postgresql',
      ...(options.table && { 'db.name': options.table }),
      ...(options.query && { 'db.statement': this.sanitizeQuery(options.query) }),
      ...options.attributes,
    };

    return this.startSpan({
      name: `db.${options.operation}${options.table ? ` ${options.table}` : ''}`,
      kind: SpanKind.CLIENT,
      attributes,
    }, async (span) => {
      const start = Date.now();
      
      try {
        const result = await fn(span);
        const duration = Date.now() - start;
        
        span.setAttributes({
          'db.duration': duration,
        });

        this.metrics.recordMetric('db.operation.duration', duration, {
          operation: options.operation,
          table: options.table || 'unknown',
        });

        return result;
      } catch (error) {
        this.metrics.recordMetric('db.operation.error', 1, {
          operation: options.operation,
          error: (error as Error).message,
        });
        throw error;
      }
    });
  }

  /**
   * Create an HTTP request span
   */
  public async traceHttpRequest<T>(
    options: HttpSpanOptions,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const attributes = {
      'http.method': options.method,
      'http.url': options.url,
      'http.scheme': new URL(options.url).protocol.replace(':', ''),
      'http.host': new URL(options.url).host,
      ...options.attributes,
    };

    return this.startSpan({
      name: `HTTP ${options.method}`,
      kind: SpanKind.CLIENT,
      attributes,
    }, async (span) => {
      const start = Date.now();
      
      try {
        const result = await fn(span);
        const duration = Date.now() - start;
        
        span.setAttributes({
          'http.status_code': options.statusCode || 200,
          'http.response_time': duration,
        });

        this.metrics.recordMetric('http.request.duration', duration, {
          method: options.method,
          status: String(options.statusCode || 200),
        });

        return result;
      } catch (error) {
        span.setAttributes({
          'http.status_code': 500,
        });
        
        this.metrics.recordMetric('http.request.error', 1, {
          method: options.method,
          error: (error as Error).message,
        });
        throw error;
      }
    });
  }

  /**
   * Create a GraphQL operation span
   */
  public async traceGraphQLOperation<T>(
    options: GraphQLSpanOptions,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const attributes = {
      'graphql.operation.type': options.operationType,
      ...(options.operationName && { 'graphql.operation.name': options.operationName }),
      ...(options.complexity && { 'graphql.query.complexity': options.complexity }),
      ...options.attributes,
    };

    // Add sanitized variables as attributes (without sensitive data)
    if (options.variables) {
      const sanitizedVars = this.sanitizeVariables(options.variables);
      Object.entries(sanitizedVars).forEach(([key, value]) => {
        attributes[`graphql.variable.${key}`] = String(value);
      });
    }

    return this.startSpan({
      name: `GraphQL ${options.operationType}${options.operationName ? ` ${options.operationName}` : ''}`,
      kind: SpanKind.SERVER,
      attributes,
    }, async (span) => {
      const start = Date.now();
      
      try {
        const result = await fn(span);
        const duration = Date.now() - start;
        
        span.setAttributes({
          'graphql.execution.duration': duration,
        });

        this.metrics.recordMetric('graphql.operation.duration', duration, {
          operationType: options.operationType,
          operationName: options.operationName || 'unknown',
        });

        return result;
      } catch (error) {
        this.metrics.recordMetric('graphql.operation.error', 1, {
          operationType: options.operationType,
          error: (error as Error).message,
        });
        throw error;
      }
    });
  }

  /**
   * Create a span for AI operations
   */
  public async traceAIOperation<T>(
    operationType: string,
    model: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    return this.startSpan({
      name: `AI ${operationType}`,
      kind: SpanKind.CLIENT,
      attributes: {
        'ai.operation': operationType,
        'ai.model': model,
        'ai.provider': 'openai',
      },
    }, async (span) => {
      const start = Date.now();
      
      try {
        const result = await fn(span);
        const duration = Date.now() - start;
        
        span.setAttributes({
          'ai.duration': duration,
        });

        this.metrics.recordMetric('ai.operation.duration', duration, {
          operation: operationType,
          model,
        });

        return result;
      } catch (error) {
        this.metrics.recordMetric('ai.operation.error', 1, {
          operation: operationType,
          error: (error as Error).message,
        });
        throw error;
      }
    });
  }

  /**
   * Get current trace context
   */
  public getCurrentTraceContext(): TraceContext | undefined {
    return this.traceStorage.getStore();
  }

  /**
   * Get current span ID
   */
  public getCurrentSpanId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    return activeSpan?.spanContext().spanId;
  }

  /**
   * Get current trace ID
   */
  public getCurrentTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    return activeSpan?.spanContext().traceId;
  }

  /**
   * Add baggage to current trace context
   */
  public setBaggage(key: string, value: string): void {
    const currentContext = this.getCurrentTraceContext();
    if (currentContext) {
      currentContext.baggage = {
        ...currentContext.baggage,
        [key]: value,
      };
    }
  }

  /**
   * Get baggage from current trace context
   */
  public getBaggage(key: string): string | undefined {
    const currentContext = this.getCurrentTraceContext();
    return currentContext?.baggage?.[key];
  }

  /**
   * Create a child span from current context
   */
  public createChildSpan(name: string, attributes?: Record<string, any>): Span {
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  /**
   * Sanitize database query for tracing (remove sensitive data)
   */
  private sanitizeQuery(query: string): string {
    // Remove potential sensitive data from queries
    return query
      .replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='***'")
      .replace(/token\s*=\s*['"][^'"]*['"]/gi, "token='***'")
      .replace(/secret\s*=\s*['"][^'"]*['"]/gi, "secret='***'")
      .substring(0, 500); // Limit query length
  }

  /**
   * Sanitize GraphQL variables for tracing
   */
  private sanitizeVariables(variables: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const [key, value] of Object.entries(variables)) {
      const isSensitive = sensitiveKeys.some(sensitive => 
        key.toLowerCase().includes(sensitive)
      );
      
      if (isSensitive) {
        sanitized[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[Object]';
      } else if (Array.isArray(value)) {
        sanitized[key] = `[Array(${value.length})]`;
      } else {
        sanitized[key] = String(value).substring(0, 100);
      }
    }
    
    return sanitized;
  }

  /**
   * Create trace headers for outgoing requests
   */
  public getTraceHeaders(): Record<string, string> {
    const traceId = this.getCurrentTraceId();
    const spanId = this.getCurrentSpanId();
    
    if (!traceId || !spanId) {
      return {};
    }
    
    return {
      'X-Trace-Id': traceId,
      'X-Span-Id': spanId,
      'traceparent': `00-${traceId}-${spanId}-01`,
    };
  }

  /**
   * Extract trace context from incoming headers
   */
  public extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
    const traceId = headers['x-trace-id'] as string;
    const spanId = headers['x-span-id'] as string;
    const traceparent = headers['traceparent'] as string;
    
    if (traceparent) {
      // Parse W3C traceparent header: version-traceid-spanid-flags
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          parentSpanId: spanId,
        };
      }
    }
    
    if (traceId && spanId) {
      return {
        traceId,
        spanId,
      };
    }
    
    return null;
  }

  /**
   * Log with trace context
   */
  public logWithTrace(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any): void {
    const traceContext = this.getCurrentTraceContext();
    
    const logMeta = {
      ...meta,
      ...(traceContext && {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
      }),
    };
    
    logger[level](message, logMeta);
  }
}

/**
 * Decorators for automatic tracing
 */
export function TraceMethod(spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const tracing = DistributedTracing.getInstance();
    
    descriptor.value = async function (...args: any[]) {
      const name = spanName || `${target.constructor.name}.${propertyKey}`;
      
      return tracing.startSpan({
        name,
        attributes: {
          'method.class': target.constructor.name,
          'method.name': propertyKey,
        },
      }, async (span) => {
        return originalMethod.apply(this, args);
      });
    };
    
    return descriptor;
  };
}

export function TraceDatabase(operation: string, table?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const tracing = DistributedTracing.getInstance();
    
    descriptor.value = async function (...args: any[]) {
      return tracing.traceDatabaseOperation({
        name: `${operation} ${table || 'unknown'}`,
        operation,
        table,
      }, async (span) => {
        return originalMethod.apply(this, args);
      });
    };
    
    return descriptor;
  };
}

export function TraceAI(operationType: string, model: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const tracing = DistributedTracing.getInstance();
    
    descriptor.value = async function (...args: any[]) {
      return tracing.traceAIOperation(operationType, model, async (span) => {
        return originalMethod.apply(this, args);
      });
    };
    
    return descriptor;
  };
}