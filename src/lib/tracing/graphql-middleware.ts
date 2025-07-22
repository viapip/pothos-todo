/**
 * GraphQL Tracing Middleware
 * Custom OpenTelemetry instrumentation for GraphQL operations
 */

import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '../../logger.js';

// ================================
// GraphQL Operation Tracing
// ================================

export function createGraphQLTracingMiddleware() {
  const tracer = trace.getTracer('graphql-middleware', '1.0.0');

  return {
    onRequest: async (requestContext: any) => {
      const span = tracer.startSpan('graphql.request', {
        kind: SpanKind.SERVER,
        attributes: {
          'graphql.operation.type': 'unknown',
          'graphql.operation.name': 'unknown',
          'component': 'graphql',
        },
      });

      // Store span in context for later access
      requestContext.span = span;
      requestContext.traceContext = context.active();

      logger.debug('Started GraphQL request span', {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
    },

    onParse: async (parseContext: any) => {
      const { span } = parseContext.requestContext || {};
      if (!span) return;

      const parseSpan = tracer.startSpan('graphql.parse', {
        kind: SpanKind.INTERNAL,
        attributes: {
          'component': 'graphql',
          'operation': 'parse',
        },
      }, trace.setSpan(parseContext.requestContext.traceContext, span));

      parseContext.parseSpan = parseSpan;
    },

    onParseComplete: async (parseContext: any) => {
      const { parseSpan } = parseContext;
      if (!parseSpan) return;

      if (parseContext.result && parseContext.result.definitions) {
        const operation = parseContext.result.definitions[0];
        if (operation) {
          parseSpan.setAttributes({
            'graphql.operation.type': operation.operation || 'unknown',
            'graphql.operation.name': operation.name?.value || 'anonymous',
          });
        }
      }

      parseSpan.setStatus({ code: SpanStatusCode.OK });
      parseSpan.end();
    },

    onValidate: async (validateContext: any) => {
      const { span } = validateContext.requestContext || {};
      if (!span) return;

      const validateSpan = tracer.startSpan('graphql.validate', {
        kind: SpanKind.INTERNAL,
        attributes: {
          'component': 'graphql',
          'operation': 'validate',
        },
      }, trace.setSpan(validateContext.requestContext.traceContext, span));

      validateContext.validateSpan = validateSpan;
    },

    onValidateComplete: async (validateContext: any) => {
      const { validateSpan } = validateContext;
      if (!validateSpan) return;

      if (validateContext.errors && validateContext.errors.length > 0) {
        validateSpan.setAttributes({
          'graphql.validation.errors': validateContext.errors.length,
        });
        validateSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'GraphQL validation failed',
        });
      } else {
        validateSpan.setStatus({ code: SpanStatusCode.OK });
      }

      validateSpan.end();
    },

    onExecute: async (executeContext: any) => {
      const { span } = executeContext.requestContext || {};
      if (!span) return;

      const executeSpan = tracer.startSpan('graphql.execute', {
        kind: SpanKind.INTERNAL,
        attributes: {
          'component': 'graphql',
          'operation': 'execute',
        },
      }, trace.setSpan(executeContext.requestContext.traceContext, span));

      executeContext.executeSpan = executeSpan;

      // Extract operation details
      if (executeContext.document) {
        const operation = executeContext.document.definitions[0] as any;
        if (operation) {
          const operationType = operation.operation || 'unknown';
          const operationName = operation.name?.value || 'anonymous';

          executeSpan.setAttributes({
            'graphql.operation.type': operationType,
            'graphql.operation.name': operationName,
          });

          // Also update the parent request span
          span.setAttributes({
            'graphql.operation.type': operationType,
            'graphql.operation.name': operationName,
          });
        }
      }
    },

    onExecuteComplete: async (executeContext: any) => {
      const { executeSpan } = executeContext;
      if (!executeSpan) return;

      if (executeContext.result) {
        if (executeContext.result.errors && executeContext.result.errors.length > 0) {
          executeSpan.setAttributes({
            'graphql.execution.errors': executeContext.result.errors.length,
          });
          executeSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL execution failed',
          });

          // Record errors
          executeContext.result.errors.forEach((error: any, index: number) => {
            executeSpan.addEvent('graphql.error', {
              'error.message': error.message,
              'error.path': error.path ? JSON.stringify(error.path) : undefined,
              'error.index': index,
            });
          });
        } else {
          executeSpan.setStatus({ code: SpanStatusCode.OK });
        }

        if (executeContext.result.data) {
          const dataKeys = Object.keys(executeContext.result.data);
          executeSpan.setAttributes({
            'graphql.execution.result_fields': dataKeys.length,
            'graphql.execution.root_fields': dataKeys.join(','),
          });
        }
      }

      executeSpan.end();
    },

    onResponse: async (responseContext: any) => {
      const { span } = responseContext.requestContext || {};
      if (!span) return;

      // Add response metadata
      if (responseContext.response) {
        const hasErrors = responseContext.response.body?.singleResult?.errors?.length > 0;
        span.setAttributes({
          'http.response.has_errors': hasErrors,
        });

        if (hasErrors) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL response contains errors',
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      }

      span.end();

      logger.debug('Completed GraphQL request span', {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
    },

    onError: async (errorContext: any) => {
      const { span } = errorContext.requestContext || {};
      if (!span) return;

      span.recordException(errorContext.error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorContext.error.message,
      });

      logger.error('GraphQL request error', {
        error: errorContext.error,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
    },
  };
}

// ================================
// Resolver Tracing Decorator
// ================================

export function traceResolver(resolverName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalResolver = descriptor.value;
    const name = resolverName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (parent: any, args: any, context: any, info: any) {
      const tracer = trace.getTracer('graphql-resolvers', '1.0.0');
      
      const span = tracer.startSpan(`resolver.${name}`, {
        kind: SpanKind.INTERNAL,
        attributes: {
          'component': 'graphql',
          'graphql.resolver.name': name,
          'graphql.resolver.field': info?.fieldName,
          'graphql.resolver.type': info?.parentType?.name,
          'graphql.resolver.return_type': info?.returnType?.toString(),
        },
      });

      try {
        const result = await originalResolver.call(this, parent, args, context, info);
        
        // Add result metadata
        if (result !== null && result !== undefined) {
          span.setAttributes({
            'graphql.resolver.result_type': typeof result,
            'graphql.resolver.result_is_array': Array.isArray(result),
            'graphql.resolver.result_length': Array.isArray(result) ? result.length : undefined,
          });
        }
        
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
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
    };

    return descriptor;
  };
}

// ================================
// Database Query Tracing
// ================================

export function traceDatabaseQuery(operation: string, table?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('database-queries', '1.0.0');
      
      const span = tracer.startSpan(`db.${operation}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'component': 'database',
          'db.operation': operation,
          'db.table': table,
          'db.system': 'postgresql',
        },
      });

      try {
        const result = await originalMethod.apply(this, args);
        
        // Add result metadata
        if (Array.isArray(result)) {
          span.setAttributes({
            'db.result.count': result.length,
          });
        }
        
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setAttributes({
          'db.error': (error as Error).message,
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}

// ================================
// Cache Operation Tracing
// ================================

export function traceCacheOperation(operation: 'get' | 'set' | 'delete' | 'clear') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('cache-operations', '1.0.0');
      
      const span = tracer.startSpan(`cache.${operation}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'component': 'cache',
          'cache.operation': operation,
          'cache.key': args[0]?.toString()?.slice(0, 50), // First 50 chars of key
        },
      });

      try {
        const result = await originalMethod.apply(this, args);
        
        // Add result metadata
        if (operation === 'get') {
          span.setAttributes({
            'cache.hit': result.hit || false,
            'cache.result_size': result.value ? JSON.stringify(result.value).length : 0,
          });
        }
        
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
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
    };

    return descriptor;
  };
}

// ================================
// Subscription Tracing
// ================================

export function createSubscriptionTracer() {
  const tracer = trace.getTracer('graphql-subscriptions', '1.0.0');

  return {
    traceSubscriptionStart: (subscriptionName: string, userId?: string) => {
      return tracer.startSpan(`subscription.${subscriptionName}`, {
        kind: SpanKind.SERVER,
        attributes: {
          'component': 'graphql',
          'graphql.operation.type': 'subscription',
          'graphql.subscription.name': subscriptionName,
          'user.id': userId,
        },
      });
    },

    traceSubscriptionEvent: (subscriptionSpan: any, eventType: string, eventData?: any) => {
      const eventSpan = tracer.startSpan(`subscription.event.${eventType}`, {
        kind: SpanKind.INTERNAL,
        attributes: {
          'component': 'graphql',
          'subscription.event.type': eventType,
          'subscription.event.data_size': eventData ? JSON.stringify(eventData).length : 0,
        },
      }, trace.setSpan(context.active(), subscriptionSpan));

      eventSpan.setStatus({ code: SpanStatusCode.OK });
      eventSpan.end();
    },

    traceSubscriptionEnd: (subscriptionSpan: any, reason: string) => {
      subscriptionSpan.setAttributes({
        'subscription.end_reason': reason,
      });
      subscriptionSpan.setStatus({ code: SpanStatusCode.OK });
      subscriptionSpan.end();
    },
  };
}