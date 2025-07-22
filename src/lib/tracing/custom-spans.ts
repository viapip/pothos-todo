/**
 * Custom Tracing Spans
 * Application-specific tracing utilities and span creators
 */

import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '../../logger.js';

// ================================
// Authentication Tracing
// ================================

export class AuthenticationTracer {
  private tracer = trace.getTracer('authentication', '1.0.0');

  traceLogin(provider: string, userId?: string) {
    return this.tracer.startSpan('auth.login', {
      kind: SpanKind.SERVER,
      attributes: {
        'component': 'authentication',
        'auth.provider': provider,
        'user.id': userId,
      },
    });
  }

  traceTokenValidation(tokenType: 'session' | 'oauth' | 'jwt') {
    return this.tracer.startSpan('auth.token_validation', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'authentication',
        'auth.token_type': tokenType,
      },
    });
  }

  traceSessionCreation(userId: string, provider: string) {
    return this.tracer.startSpan('auth.session_creation', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'authentication',
        'user.id': userId,
        'auth.provider': provider,
      },
    });
  }

  traceLogout(userId?: string, logoutType: 'single' | 'all' = 'single') {
    return this.tracer.startSpan('auth.logout', {
      kind: SpanKind.SERVER,
      attributes: {
        'component': 'authentication',
        'user.id': userId,
        'auth.logout_type': logoutType,
      },
    });
  }
}

// ================================
// Business Logic Tracing
// ================================

export class BusinessLogicTracer {
  private tracer = trace.getTracer('business-logic', '1.0.0');

  traceTodoOperation(operation: 'create' | 'update' | 'delete' | 'complete', todoId?: string, userId?: string) {
    return this.tracer.startSpan(`todo.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'business-logic',
        'todo.operation': operation,
        'todo.id': todoId,
        'user.id': userId,
      },
    });
  }

  traceTodoListOperation(operation: 'create' | 'update' | 'delete' | 'share', listId?: string, userId?: string) {
    return this.tracer.startSpan(`todolist.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'business-logic',
        'todolist.operation': operation,
        'todolist.id': listId,
        'user.id': userId,
      },
    });
  }

  traceUserOperation(operation: 'create' | 'update' | 'delete' | 'profile_update', userId?: string) {
    return this.tracer.startSpan(`user.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'business-logic',
        'user.operation': operation,
        'user.id': userId,
      },
    });
  }

  traceBulkOperation(operation: string, itemCount: number, userId?: string) {
    return this.tracer.startSpan(`bulk.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'business-logic',
        'bulk.operation': operation,
        'bulk.item_count': itemCount,
        'user.id': userId,
      },
    });
  }
}

// ================================
// External Service Tracing
// ================================

export class ExternalServiceTracer {
  private tracer = trace.getTracer('external-services', '1.0.0');

  traceOAuthProvider(provider: 'google' | 'github', operation: 'authorize' | 'callback' | 'token_exchange') {
    return this.tracer.startSpan(`oauth.${provider}.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'component': 'external-service',
        'oauth.provider': provider,
        'oauth.operation': operation,
      },
    });
  }

  traceEmailService(operation: 'send' | 'verify' | 'reset_password', recipient?: string) {
    return this.tracer.startSpan(`email.${operation}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'component': 'external-service',
        'email.operation': operation,
        'email.recipient': recipient ? 'redacted' : undefined,
      },
    });
  }

  traceFileUpload(fileSize: number, fileType: string, userId?: string) {
    return this.tracer.startSpan('file.upload', {
      kind: SpanKind.CLIENT,
      attributes: {
        'component': 'external-service',
        'file.size': fileSize,
        'file.type': fileType,
        'user.id': userId,
      },
    });
  }
}

// ================================
// Performance Monitoring Spans
// ================================

export class PerformanceTracer {
  private tracer = trace.getTracer('performance', '1.0.0');

  traceSlowQuery(query: string, duration: number, threshold: number = 1000) {
    if (duration < threshold) return null;

    return this.tracer.startSpan('performance.slow_query', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'performance',
        'query.duration': duration,
        'query.threshold': threshold,
        'query.text': query.slice(0, 100), // First 100 chars
      },
    });
  }

  traceMemoryUsage(operation: string) {
    const memUsage = process.memoryUsage();
    
    return this.tracer.startSpan(`performance.memory_check.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'performance',
        'memory.rss': memUsage.rss,
        'memory.heap_used': memUsage.heapUsed,
        'memory.heap_total': memUsage.heapTotal,
        'memory.external': memUsage.external,
      },
    });
  }

  traceCachePerformance(operation: 'hit' | 'miss' | 'set' | 'eviction', key: string, duration?: number) {
    return this.tracer.startSpan(`performance.cache.${operation}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'performance',
        'cache.operation': operation,
        'cache.key_hash': this.hashKey(key),
        'cache.duration': duration,
      },
    });
  }

  private hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// ================================
// Error Tracing
// ================================

export class ErrorTracer {
  private tracer = trace.getTracer('errors', '1.0.0');

  traceError(error: Error, context: {
    operation?: string;
    userId?: string;
    requestId?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  } = {}) {
    const span = this.tracer.startSpan('error.occurred', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'error-handling',
        'error.type': error.constructor.name,
        'error.message': error.message,
        'error.operation': context.operation,
        'error.severity': context.severity || 'medium',
        'user.id': context.userId,
        'request.id': context.requestId,
      },
    });

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    span.end();
    return span;
  }

  traceValidationError(validationErrors: any[], context: { field?: string; operation?: string } = {}) {
    const span = this.tracer.startSpan('error.validation', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'component': 'error-handling',
        'error.type': 'validation',
        'error.field': context.field,
        'error.operation': context.operation,
        'error.count': validationErrors.length,
      },
    });

    validationErrors.forEach((error, index) => {
      span.addEvent('validation_error', {
        'error.index': index,
        'error.message': error.message || error,
        'error.field': error.field || error.path,
      });
    });

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Validation failed',
    });

    span.end();
    return span;
  }
}

// ================================
// Utility Functions
// ================================

export async function traceAsyncOperation<T>(
  name: string,
  operation: () => Promise<T>,
  attributes: Record<string, any> = {}
): Promise<T> {
  const tracer = trace.getTracer('async-operations', '1.0.0');
  
  const span = tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'component': 'async-operation',
      ...attributes,
    },
  });

  try {
    const result = await operation();
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
}

export function getCurrentSpan() {
  return trace.getActiveSpan();
}

export function addSpanEvent(name: string, attributes?: Record<string, any>) {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

export function setSpanAttributes(attributes: Record<string, any>) {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

// ================================
// Singleton Tracers
// ================================

export const authTracer = new AuthenticationTracer();
export const businessTracer = new BusinessLogicTracer();
export const externalTracer = new ExternalServiceTracer();
export const performanceTracer = new PerformanceTracer();
export const errorTracer = new ErrorTracer();