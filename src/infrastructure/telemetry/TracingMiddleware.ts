import { trace, context, SpanStatusCode, SpanKind, type Attributes } from '@opentelemetry/api';
import type { H3Event } from 'h3';
import { getTracer } from './telemetry.js';
import { logger } from '@/logger';

export class TracingMiddleware {
  private tracer = getTracer('http-middleware');

  /**
   * Create a traced H3 event handler
   */
  traceHandler(handlerName: string, handler: (event: H3Event) => Promise<any>) {
    return async (event: H3Event) => {
      const span = this.tracer.startSpan(`http.${handlerName}`, {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': event.node.req.method,
          'http.url': event.node.req.url,
          'http.target': event.node.req.url,
          'http.host': event.node.req.headers.host,
          'http.scheme': 'http',
          'http.user_agent': event.node.req.headers['user-agent'],
        },
      });

      return context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const result = await handler(event);
          
          span.setAttributes({
            'http.status_code': event.node.res.statusCode || 200,
          });
          
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          
          span.setAttributes({
            'http.status_code': event.node.res.statusCode || 500,
          });
          
          throw error;
        } finally {
          span.end();
        }
      });
    };
  }

  /**
   * Trace GraphQL operations
   */
  traceGraphQLOperation(operationName: string, operationType: string, attributes?: Attributes) {
    const span = this.tracer.startSpan(`graphql.${operationType}.${operationName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'graphql.operation.name': operationName,
        'graphql.operation.type': operationType,
        ...attributes,
      },
    });

    return {
      span,
      context: trace.setSpan(context.active(), span),
    };
  }

  /**
   * Trace database operations
   */
  traceDatabaseOperation(operation: string, table: string, attributes?: Attributes) {
    const span = this.tracer.startSpan(`db.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'postgresql',
        'db.operation': operation,
        'db.sql.table': table,
        ...attributes,
      },
    });

    return {
      span,
      context: trace.setSpan(context.active(), span),
    };
  }

  /**
   * Trace external HTTP calls
   */
  traceHttpCall(method: string, url: string, attributes?: Attributes) {
    const parsedUrl = new URL(url);
    
    const span = this.tracer.startSpan(`http.${method}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.method': method,
        'http.url': url,
        'http.host': parsedUrl.host,
        'http.scheme': parsedUrl.protocol.replace(':', ''),
        'http.target': parsedUrl.pathname + parsedUrl.search,
        ...attributes,
      },
    });

    return {
      span,
      context: trace.setSpan(context.active(), span),
    };
  }

  /**
   * Trace AI/ML operations
   */
  traceAIOperation(operation: string, model: string, attributes?: Attributes) {
    const span = this.tracer.startSpan(`ai.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'ai.operation': operation,
        'ai.model': model,
        'ai.provider': 'openai',
        ...attributes,
      },
    });

    return {
      span,
      context: trace.setSpan(context.active(), span),
    };
  }

  /**
   * Trace cache operations
   */
  traceCacheOperation(operation: string, key: string, hit: boolean, attributes?: Attributes) {
    const span = this.tracer.startSpan(`cache.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'cache.operation': operation,
        'cache.key': key,
        'cache.hit': hit,
        'cache.system': 'redis',
        ...attributes,
      },
    });

    return {
      span,
      context: trace.setSpan(context.active(), span),
    };
  }

  /**
   * Create a traced async function wrapper
   */
  traceAsync<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T,
    options?: {
      kind?: SpanKind;
      attributes?: Attributes;
    }
  ): T {
    return (async (...args: Parameters<T>) => {
      const span = this.tracer.startSpan(name, {
        kind: options?.kind || SpanKind.INTERNAL,
        attributes: options?.attributes,
      });

      return context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const result = await fn(...args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        } finally {
          span.end();
        }
      });
    }) as T;
  }
}

export const tracingMiddleware = new TracingMiddleware();