/**
 * Tracing Management Endpoints
 * HTTP endpoints for tracing monitoring and administration
 */

import { getTracingHealth } from './config.js';
import { logger } from '../../logger.js';
import { readBody } from 'h3';
import type { H3Event } from 'h3';

// ================================
// Tracing Health Endpoint
// ================================

export function createTracingHealthEndpoint() {
  return async () => {
    try {
      const health = getTracingHealth();

      return new Response(JSON.stringify({
        ...health,
        status: health.initialized ? 'healthy' : 'not_initialized',
      }, null, 2), {
        status: health.initialized ? 200 : 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Tracing health check failed', { error });
      
      return new Response(JSON.stringify({
        initialized: false,
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
// Tracing Configuration Endpoint
// ================================

export function createTracingConfigEndpoint() {
  return async () => {
    try {
      const config = {
        serviceName: process.env.OTEL_SERVICE_NAME || 'pothos-graphql-api',
        serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        
        exporters: {
          jaeger: {
            enabled: process.env.JAEGER_ENABLED === 'true',
            endpoint: process.env.JAEGER_ENDPOINT ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
          },
          otlp: {
            enabled: process.env.OTEL_EXPORTER_OTLP_ENABLED === 'true',
            endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ? '[CONFIGURED]' : '[NOT_CONFIGURED]',
          },
          console: {
            enabled: process.env.OTEL_CONSOLE_ENABLED === 'true',
          },
        },
        
        sampling: {
          ratio: parseFloat(process.env.OTEL_TRACE_SAMPLING_RATIO || '0.1'),
        },
        
        instrumentations: {
          http: process.env.OTEL_INSTRUMENTATION_HTTP !== 'false',
          graphql: process.env.OTEL_INSTRUMENTATION_GRAPHQL !== 'false',
          prisma: process.env.OTEL_INSTRUMENTATION_PRISMA !== 'false',
          redis: process.env.OTEL_INSTRUMENTATION_REDIS !== 'false',
        },
        
        metrics: {
          enabled: process.env.OTEL_METRICS_ENABLED !== 'false',
          prometheus: {
            enabled: process.env.OTEL_PROMETHEUS_ENABLED !== 'false',
            port: parseInt(process.env.OTEL_PROMETHEUS_PORT || '9464'),
          },
        },
      };

      return new Response(JSON.stringify({
        tracing: config,
        health: getTracingHealth(),
        timestamp: new Date().toISOString(),
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get tracing configuration', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get tracing configuration',
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
// Manual Span Creation Endpoint
// ================================

export function createManualSpanEndpoint() {
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
      const { name, attributes = {}, duration = 100 } = body;

      if (!name || typeof name !== 'string') {
        return new Response(JSON.stringify({
          error: 'Missing or invalid span name',
          usage: 'POST with JSON body containing "name" field and optional "attributes" and "duration"',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create a manual test span
      const { trace } = require('@opentelemetry/api');
      const tracer = trace.getTracer('manual-spans', '1.0.0');
      
      const span = tracer.startSpan(`manual.${name}`, {
        attributes: {
          'component': 'manual-testing',
          'manual.test': true,
          ...attributes,
        },
      });

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(duration, 5000))));

      span.setStatus({ code: 1 }); // OK
      span.end();

      return new Response(JSON.stringify({
        action: 'create_manual_span',
        span: {
          name: `manual.${name}`,
          attributes: {
            'component': 'manual-testing',
            'manual.test': true,
            ...attributes,
          },
          duration,
        },
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Manual span creation failed', { error });
      
      return new Response(JSON.stringify({
        error: 'Manual span creation failed',
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
// Tracing Statistics Endpoint
// ================================

export function createTracingStatsEndpoint() {
  return async () => {
    try {
      // Note: This is a simplified stats implementation
      // In a real scenario, you'd collect actual metrics from the SDK
      const stats = {
        tracing: getTracingHealth(),
        
        // Simulated statistics (would come from actual telemetry data)
        spans: {
          total: 0, // Would be collected from actual telemetry
          active: 0,
          exported: 0,
          dropped: 0,
        },
        
        exporters: {
          jaeger: {
            enabled: process.env.JAEGER_ENABLED === 'true',
            status: 'unknown', // Would check actual exporter status
          },
          otlp: {
            enabled: process.env.OTEL_EXPORTER_OTLP_ENABLED === 'true',
            status: 'unknown',
          },
          console: {
            enabled: process.env.OTEL_CONSOLE_ENABLED === 'true',
            status: 'unknown',
          },
        },
        
        sampling: {
          ratio: parseFloat(process.env.OTEL_TRACE_SAMPLING_RATIO || '0.1'),
          sampled_spans: 0,
          dropped_spans: 0,
        },
        
        performance: {
          memory_usage: process.memoryUsage(),
          uptime: process.uptime(),
        },
        
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
      logger.error('Failed to get tracing statistics', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get tracing statistics',
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
// Trace Context Endpoint
// ================================

export function createTraceContextEndpoint() {
  return async () => {
    try {
      const { trace, context } = require('@opentelemetry/api');
      const activeSpan = trace.getActiveSpan();
      
      const traceInfo = {
        hasActiveSpan: !!activeSpan,
        traceId: activeSpan?.spanContext().traceId || null,
        spanId: activeSpan?.spanContext().spanId || null,
        traceFlags: activeSpan?.spanContext().traceFlags || 0,
        contextKeys: Object.keys(context.active()),
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(traceInfo, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error('Failed to get trace context', { error });
      
      return new Response(JSON.stringify({
        error: 'Failed to get trace context',
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