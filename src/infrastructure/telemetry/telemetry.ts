import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { trace, diag } from '@opentelemetry/api';
import { DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getTelemetryConfig } from '@/config';
import { resourceFromAttributes } from '@opentelemetry/resources';

// Enable diagnostics for debugging (optional)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

let otelSDK: NodeSDK | null = null;

export function initializeTelemetry() {
  const config = getTelemetryConfig();

  if (!config.enabled) {
    console.log('Telemetry is disabled');
    return;
  }

  // Simple resource attributes for NodeSDK
  const resource = resourceFromAttributes(
    {
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
    }
  );

  // Configure trace exporter based on environment
  const traceExporter = config.exporterUrl
    ? new OTLPTraceExporter({
      url: `${config.exporterUrl}/v1/traces`,
      headers: config.exporterHeaders,
    })
    : new ConsoleSpanExporter(); // Fallback to console in development

  const spanProcessor = new BatchSpanProcessor(traceExporter);


  otelSDK = new NodeSDK({
    resource,
    serviceName: config.serviceName,
    spanProcessor,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable some auto-instrumentations that might be too verbose
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
      }),
    ],
    // Optionally add metric reader
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
    }),
  });

  // Initialize the SDK and register with the OpenTelemetry API
  otelSDK.start();

  console.log('OpenTelemetry initialized successfully');

  // Return tracer for use in application
  return trace.getTracer(config.serviceName, config.serviceVersion);
}

export async function shutdownTelemetry() {
  if (otelSDK) {
    try {
      await otelSDK.shutdown();
      console.log('OpenTelemetry shut down successfully');
    } catch (error) {
      console.error('Error shutting down OpenTelemetry:', error);
    }
  }
}

export function getTracer(name?: string) {
  const config = getTelemetryConfig();
  return trace.getTracer(name || config.serviceName, config.serviceVersion);
}