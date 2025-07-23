/**
 * Advanced Data Analytics and Reporting System
 * Comprehensive business intelligence with real-time metrics, trend analysis, and predictive insights
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { serviceRegistry } from '@/infrastructure/microservices/ServiceRegistry.js';
import { messageBroker } from '@/infrastructure/microservices/MessageBroker.js';
import { z } from 'zod';

export interface AnalyticsMetric {
  id: string;
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary' | 'derived';
  value: number;
  dimensions: Record<string, string>;
  timestamp: Date;
  source: string;
  metadata: {
    unit?: string;
    description?: string;
    tags: string[];
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'percentile';
    percentile?: number;
  };
}

export interface AnalyticsQuery {
  id: string;
  name: string;
  description: string;
  query: {
    metrics: string[];
    dimensions: string[];
    filters: QueryFilter[];
    aggregations: QueryAggregation[];
    timeRange: {
      start: Date;
      end: Date;
      granularity: 'minute' | 'hour' | 'day' | 'week' | 'month';
    };
    limit?: number;
    orderBy?: {
      field: string;
      direction: 'asc' | 'desc';
    };
  };
  cached: boolean;
  cacheTtl: number;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'regex' | 'exists';
  value: any;
}

export interface QueryAggregation {
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct' | 'percentile' | 'stddev';
  alias?: string;
  percentile?: number;
}

export interface AnalyticsReport {
  id: string;
  name: string;
  description: string;
  type: 'dashboard' | 'kpi' | 'trend' | 'comparative' | 'predictive' | 'alert';
  schedule: {
    enabled: boolean;
    frequency: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    timezone?: string;
  };
  visualization: {
    type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | 'table' | 'gauge' | 'funnel';
    options: Record<string, any>;
  };
  queries: string[];
  recipients: string[];
  format: 'json' | 'csv' | 'pdf' | 'html' | 'excel';
  lastGenerated?: Date;
  status: 'active' | 'inactive' | 'error';
}

export interface DataPipeline {
  id: string;
  name: string;
  description: string;
  source: {
    type: 'database' | 'api' | 'file' | 'stream' | 'webhook';
    config: any;
    schedule?: string;
  };
  transformations: DataTransformation[];
  destination: {
    type: 'database' | 'warehouse' | 'cache' | 'api' | 'file';
    config: any;
  };
  status: 'running' | 'stopped' | 'error' | 'completed';
  lastRun?: Date;
  nextRun?: Date;
  statistics: {
    recordsProcessed: number;
    recordsSucceeded: number;
    recordsFailed: number;
    avgProcessingTime: number;
  };
}

export interface DataTransformation {
  id: string;
  name: string;
  type: 'filter' | 'map' | 'aggregate' | 'join' | 'sort' | 'validate' | 'enrich';
  config: any;
  order: number;
}

export interface PredictiveModel {
  id: string;
  name: string;
  type: 'linear_regression' | 'time_series' | 'classification' | 'clustering' | 'anomaly_detection';
  inputFeatures: string[];
  targetVariable: string;
  algorithm: string;
  hyperparameters: Record<string, any>;
  training: {
    dataset: string;
    trainedAt: Date;
    accuracy: number;
    metrics: Record<string, number>;
  };
  status: 'training' | 'ready' | 'retraining' | 'error';
  predictions: PredictiveResult[];
}

export interface PredictiveResult {
  id: string;
  modelId: string;
  input: Record<string, any>;
  prediction: any;
  confidence: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: {
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
    threshold: number;
    duration?: number; // in seconds
  };
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: ('email' | 'slack' | 'webhook' | 'sms')[];
  recipients: string[];
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

/**
 * Advanced analytics system for comprehensive business intelligence
 */
export class AdvancedAnalyticsSystem {
  private metrics: Map<string, AnalyticsMetric[]> = new Map();
  private queries: Map<string, AnalyticsQuery> = new Map();
  private reports: Map<string, AnalyticsReport> = new Map();
  private pipelines: Map<string, DataPipeline> = new Map();
  private models: Map<string, PredictiveModel> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private queryCache: Map<string, { result: any; expires: Date }> = new Map();
  private realTimeData: Map<string, any[]> = new Map();

  constructor() {
    this.setupValidationSchemas();
    this.setupDefaultQueries();
    this.setupDefaultReports();
    this.setupDefaultPipelines();
    this.startMetricsCollection();
    this.startReportGeneration();
    this.startAlertMonitoring();
    this.startCacheCleanup();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const analyticsQuerySchema = z.object({
      name: z.string().min(1),
      description: z.string(),
      query: z.object({
        metrics: z.array(z.string()),
        dimensions: z.array(z.string()),
        filters: z.array(z.object({
          field: z.string(),
          operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'regex', 'exists']),
          value: z.any(),
        })),
        timeRange: z.object({
          start: z.date(),
          end: z.date(),
          granularity: z.enum(['minute', 'hour', 'day', 'week', 'month']),
        }),
      }),
      cached: z.boolean(),
      cacheTtl: z.number(),
    });

    const reportSchema = z.object({
      name: z.string().min(1),
      description: z.string(),
      type: z.enum(['dashboard', 'kpi', 'trend', 'comparative', 'predictive', 'alert']),
      schedule: z.object({
        enabled: z.boolean(),
        frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'monthly']),
      }),
      queries: z.array(z.string()),
      recipients: z.array(z.string()),
      format: z.enum(['json', 'csv', 'pdf', 'html', 'excel']),
    });

    validationService.registerSchema('analyticsQuery', analyticsQuerySchema);
    validationService.registerSchema('analyticsReport', reportSchema);
  }

  /**
   * Record analytics metric
   */
  recordMetric(metric: Omit<AnalyticsMetric, 'id' | 'timestamp'>): string {
    const id = stringUtils.random(12);
    const analyticsMetric: AnalyticsMetric = {
      id,
      timestamp: new Date(),
      ...metric,
    };

    const metricKey = `${metric.name}:${metric.source}`;
    if (!this.metrics.has(metricKey)) {
      this.metrics.set(metricKey, []);
    }

    const metricHistory = this.metrics.get(metricKey)!;
    metricHistory.push(analyticsMetric);

    // Keep only last 10000 metrics per key
    if (metricHistory.length > 10000) {
      metricHistory.splice(0, metricHistory.length - 10000);
    }

    // Add to real-time data stream
    const realtimeKey = `realtime:${metric.name}`;
    if (!this.realTimeData.has(realtimeKey)) {
      this.realTimeData.set(realtimeKey, []);
    }
    
    const realtimeData = this.realTimeData.get(realtimeKey)!;
    realtimeData.push({
      value: metric.value,
      dimensions: metric.dimensions,
      timestamp: analyticsMetric.timestamp,
    });

    // Keep only last 1000 real-time data points
    if (realtimeData.length > 1000) {
      realtimeData.splice(0, realtimeData.length - 1000);
    }

    // Trigger alert checks
    this.checkAlerts(metric);

    // Send to monitoring system
    monitoring.recordMetric({
      name: 'analytics.metric.recorded',
      value: 1,
      tags: {
        metricName: metric.name,
        source: metric.source,
        type: metric.type,
      },
    });

    logger.debug('Analytics metric recorded', {
      id,
      name: metric.name,
      value: metric.value,
      source: metric.source,
    });

    return id;
  }

  /**
   * Create analytics query
   */
  createQuery(query: Omit<AnalyticsQuery, 'id'>): string {
    const id = stringUtils.random(8);
    this.queries.set(id, { id, ...query });

    logger.info('Analytics query created', {
      queryId: id,
      name: query.name,
      metrics: query.query.metrics.length,
    });

    monitoring.recordMetric({
      name: 'analytics.query.created',
      value: 1,
      tags: {
        queryName: query.name,
        cached: query.cached.toString(),
      },
    });

    return id;
  }

  /**
   * Execute analytics query
   */
  async executeQuery(queryId: string): Promise<any> {
    const query = this.queries.get(queryId);
    if (!query) {
      throw new Error(`Query not found: ${queryId}`);
    }

    const spanId = monitoring.startTrace(`analytics.query.${query.name}`);
    const startTime = Date.now();

    try {
      // Check cache if enabled
      if (query.cached) {
        const cached = this.getCachedQueryResult(queryId);
        if (cached) {
          monitoring.finishSpan(spanId, {
            success: true,
            cached: true,
            queryId,
            duration: Date.now() - startTime,
          });

          return cached;
        }
      }

      // Execute query
      const result = await this.processQuery(query);

      // Cache result if enabled
      if (query.cached) {
        this.cacheQueryResult(queryId, result, query.cacheTtl);
      }

      const duration = Date.now() - startTime;

      monitoring.finishSpan(spanId, {
        success: true,
        cached: false,
        queryId,
        duration,
        resultSize: Array.isArray(result) ? result.length : 1,
      });

      monitoring.recordMetric({
        name: 'analytics.query.executed',
        value: 1,
        tags: {
          queryId,
          queryName: query.name,
          cached: 'false',
        },
      });

      monitoring.recordMetric({
        name: 'analytics.query.duration',
        value: duration,
        tags: {
          queryId,
          queryName: query.name,
        },
        unit: 'ms',
      });

      return result;

    } catch (error) {
      monitoring.finishSpan(spanId, {
        success: false,
        queryId,
        error: String(error),
      });

      monitoring.recordMetric({
        name: 'analytics.query.error',
        value: 1,
        tags: {
          queryId,
          queryName: query.name,
          error: 'execution_failed',
        },
      });

      logger.error('Query execution failed', {
        queryId,
        queryName: query.name,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Process analytics query
   */
  private async processQuery(query: AnalyticsQuery): Promise<any> {
    const results: any[] = [];

    // Get metrics data
    for (const metricName of query.query.metrics) {
      const metricResults = await this.queryMetrics(metricName, query);
      results.push(...metricResults);
    }

    // Apply filters
    let filteredResults = this.applyFilters(results, query.query.filters);

    // Apply aggregations
    filteredResults = this.applyAggregations(filteredResults, query.query.aggregations);

    // Apply ordering
    if (query.query.orderBy) {
      filteredResults.sort((a, b) => {
        const aVal = a[query.query.orderBy!.field];
        const bVal = b[query.query.orderBy!.field];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return query.query.orderBy!.direction === 'desc' ? -comparison : comparison;
      });
    }

    // Apply limit
    if (query.query.limit) {
      filteredResults = filteredResults.slice(0, query.query.limit);
    }

    return filteredResults;
  }

  /**
   * Query metrics data
   */
  private async queryMetrics(metricName: string, query: AnalyticsQuery): Promise<any[]> {
    const results: any[] = [];
    const timeRange = query.query.timeRange;

    // Search for matching metrics
    for (const [key, metrics] of this.metrics.entries()) {
      if (key.startsWith(metricName + ':')) {
        const filteredMetrics = metrics.filter(metric =>
          metric.timestamp >= timeRange.start && 
          metric.timestamp <= timeRange.end
        );

        // Group by time granularity
        const grouped = this.groupByTimeGranularity(filteredMetrics, timeRange.granularity);
        results.push(...grouped);
      }
    }

    return results;
  }

  /**
   * Group metrics by time granularity
   */
  private groupByTimeGranularity(metrics: AnalyticsMetric[], granularity: string): any[] {
    const grouped = new Map<string, AnalyticsMetric[]>();

    for (const metric of metrics) {
      const timeKey = this.getTimeKey(metric.timestamp, granularity);
      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, []);
      }
      grouped.get(timeKey)!.push(metric);
    }

    const results: any[] = [];
    for (const [timeKey, groupMetrics] of grouped.entries()) {
      const aggregated = {
        timestamp: timeKey,
        metric: groupMetrics[0].name,
        value: groupMetrics.reduce((sum, m) => sum + m.value, 0) / groupMetrics.length,
        count: groupMetrics.length,
        dimensions: this.mergeDimensions(groupMetrics.map(m => m.dimensions)),
      };
      results.push(aggregated);
    }

    return results;
  }

  /**
   * Get time key for grouping
   */
  private getTimeKey(timestamp: Date, granularity: string): string {
    const date = new Date(timestamp);
    
    switch (granularity) {
      case 'minute':
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
      case 'hour':
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;
      case 'day':
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `${weekStart.getFullYear()}-W${Math.ceil(weekStart.getDate() / 7)}`;
      case 'month':
        return `${date.getFullYear()}-${date.getMonth() + 1}`;
      default:
        return timestamp.toISOString();
    }
  }

  /**
   * Merge dimensions from multiple metrics
   */
  private mergeDimensions(dimensionsList: Record<string, string>[]): Record<string, string> {
    const merged: Record<string, Set<string>> = {};
    
    for (const dimensions of dimensionsList) {
      for (const [key, value] of Object.entries(dimensions)) {
        if (!merged[key]) {
          merged[key] = new Set();
        }
        merged[key].add(value);
      }
    }

    const result: Record<string, string> = {};
    for (const [key, values] of Object.entries(merged)) {
      result[key] = Array.from(values).join(',');
    }

    return result;
  }

  /**
   * Apply query filters
   */
  private applyFilters(data: any[], filters: QueryFilter[]): any[] {
    return data.filter(item => {
      return filters.every(filter => {
        const value = item[filter.field];
        
        switch (filter.operator) {
          case 'eq': return value === filter.value;
          case 'ne': return value !== filter.value;
          case 'gt': return value > filter.value;
          case 'gte': return value >= filter.value;
          case 'lt': return value < filter.value;
          case 'lte': return value <= filter.value;
          case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
          case 'nin': return Array.isArray(filter.value) && !filter.value.includes(value);
          case 'regex': return new RegExp(filter.value).test(String(value));
          case 'exists': return value !== undefined && value !== null;
          default: return true;
        }
      });
    });
  }

  /**
   * Apply query aggregations
   */
  private applyAggregations(data: any[], aggregations: QueryAggregation[]): any[] {
    if (aggregations.length === 0) return data;

    const result: any = {};

    for (const agg of aggregations) {
      const values = data.map(item => item[agg.field]).filter(v => v !== undefined && v !== null);
      const alias = agg.alias || `${agg.function}_${agg.field}`;

      switch (agg.function) {
        case 'sum':
          result[alias] = values.reduce((sum, val) => sum + Number(val), 0);
          break;
        case 'avg':
          result[alias] = values.length > 0 ? values.reduce((sum, val) => sum + Number(val), 0) / values.length : 0;
          break;
        case 'min':
          result[alias] = values.length > 0 ? Math.min(...values.map(Number)) : null;
          break;
        case 'max':
          result[alias] = values.length > 0 ? Math.max(...values.map(Number)) : null;
          break;
        case 'count':
          result[alias] = values.length;
          break;
        case 'distinct':
          result[alias] = new Set(values).size;
          break;
        case 'percentile':
          if (agg.percentile && values.length > 0) {
            const sorted = values.slice().sort((a, b) => Number(a) - Number(b));
            const index = Math.ceil((agg.percentile / 100) * sorted.length) - 1;
            result[alias] = sorted[Math.max(0, index)];
          }
          break;
        case 'stddev':
          if (values.length > 1) {
            const mean = values.reduce((sum, val) => sum + Number(val), 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(Number(val) - mean, 2), 0) / values.length;
            result[alias] = Math.sqrt(variance);
          }
          break;
      }
    }

    return [result];
  }

  /**
   * Create analytics report
   */
  createReport(report: Omit<AnalyticsReport, 'id' | 'status'>): string {
    const id = stringUtils.random(8);
    this.reports.set(id, { 
      id, 
      status: 'active',
      ...report,
    });

    logger.info('Analytics report created', {
      reportId: id,
      name: report.name,
      type: report.type,
      queries: report.queries.length,
    });

    monitoring.recordMetric({
      name: 'analytics.report.created',
      value: 1,
      tags: {
        reportType: report.type,
        format: report.format,
      },
    });

    return id;
  }

  /**
   * Generate report
   */
  async generateReport(reportId: string): Promise<any> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const spanId = monitoring.startTrace(`analytics.report.${report.name}`);
    const startTime = Date.now();

    try {
      const reportData: any = {
        id: reportId,
        name: report.name,
        description: report.description,
        type: report.type,
        generatedAt: new Date(),
        data: [],
      };

      // Execute all queries for the report
      for (const queryId of report.queries) {
        try {
          const queryResult = await this.executeQuery(queryId);
          const query = this.queries.get(queryId);
          
          reportData.data.push({
            queryId,
            queryName: query?.name || queryId,
            result: queryResult,
          });
        } catch (error) {
          logger.error('Query execution failed for report', {
            reportId,
            queryId,
            error: String(error),
          });
          
          reportData.data.push({
            queryId,
            queryName: queryId,
            error: String(error),
          });
        }
      }

      // Update report status
      const reportEntry = this.reports.get(reportId)!;
      reportEntry.lastGenerated = new Date();

      const duration = Date.now() - startTime;

      monitoring.finishSpan(spanId, {
        success: true,
        reportId,
        duration,
        queriesExecuted: report.queries.length,
      });

      monitoring.recordMetric({
        name: 'analytics.report.generated',
        value: 1,
        tags: {
          reportId,
          reportType: report.type,
          format: report.format,
        },
      });

      logger.info('Report generated successfully', {
        reportId,
        reportName: report.name,
        duration,
        queriesExecuted: report.queries.length,
      });

      return reportData;

    } catch (error) {
      monitoring.finishSpan(spanId, {
        success: false,
        reportId,
        error: String(error),
      });

      monitoring.recordMetric({
        name: 'analytics.report.error',
        value: 1,
        tags: {
          reportId,
          error: 'generation_failed',
        },
      });

      throw error;
    }
  }

  /**
   * Create data pipeline
   */
  createPipeline(pipeline: Omit<DataPipeline, 'id' | 'status' | 'statistics'>): string {
    const id = stringUtils.random(8);
    this.pipelines.set(id, {
      id,
      status: 'stopped',
      statistics: {
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        avgProcessingTime: 0,
      },
      ...pipeline,
    });

    logger.info('Data pipeline created', {
      pipelineId: id,
      name: pipeline.name,
      sourceType: pipeline.source.type,
      destinationType: pipeline.destination.type,
    });

    return id;
  }

  /**
   * Run data pipeline
   */
  async runPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    pipeline.status = 'running';
    pipeline.lastRun = new Date();

    const spanId = monitoring.startTrace(`analytics.pipeline.${pipeline.name}`);
    const startTime = Date.now();

    try {
      // Simulate data processing
      const batchSize = 1000;
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      // Extract data from source
      const sourceData = await this.extractFromSource(pipeline.source);
      
      // Process in batches
      for (let i = 0; i < sourceData.length; i += batchSize) {
        const batch = sourceData.slice(i, i + batchSize);
        
        try {
          // Apply transformations
          let transformedBatch = batch;
          for (const transformation of pipeline.transformations.sort((a, b) => a.order - b.order)) {
            transformedBatch = await this.applyTransformation(transformedBatch, transformation);
          }

          // Load to destination
          await this.loadToDestination(transformedBatch, pipeline.destination);
          
          succeeded += transformedBatch.length;
        } catch (error) {
          logger.error('Pipeline batch processing failed', {
            pipelineId,
            batchStart: i,
            batchSize: batch.length,
            error: String(error),
          });
          failed += batch.length;
        }
        
        processed += batch.length;
      }

      // Update statistics
      const duration = Date.now() - startTime;
      pipeline.statistics.recordsProcessed += processed;
      pipeline.statistics.recordsSucceeded += succeeded;
      pipeline.statistics.recordsFailed += failed;
      pipeline.statistics.avgProcessingTime = (pipeline.statistics.avgProcessingTime + duration) / 2;

      pipeline.status = 'completed';

      monitoring.finishSpan(spanId, {
        success: true,
        pipelineId,
        duration,
        recordsProcessed: processed,
        recordsSucceeded: succeeded,
        recordsFailed: failed,
      });

      logger.info('Pipeline completed successfully', {
        pipelineId,
        pipelineName: pipeline.name,
        recordsProcessed: processed,
        recordsSucceeded: succeeded,
        recordsFailed: failed,
        duration,
      });

    } catch (error) {
      pipeline.status = 'error';

      monitoring.finishSpan(spanId, {
        success: false,
        pipelineId,
        error: String(error),
      });

      logger.error('Pipeline execution failed', {
        pipelineId,
        pipelineName: pipeline.name,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Extract data from source
   */
  private async extractFromSource(source: DataPipeline['source']): Promise<any[]> {
    // Simulate data extraction based on source type
    switch (source.type) {
      case 'database':
        // Simulate database query
        return Array.from({ length: 5000 }, (_, i) => ({
          id: i + 1,
          value: Math.random() * 100,
          category: ['A', 'B', 'C'][i % 3],
          timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        }));
      
      case 'api':
        // Simulate API call
        return Array.from({ length: 1000 }, (_, i) => ({
          id: i + 1,
          data: `api-data-${i}`,
          timestamp: new Date(),
        }));
      
      default:
        return [];
    }
  }

  /**
   * Apply data transformation
   */
  private async applyTransformation(data: any[], transformation: DataTransformation): Promise<any[]> {
    switch (transformation.type) {
      case 'filter':
        return data.filter(item => {
          // Apply filter logic based on config
          const { field, operator, value } = transformation.config;
          return this.evaluateFilterCondition(item[field], operator, value);
        });
        
      case 'map':
        return data.map(item => {
          // Apply mapping logic based on config
          const { mappings } = transformation.config;
          const mapped = { ...item };
          for (const [sourceField, targetField] of Object.entries(mappings)) {
            mapped[targetField] = item[sourceField];
          }
          return mapped;
        });
        
      case 'aggregate':
        // Simple aggregation example
        const { groupBy, aggregations } = transformation.config;
        const grouped = new Map();
        
        for (const item of data) {
          const key = groupBy.map((field: string) => item[field]).join('|');
          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key).push(item);
        }
        
        const aggregated = [];
        for (const [key, items] of grouped.entries()) {
          const result: any = {};
          const keyParts = key.split('|');
          groupBy.forEach((field: string, index: number) => {
            result[field] = keyParts[index];
          });
          
          for (const agg of aggregations) {
            const values = items.map((item: any) => item[agg.field]);
            switch (agg.function) {
              case 'sum':
                result[`${agg.field}_sum`] = values.reduce((sum: number, val: number) => sum + val, 0);
                break;
              case 'avg':
                result[`${agg.field}_avg`] = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
                break;
              case 'count':
                result[`${agg.field}_count`] = values.length;
                break;
            }
          }
          aggregated.push(result);
        }
        
        return aggregated;
        
      default:
        return data;
    }
  }

  /**
   * Evaluate filter condition
   */
  private evaluateFilterCondition(value: any, operator: string, threshold: any): boolean {
    switch (operator) {
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'in': return Array.isArray(threshold) && threshold.includes(value);
      default: return true;
    }
  }

  /**
   * Load data to destination
   */
  private async loadToDestination(data: any[], destination: DataPipeline['destination']): Promise<void> {
    // Simulate data loading based on destination type
    switch (destination.type) {
      case 'database':
        // Simulate database insert
        logger.debug('Loading data to database', { records: data.length });
        break;
        
      case 'warehouse':
        // Simulate data warehouse load
        logger.debug('Loading data to warehouse', { records: data.length });
        break;
        
      case 'cache':
        // Store in analytics cache
        for (const item of data) {
          const key = `analytics:${item.id || stringUtils.random(8)}`;
          this.queryCache.set(key, {
            result: item,
            expires: new Date(Date.now() + 3600000), // 1 hour
          });
        }
        break;
        
      default:
        logger.debug('Data processed', { records: data.length });
    }
  }

  /**
   * Create alert rule
   */
  createAlertRule(rule: Omit<AlertRule, 'id' | 'triggerCount'>): string {
    const id = stringUtils.random(8);
    this.alertRules.set(id, {
      id,
      triggerCount: 0,
      ...rule,
    });

    logger.info('Alert rule created', {
      ruleId: id,
      name: rule.name,
      metric: rule.metric,
      severity: rule.severity,
    });

    return id;
  }

  /**
   * Check alerts for metric
   */
  private checkAlerts(metric: AnalyticsMetric): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled || rule.metric !== metric.name) continue;

      const shouldTrigger = this.evaluateAlertCondition(metric.value, rule.condition);
      
      if (shouldTrigger) {
        this.triggerAlert(rule, metric);
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateAlertCondition(value: number, condition: AlertRule['condition']): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold;
      case 'gte': return value >= condition.threshold;
      case 'lt': return value < condition.threshold;
      case 'lte': return value <= condition.threshold;
      case 'eq': return value === condition.threshold;
      case 'ne': return value !== condition.threshold;
      default: return false;
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(rule: AlertRule, metric: AnalyticsMetric): Promise<void> {
    rule.triggerCount++;
    rule.lastTriggered = new Date();

    const alertMessage = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      metric: {
        name: metric.name,
        value: metric.value,
        threshold: rule.condition.threshold,
        operator: rule.condition.operator,
      },
      timestamp: new Date(),
    };

    // Send alert through message broker
    await messageBroker.publish('alerts', alertMessage, {
      type: 'alert',
      priority: rule.severity === 'critical' ? 'critical' : 'high',
    });

    logger.warn('Alert triggered', {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      metricName: metric.name,
      metricValue: metric.value,
      threshold: rule.condition.threshold,
    });

    monitoring.recordMetric({
      name: 'analytics.alert.triggered',
      value: 1,
      tags: {
        ruleId: rule.id,
        severity: rule.severity,
        metric: metric.name,
      },
    });
  }

  /**
   * Cache query result
   */
  private cacheQueryResult(queryId: string, result: any, ttlSeconds: number): void {
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    this.queryCache.set(queryId, { result, expires });
  }

  /**
   * Get cached query result
   */
  private getCachedQueryResult(queryId: string): any | null {
    const cached = this.queryCache.get(queryId);
    if (!cached || new Date() > cached.expires) {
      if (cached) {
        this.queryCache.delete(queryId);
      }
      return null;
    }
    return cached.result;
  }

  /**
   * Setup default queries
   */
  private setupDefaultQueries(): void {
    // System performance query
    this.createQuery({
      name: 'System Performance Overview',
      description: 'Overall system performance metrics',
      query: {
        metrics: ['system.cpu.usage', 'system.memory.usage', 'system.requests.rate'],
        dimensions: ['host', 'service'],
        filters: [],
        aggregations: [
          { field: 'value', function: 'avg', alias: 'avg_value' },
          { field: 'value', function: 'max', alias: 'max_value' },
        ],
        timeRange: {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          end: new Date(),
          granularity: 'hour',
        },
      },
      cached: true,
      cacheTtl: 300, // 5 minutes
    });

    // User activity query
    this.createQuery({
      name: 'User Activity Analysis',
      description: 'User engagement and activity patterns',
      query: {
        metrics: ['user.logins', 'user.actions', 'user.sessions'],
        dimensions: ['userId', 'userType', 'region'],
        filters: [
          { field: 'userType', operator: 'ne', value: 'bot' },
        ],
        aggregations: [
          { field: 'value', function: 'sum', alias: 'total_activity' },
          { field: 'userId', function: 'distinct', alias: 'unique_users' },
        ],
        timeRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          end: new Date(),
          granularity: 'day',
        },
      },
      cached: true,
      cacheTtl: 600, // 10 minutes
    });

    logger.info('Default analytics queries created');
  }

  /**
   * Setup default reports
   */
  private setupDefaultReports(): void {
    const queries = Array.from(this.queries.keys());
    
    if (queries.length > 0) {
      // Daily system report
      this.createReport({
        name: 'Daily System Report',
        description: 'Daily overview of system performance and user activity',
        type: 'dashboard',
        schedule: {
          enabled: true,
          frequency: 'daily',
          time: '09:00',
          timezone: 'UTC',
        },
        visualization: {
          type: 'line',
          options: {
            showLegend: true,
            showGrid: true,
          },
        },
        queries: [queries[0]],
        recipients: ['admin@example.com'],
        format: 'html',
      });

      // Weekly analytics report
      if (queries.length > 1) {
        this.createReport({
          name: 'Weekly Analytics Report',
          description: 'Comprehensive weekly analytics and trends',
          type: 'trend',
          schedule: {
            enabled: true,
            frequency: 'weekly',
            time: '10:00',
            timezone: 'UTC',
          },
          visualization: {
            type: 'bar',
            options: {
              stacked: true,
              showValues: true,
            },
          },
          queries: queries.slice(0, 2),
          recipients: ['analytics@example.com'],
          format: 'pdf',
        });
      }
    }

    logger.info('Default analytics reports created');
  }

  /**
   * Setup default pipelines
   */
  private setupDefaultPipelines(): void {
    // User analytics pipeline
    this.createPipeline({
      name: 'User Analytics ETL',
      description: 'Extract, transform, and load user analytics data',
      source: {
        type: 'database',
        config: {
          table: 'user_events',
          query: 'SELECT * FROM user_events WHERE created_at > ?',
        },
        schedule: '0 */6 * * *', // Every 6 hours
      },
      transformations: [
        {
          id: 'filter-valid',
          name: 'Filter Valid Events',
          type: 'filter',
          config: {
            field: 'event_type',
            operator: 'in',
            value: ['login', 'action', 'logout'],
          },
          order: 1,
        },
        {
          id: 'aggregate-user',
          name: 'Aggregate by User',
          type: 'aggregate',
          config: {
            groupBy: ['user_id', 'event_type'],
            aggregations: [
              { field: 'id', function: 'count' },
              { field: 'created_at', function: 'max' },
            ],
          },
          order: 2,
        },
      ],
      destination: {
        type: 'warehouse',
        config: {
          table: 'user_analytics',
          mode: 'upsert',
        },
      },
    });

    logger.info('Default data pipelines created');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Collect system metrics
      const systemMetrics = [
        { name: 'system.cpu.usage', value: Math.random() * 100 },
        { name: 'system.memory.usage', value: Math.random() * 100 },
        { name: 'system.requests.rate', value: Math.random() * 1000 },
      ];

      for (const metric of systemMetrics) {
        this.recordMetric({
          name: metric.name,
          type: 'gauge',
          value: metric.value,
          dimensions: {
            host: 'localhost',
            service: 'analytics',
          },
          source: 'system',
          metadata: {
            unit: metric.name.includes('usage') ? 'percent' : 'count',
            tags: ['system', 'monitoring'],
          },
        });
      }

      // Collect analytics system metrics
      monitoring.recordMetric({
        name: 'analytics.system.metrics_count',
        value: Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
        tags: {},
      });

      monitoring.recordMetric({
        name: 'analytics.system.queries_count',
        value: this.queries.size,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'analytics.system.cache_size',
        value: this.queryCache.size,
        tags: {},
      });

    }, 30000); // Every 30 seconds
  }

  /**
   * Start report generation
   */
  private startReportGeneration(): void {
    setInterval(async () => {
      for (const report of this.reports.values()) {
        if (!report.schedule.enabled || report.status !== 'active') continue;

        const shouldGenerate = this.shouldGenerateReport(report);
        if (shouldGenerate) {
          try {
            await this.generateReport(report.id);
          } catch (error) {
            logger.error('Scheduled report generation failed', {
              reportId: report.id,
              reportName: report.name,
              error: String(error),
            });
          }
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Check if report should be generated
   */
  private shouldGenerateReport(report: AnalyticsReport): boolean {
    if (!report.lastGenerated) return true;

    const now = new Date();
    const lastGenerated = report.lastGenerated;
    const hoursSinceLastGenerated = (now.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60);

    switch (report.schedule.frequency) {
      case 'hourly': return hoursSinceLastGenerated >= 1;
      case 'daily': return hoursSinceLastGenerated >= 24;
      case 'weekly': return hoursSinceLastGenerated >= 168; // 7 * 24
      case 'monthly': return hoursSinceLastGenerated >= 720; // 30 * 24
      default: return false;
    }
  }

  /**
   * Start alert monitoring
   */
  private startAlertMonitoring(): void {
    setInterval(() => {
      // Monitor alert rule health
      for (const rule of this.alertRules.values()) {
        monitoring.recordMetric({
          name: 'analytics.alert.rule_status',
          value: rule.enabled ? 1 : 0,
          tags: {
            ruleId: rule.id,
            severity: rule.severity,
            metric: rule.metric,
          },
        });

        monitoring.recordMetric({
          name: 'analytics.alert.trigger_count',
          value: rule.triggerCount,
          tags: {
            ruleId: rule.id,
            severity: rule.severity,
          },
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Start cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [key, cached] of this.queryCache.entries()) {
        if (now > cached.expires) {
          this.queryCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Analytics cache cleaned', { cleaned });
      }

      monitoring.recordMetric({
        name: 'analytics.cache.cleaned',
        value: cleaned,
        tags: {},
      });

    }, 300000); // Every 5 minutes
  }

  /**
   * Get analytics statistics
   */
  getAnalyticsStatistics(): {
    metrics: number;
    queries: number;
    reports: number;
    pipelines: number;
    alertRules: number;
    cacheSize: number;
    realtimeStreams: number;
  } {
    const totalMetrics = Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0);

    return {
      metrics: totalMetrics,
      queries: this.queries.size,
      reports: this.reports.size,
      pipelines: this.pipelines.size,
      alertRules: this.alertRules.size,
      cacheSize: this.queryCache.size,
      realtimeStreams: this.realTimeData.size,
    };
  }

  /**
   * Get real-time data stream
   */
  getRealTimeData(metricName: string, maxPoints: number = 100): any[] {
    const data = this.realTimeData.get(`realtime:${metricName}`);
    if (!data) return [];

    return data.slice(-maxPoints);
  }

  /**
   * Get query details
   */
  getQuery(queryId: string): AnalyticsQuery | undefined {
    return this.queries.get(queryId);
  }

  /**
   * Get report details
   */
  getReport(reportId: string): AnalyticsReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get pipeline details
   */
  getPipeline(pipelineId: string): DataPipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * Get alert rule details
   */
  getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }
}

// Export singleton instance
export const advancedAnalytics = new AdvancedAnalyticsSystem();

// Export types
export type {
  AnalyticsMetric,
  AnalyticsQuery,
  AnalyticsReport,
  DataPipeline,
  PredictiveModel,
  AlertRule,
  QueryFilter,
  QueryAggregation,
  DataTransformation,
  PredictiveResult
};