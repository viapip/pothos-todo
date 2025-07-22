/**
 * OpenTelemetry Configuration
 * Comprehensive distributed tracing setup for the GraphQL application
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { logger } from '../../logger.js';

// ================================
// Configuration Types
// ================================

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  exporters: {
    jaeger: {
      enabled: boolean;
      endpoint: string;
    };
    otlp: {
      enabled: boolean;
      endpoint: string;
      headers?: Record<string, string>;
    };
    console: {
      enabled: boolean;
    };
  };
  sampling: {
    ratio: number; // 0.0 to 1.0
  };
  instrumentations: {
    http: boolean;
    graphql: boolean;
    prisma: boolean;
    redis: boolean;
  };
  metrics: {
    enabled: boolean;
    prometheus: {
      enabled: boolean;
      port: number;
    };
  };
}

// ================================
// Default Configuration
// ================================

export function createTracingConfig(): TracingConfig {
  const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';

  return {
    serviceName: process.env.OTEL_SERVICE_NAME || 'pothos-graphql-api',
    serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    
    exporters: {
      jaeger: {
        enabled: process.env.JAEGER_ENABLED === 'true' || isDevelopment,
        endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      },
      otlp: {
        enabled: process.env.OTEL_EXPORTER_OTLP_ENABLED === 'true' || isProduction,
        endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
        headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
          JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : undefined,
      },
      console: {
        enabled: process.env.OTEL_CONSOLE_ENABLED === 'true' || isDevelopment,
      },
    },
    
    sampling: {
      ratio: parseFloat(process.env.OTEL_TRACE_SAMPLING_RATIO || (isDevelopment ? '1.0' : '0.1')),
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
}

// ================================
// OpenTelemetry SDK Setup
// ================================

let tracingInitialized = false;
let nodeSDK: NodeSDK | null = null;

export function initializeTracing(config?: Partial<TracingConfig>): NodeSDK {
  if (tracingInitialized) {
    logger.warn('OpenTelemetry tracing already initialized');
    return nodeSDK!;
  }

  const tracingConfig = {
    ...createTracingConfig(),
    ...config,
  };

  logger.info('Initializing OpenTelemetry tracing', {
    serviceName: tracingConfig.serviceName,
    environment: tracingConfig.environment,
    samplingRatio: tracingConfig.sampling.ratio,
  });

  // Create resource
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: tracingConfig.serviceName,
    [ATTR_SERVICE_VERSION]: tracingConfig.serviceVersion,
    'deployment.environment': tracingConfig.environment,
  });

  // Setup exporters
  const spanExporters = [];
  
  if (tracingConfig.exporters.jaeger.enabled) {
    try {
      const jaegerExporter = new JaegerExporter({
        endpoint: tracingConfig.exporters.jaeger.endpoint,
      });
      spanExporters.push(jaegerExporter);
      logger.info('Jaeger exporter configured', { 
        endpoint: tracingConfig.exporters.jaeger.endpoint 
      });
    } catch (error) {
      logger.error('Failed to configure Jaeger exporter', { error });
    }
  }

  if (tracingConfig.exporters.otlp.enabled) {
    try {
      const otlpExporter = new OTLPTraceExporter({
        url: tracingConfig.exporters.otlp.endpoint,
        headers: tracingConfig.exporters.otlp.headers,
      });
      spanExporters.push(otlpExporter);
      logger.info('OTLP exporter configured', { 
        endpoint: tracingConfig.exporters.otlp.endpoint 
      });
    } catch (error) {
      logger.error('Failed to configure OTLP exporter', { error });
    }
  }

  if (tracingConfig.exporters.console.enabled) {
    const consoleExporter = new ConsoleSpanExporter();
    spanExporters.push(consoleExporter);
    logger.info('Console exporter configured');
  }

  // Setup span processors
  const spanProcessors = spanExporters.map(exporter => 
    tracingConfig.environment === 'development' 
      ? new SimpleSpanProcessor(exporter)
      : new BatchSpanProcessor(exporter)
  );

  // Setup instrumentations
  const instrumentations = [];

  if (tracingConfig.instrumentations.http) {
    instrumentations.push(new HttpInstrumentation({
      responseHook: (span, response) => {
        span.setAttributes({
          'http.response.size': response.headers['content-length'],
        });
      },
    }));
  }

  if (tracingConfig.instrumentations.graphql) {
    instrumentations.push(new GraphQLInstrumentation({
      mergeItems: true,
      depth: 2,
      allowValues: tracingConfig.environment === 'development',
    }));
  }

  if (tracingConfig.instrumentations.prisma) {
    instrumentations.push(new PrismaInstrumentation());
  }

  if (tracingConfig.instrumentations.redis) {
    instrumentations.push(new RedisInstrumentation({
      dbStatementSerializer: (cmdName, cmdArgs) => {
        return tracingConfig.environment === 'development' 
          ? `${cmdName} ${cmdArgs.slice(0, 2).join(' ')}`
          : cmdName;
      },
    }));
  }

  // Setup metrics (if enabled)
  let metricExporters = [];
  if (tracingConfig.metrics.enabled) {
    if (tracingConfig.metrics.prometheus.enabled) {
      const prometheusExporter = new PrometheusExporter({
        port: tracingConfig.metrics.prometheus.port,
      });
      metricExporters.push(prometheusExporter);
    }
  }

  // Create SDK
  nodeSDK = new NodeSDK({
    resource,
    spanProcessors,
    instrumentations,
    ...(metricExporters.length > 0 && {
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporters[0], // Use first exporter
        exportIntervalMillis: 30000,
      }),
    }),
  });

  // Start the SDK
  try {
    nodeSDK.start();
    tracingInitialized = true;
    
    logger.info('OpenTelemetry tracing initialized successfully', {
      exporters: spanExporters.length,
      instrumentations: instrumentations.length,
      metrics: tracingConfig.metrics.enabled,
    });
    
    // Setup graceful shutdown
    process.on('SIGTERM', () => shutdownTracing());
    process.on('SIGINT', () => shutdownTracing());
    
  } catch (error) {
    logger.error('Failed to start OpenTelemetry SDK', { error });
    throw error;
  }

  return nodeSDK;
}

// ================================
// Tracing Utilities
// ================================

export function getTracer(name: string, version?: string) {
  const { trace } = require('@opentelemetry/api');
  return trace.getTracer(name, version);
}

export function createSpan(tracer: any, name: string, attributes?: Record<string, any>) {
  const span = tracer.startSpan(name, {
    attributes: {
      'component': 'graphql-api',
      ...attributes,
    },
  });
  
  return {
    span,
    finish: (error?: Error) => {
      if (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message }); // ERROR
      } else {
        span.setStatus({ code: 1 }); // OK
      }
      span.end();
    },
  };
}

// ================================
// Custom Span Decorators
// ================================

export function traceFunction(name?: string, attributes?: Record<string, any>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const spanName = name || `${target.constructor.name}.${propertyKey}`;
    
    descriptor.value = async function (...args: any[]) {
      const tracer = getTracer('custom-functions');
      const { span, finish } = createSpan(tracer, spanName, {
        'function.name': propertyKey,
        'function.class': target.constructor.name,
        ...attributes,
      });
      
      try {
        const result = await originalMethod.apply(this, args);
        finish();
        return result;
      } catch (error) {
        finish(error as Error);
        throw error;
      }
    };
    
    return descriptor;
  };
}

export function traceAsyncFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string,
  attributes?: Record<string, any>
): T {
  return (async (...args: any[]) => {
    const tracer = getTracer('async-functions');
    const { span, finish } = createSpan(tracer, name, attributes);
    
    try {
      const result = await fn(...args);
      finish();
      return result;
    } catch (error) {
      finish(error as Error);
      throw error;
    }
  }) as T;
}

// ================================
// Shutdown
// ================================

export async function shutdownTracing(): Promise<void> {
  if (!tracingInitialized || !nodeSDK) {
    logger.warn('OpenTelemetry tracing not initialized or already shut down');
    return;
  }
  
  logger.info('Shutting down OpenTelemetry tracing');
  
  try {
    await nodeSDK.shutdown();
    tracingInitialized = false;
    nodeSDK = null;
    
    logger.info('OpenTelemetry tracing shutdown completed');
  } catch (error) {
    logger.error('Error during OpenTelemetry shutdown', { error });
    throw error;
  }
}

// ================================
// Health Check
// ================================

export function getTracingHealth() {
  return {
    initialized: tracingInitialized,
    timestamp: new Date().toISOString(),
  };
}