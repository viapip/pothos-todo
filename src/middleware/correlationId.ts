import type { H3Event } from 'h3';
import { withCorrelationId, generateCorrelationId } from '@/logger';
import { nanoid } from 'nanoid';

/**
 * Correlation ID middleware
 * Extracts or generates correlation IDs for request tracking
 */
export function correlationIdMiddleware(event: H3Event): void {
  // Try to get correlation ID from headers
  let correlationId = event.node.req.headers['x-correlation-id'] as string;
  let requestId = event.node.req.headers['x-request-id'] as string;

  // Generate if not provided
  if (!correlationId) {
    correlationId = generateCorrelationId();
  }

  if (!requestId) {
    requestId = nanoid(12);
  }

  // Set on context for other middleware/handlers
  event.context.correlationId = correlationId;
  event.context.requestId = requestId;

  // Set response headers
  event.node.res.setHeader('X-Correlation-ID', correlationId);
  event.node.res.setHeader('X-Request-ID', requestId);
}

/**
 * Wrap an async handler with correlation context
 */
export function withCorrelation<T = any>(
  handler: (event: H3Event) => Promise<T>
): (event: H3Event) => Promise<T> {
  return async (event: H3Event) => {
    const correlationId = event.context.correlationId || generateCorrelationId();
    const requestId = event.context.requestId;

    return withCorrelationId(correlationId, requestId, async () => {
      return await handler(event);
    });
  };
}