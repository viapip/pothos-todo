export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion?: string;
  environment: string;
  exporterUrl?: string;
  exporterHeaders?: Record<string, string>;
  samplingRate?: number;
}

export const telemetryConfig: TelemetryConfig = {
  enabled: process.env.TELEMETRY_ENABLED === 'true',
  serviceName: process.env.TELEMETRY_SERVICE_NAME || 'pothos-todo-api',
  serviceVersion: process.env.TELEMETRY_SERVICE_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  exporterHeaders: process.env.OTEL_EXPORTER_OTLP_HEADERS 
    ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) 
    : undefined,
  samplingRate: process.env.TELEMETRY_SAMPLING_RATE 
    ? parseFloat(process.env.TELEMETRY_SAMPLING_RATE) 
    : 1.0,
};