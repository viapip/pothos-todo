import { logger } from '@/logger.js';
import { MetricsCollector } from './MetricsCollector.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'pathe';

export interface DashboardConfig {
  name: string;
  description: string;
  panels: DashboardPanel[];
  refreshInterval: number; // seconds
  timeRange: {
    from: string;
    to: string;
  };
  variables?: DashboardVariable[];
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'heatmap' | 'gauge' | 'logs';
  width: number;
  height: number;
  position: { x: number; y: number };
  queries: PanelQuery[];
  thresholds?: Array<{ value: number; color: string; op: 'gt' | 'lt' }>;
  options?: Record<string, any>;
}

export interface PanelQuery {
  expr: string;
  legend?: string;
  refId: string;
  format?: 'time_series' | 'table' | 'heatmap';
}

export interface DashboardVariable {
  name: string;
  type: 'query' | 'custom' | 'constant';
  query?: string;
  options?: string[];
  current?: string;
}

export interface AlertRule {
  name: string;
  query: string;
  condition: string;
  threshold: number;
  duration: string; // e.g., '5m'
  severity: 'info' | 'warning' | 'critical';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
}

export interface MonitoringMetric {
  name: string;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export class AdvancedMonitoring {
  private static instance: AdvancedMonitoring;
  private dashboards = new Map<string, DashboardConfig>();
  private alertRules = new Map<string, AlertRule>();
  private metrics: MetricsCollector;
  private monitoringInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;
  private customMetrics = new Map<string, MonitoringMetric[]>();

  private constructor() {
    this.metrics = MetricsCollector.getInstance();
    this.setupDefaultDashboards();
    this.setupDefaultAlerts();
    this.startMonitoring();
  }

  public static getInstance(): AdvancedMonitoring {
    if (!AdvancedMonitoring.instance) {
      AdvancedMonitoring.instance = new AdvancedMonitoring();
    }
    return AdvancedMonitoring.instance;
  }

  /**
   * Create a custom dashboard
   */
  public createDashboard(config: DashboardConfig): void {
    this.dashboards.set(config.name, config);
    
    // Generate dashboard JSON for Grafana
    this.generateGrafanaDashboard(config);
    
    logger.info('Dashboard created', {
      name: config.name,
      panels: config.panels.length,
      refreshInterval: config.refreshInterval,
    });
  }

  /**
   * Add an alert rule
   */
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.name, rule);
    
    logger.info('Alert rule added', {
      name: rule.name,
      severity: rule.severity,
      threshold: rule.threshold,
      enabled: rule.enabled,
    });
  }

  /**
   * Record custom metric
   */
  public recordCustomMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    type: MonitoringMetric['type'] = 'gauge'
  ): void {
    const metric: MonitoringMetric = {
      name,
      value,
      timestamp: new Date(),
      labels,
      type,
    };

    if (!this.customMetrics.has(name)) {
      this.customMetrics.set(name, []);
    }

    const metrics = this.customMetrics.get(name)!;
    metrics.push(metric);

    // Keep only last 1000 metrics per name
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }

    // Also record in main metrics collector
    this.metrics.recordMetric(name, value, labels);
  }

  /**
   * Get dashboard configuration
   */
  public getDashboard(name: string): DashboardConfig | undefined {
    return this.dashboards.get(name);
  }

  /**
   * Get all dashboards
   */
  public getAllDashboards(): DashboardConfig[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Get alert rules
   */
  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get current system metrics
   */
  public async getSystemMetrics(): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: { in: number; out: number };
    uptime: number;
  }> {
    try {
      // In a real implementation, you would use system monitoring libraries
      // For now, we'll simulate system metrics
      return {
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        disk: Math.random() * 100,
        network: {
          in: Math.random() * 1000000,
          out: Math.random() * 1000000,
        },
        uptime: process.uptime(),
      };
    } catch (error) {
      logger.error('Failed to get system metrics', error as Error);
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: { in: 0, out: 0 },
        uptime: 0,
      };
    }
  }

  /**
   * Get application metrics
   */
  public async getApplicationMetrics(): Promise<{
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    activeConnections: number;
    cacheHitRate: number;
    databaseConnections: number;
  }> {
    try {
      const totalRequests = await this.metrics.getMetric('http.requests.total') || 0;
      const totalErrors = await this.metrics.getMetric('http.requests.errors') || 0;
      const responseTime = await this.metrics.getMetric('http.response.duration') || 0;
      const cacheHits = await this.metrics.getMetric('cache.hits') || 0;
      const cacheMisses = await this.metrics.getMetric('cache.misses') || 0;

      return {
        requestsPerSecond: totalRequests / 60, // Approximate RPS
        averageResponseTime: responseTime,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
        activeConnections: Math.floor(Math.random() * 100), // Simulated
        cacheHitRate: (cacheHits + cacheMisses) > 0 ? 
          (cacheHits / (cacheHits + cacheMisses)) * 100 : 0,
        databaseConnections: Math.floor(Math.random() * 20), // Simulated
      };
    } catch (error) {
      logger.error('Failed to get application metrics', error as Error);
      return {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        errorRate: 0,
        activeConnections: 0,
        cacheHitRate: 0,
        databaseConnections: 0,
      };
    }
  }

  /**
   * Generate Prometheus metrics export
   */
  public generatePrometheusMetrics(): string {
    const lines: string[] = [];
    
    // Add custom metrics
    for (const [name, metricsList] of this.customMetrics.entries()) {
      const latest = metricsList[metricsList.length - 1];
      if (latest) {
        const labelsStr = Object.entries(latest.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        
        lines.push(`# TYPE ${name} ${latest.type}`);
        lines.push(`${name}{${labelsStr}} ${latest.value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check alert conditions
   */
  private async checkAlertConditions(): Promise<void> {
    for (const [name, rule] of this.alertRules.entries()) {
      if (!rule.enabled) continue;

      try {
        const shouldAlert = await this.evaluateAlertCondition(rule);
        
        if (shouldAlert) {
          await this.triggerAlert(rule);
        }
      } catch (error) {
        logger.error('Alert condition check failed', error as Error, {
          alertName: name,
        });
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private async evaluateAlertCondition(rule: AlertRule): Promise<boolean> {
    try {
      // Parse the query and get metric value
      const metricValue = await this.executeAlertQuery(rule.query);
      
      // Evaluate condition
      switch (rule.condition) {
        case 'gt':
          return metricValue > rule.threshold;
        case 'lt':
          return metricValue < rule.threshold;
        case 'eq':
          return metricValue === rule.threshold;
        case 'ne':
          return metricValue !== rule.threshold;
        default:
          return false;
      }
    } catch (error) {
      logger.error('Failed to evaluate alert condition', error as Error, {
        alertName: rule.name,
      });
      return false;
    }
  }

  /**
   * Execute alert query
   */
  private async executeAlertQuery(query: string): Promise<number> {
    // Simple query parsing - in production, use proper PromQL parser
    if (query.includes('error_rate')) {
      const appMetrics = await this.getApplicationMetrics();
      return appMetrics.errorRate;
    }
    
    if (query.includes('response_time')) {
      const appMetrics = await this.getApplicationMetrics();
      return appMetrics.averageResponseTime;
    }
    
    if (query.includes('cpu_usage')) {
      const sysMetrics = await this.getSystemMetrics();
      return sysMetrics.cpu;
    }
    
    if (query.includes('memory_usage')) {
      const sysMetrics = await this.getSystemMetrics();
      return sysMetrics.memory;
    }

    return 0;
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(rule: AlertRule): Promise<void> {
    const alert = {
      id: `${rule.name}_${Date.now()}`,
      name: rule.name,
      severity: rule.severity,
      timestamp: new Date(),
      labels: rule.labels,
      annotations: rule.annotations,
    };

    // Log alert
    logger.warn('Alert triggered', alert);

    // Record alert metric
    this.metrics.recordMetric('alerts.triggered', 1, {
      alertName: rule.name,
      severity: rule.severity,
    });

    // In a real implementation, you would:
    // - Send to alerting systems (PagerDuty, Slack, email)
    // - Store in alert history
    // - Update alert status
  }

  /**
   * Setup default dashboards
   */
  private setupDefaultDashboards(): void {
    // System Overview Dashboard
    this.createDashboard({
      name: 'system-overview',
      description: 'System-level metrics and health indicators',
      refreshInterval: 30,
      timeRange: { from: 'now-1h', to: 'now' },
      panels: [
        {
          id: 'cpu-usage',
          title: 'CPU Usage',
          type: 'graph',
          width: 12,
          height: 8,
          position: { x: 0, y: 0 },
          queries: [
            {
              expr: 'system_cpu_usage',
              legend: 'CPU %',
              refId: 'A',
            },
          ],
          thresholds: [
            { value: 80, color: 'yellow', op: 'gt' },
            { value: 90, color: 'red', op: 'gt' },
          ],
        },
        {
          id: 'memory-usage',
          title: 'Memory Usage',
          type: 'graph',
          width: 12,
          height: 8,
          position: { x: 12, y: 0 },
          queries: [
            {
              expr: 'system_memory_usage',
              legend: 'Memory %',
              refId: 'B',
            },
          ],
        },
        {
          id: 'request-rate',
          title: 'Request Rate',
          type: 'stat',
          width: 6,
          height: 6,
          position: { x: 0, y: 8 },
          queries: [
            {
              expr: 'rate(http_requests_total[5m])',
              legend: 'RPS',
              refId: 'C',
            },
          ],
        },
        {
          id: 'error-rate',
          title: 'Error Rate',
          type: 'stat',
          width: 6,
          height: 6,
          position: { x: 6, y: 8 },
          queries: [
            {
              expr: 'rate(http_requests_errors[5m])',
              legend: 'Errors/sec',
              refId: 'D',
            },
          ],
          thresholds: [
            { value: 0.1, color: 'yellow', op: 'gt' },
            { value: 1, color: 'red', op: 'gt' },
          ],
        },
      ],
    });

    // Application Performance Dashboard
    this.createDashboard({
      name: 'application-performance',
      description: 'Application-specific performance metrics',
      refreshInterval: 15,
      timeRange: { from: 'now-30m', to: 'now' },
      panels: [
        {
          id: 'response-times',
          title: 'Response Times',
          type: 'graph',
          width: 24,
          height: 8,
          position: { x: 0, y: 0 },
          queries: [
            {
              expr: 'histogram_quantile(0.95, http_request_duration_seconds)',
              legend: '95th percentile',
              refId: 'A',
            },
            {
              expr: 'histogram_quantile(0.50, http_request_duration_seconds)',
              legend: '50th percentile',
              refId: 'B',
            },
          ],
        },
        {
          id: 'cache-performance',
          title: 'Cache Hit Rate',
          type: 'gauge',
          width: 8,
          height: 8,
          position: { x: 0, y: 8 },
          queries: [
            {
              expr: 'cache_hit_rate',
              legend: 'Hit Rate %',
              refId: 'C',
            },
          ],
          thresholds: [
            { value: 50, color: 'red', op: 'lt' },
            { value: 80, color: 'yellow', op: 'lt' },
            { value: 80, color: 'green', op: 'gt' },
          ],
        },
        {
          id: 'database-connections',
          title: 'Database Connections',
          type: 'stat',
          width: 8,
          height: 8,
          position: { x: 8, y: 8 },
          queries: [
            {
              expr: 'database_connections_active',
              legend: 'Active',
              refId: 'D',
            },
          ],
        },
        {
          id: 'graphql-operations',
          title: 'GraphQL Operations',
          type: 'table',
          width: 8,
          height: 8,
          position: { x: 16, y: 8 },
          queries: [
            {
              expr: 'topk(10, sum by (operation) (graphql_operations_total))',
              refId: 'E',
              format: 'table',
            },
          ],
        },
      ],
    });

    logger.info('Default dashboards created');
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlerts(): void {
    // High Error Rate Alert
    this.addAlertRule({
      name: 'high-error-rate',
      query: 'error_rate',
      condition: 'gt',
      threshold: 5,
      duration: '5m',
      severity: 'critical',
      labels: { team: 'backend', service: 'api' },
      annotations: {
        summary: 'High error rate detected',
        description: 'Error rate is above 5% for more than 5 minutes',
      },
      enabled: true,
    });

    // High Response Time Alert
    this.addAlertRule({
      name: 'high-response-time',
      query: 'response_time',
      condition: 'gt',
      threshold: 1000,
      duration: '3m',
      severity: 'warning',
      labels: { team: 'backend', service: 'api' },
      annotations: {
        summary: 'High response time detected',
        description: 'Average response time is above 1000ms for more than 3 minutes',
      },
      enabled: true,
    });

    // High CPU Usage Alert
    this.addAlertRule({
      name: 'high-cpu-usage',
      query: 'cpu_usage',
      condition: 'gt',
      threshold: 85,
      duration: '10m',
      severity: 'warning',
      labels: { team: 'infrastructure' },
      annotations: {
        summary: 'High CPU usage detected',
        description: 'CPU usage is above 85% for more than 10 minutes',
      },
      enabled: true,
    });

    // High Memory Usage Alert
    this.addAlertRule({
      name: 'high-memory-usage',
      query: 'memory_usage',
      condition: 'gt',
      threshold: 90,
      duration: '5m',
      severity: 'critical',
      labels: { team: 'infrastructure' },
      annotations: {
        summary: 'High memory usage detected',
        description: 'Memory usage is above 90% for more than 5 minutes',
      },
      enabled: true,
    });

    logger.info('Default alert rules created');
  }

  /**
   * Generate Grafana dashboard JSON
   */
  private generateGrafanaDashboard(config: DashboardConfig): void {
    const grafanaDashboard = {
      dashboard: {
        id: null,
        title: config.name,
        description: config.description,
        refresh: `${config.refreshInterval}s`,
        time: config.timeRange,
        panels: config.panels.map(panel => ({
          id: panel.id,
          title: panel.title,
          type: panel.type,
          gridPos: {
            x: panel.position.x,
            y: panel.position.y,
            w: panel.width,
            h: panel.height,
          },
          targets: panel.queries.map(query => ({
            expr: query.expr,
            legendFormat: query.legend,
            refId: query.refId,
          })),
          thresholds: panel.thresholds?.map(t => ({
            value: t.value,
            color: t.color,
            op: t.op,
          })),
          ...panel.options,
        })),
        templating: {
          list: config.variables || [],
        },
      },
      overwrite: true,
    };

    // Save to file
    try {
      const dashboardsDir = join(process.cwd(), 'monitoring', 'dashboards');
      if (!existsSync(dashboardsDir)) {
        mkdirSync(dashboardsDir, { recursive: true });
      }

      const dashboardFile = join(dashboardsDir, `${config.name}.json`);
      writeFileSync(dashboardFile, JSON.stringify(grafanaDashboard, null, 2));

      logger.info('Grafana dashboard generated', {
        name: config.name,
        file: dashboardFile,
      });
    } catch (error) {
      logger.error('Failed to generate Grafana dashboard', error as Error, {
        dashboardName: config.name,
      });
    }
  }

  /**
   * Start monitoring and alerting
   */
  private startMonitoring(): void {
    // Collect system metrics
    this.monitoringInterval = setInterval(async () => {
      const sysMetrics = await this.getSystemMetrics();
      const appMetrics = await this.getApplicationMetrics();

      // Record system metrics
      this.recordCustomMetric('system_cpu_usage', sysMetrics.cpu, { type: 'system' });
      this.recordCustomMetric('system_memory_usage', sysMetrics.memory, { type: 'system' });
      this.recordCustomMetric('system_disk_usage', sysMetrics.disk, { type: 'system' });
      this.recordCustomMetric('system_uptime', sysMetrics.uptime, { type: 'system' });

      // Record application metrics
      this.recordCustomMetric('app_requests_per_second', appMetrics.requestsPerSecond, { type: 'application' });
      this.recordCustomMetric('app_response_time', appMetrics.averageResponseTime, { type: 'application' });
      this.recordCustomMetric('app_error_rate', appMetrics.errorRate, { type: 'application' });
      this.recordCustomMetric('app_cache_hit_rate', appMetrics.cacheHitRate, { type: 'application' });

    }, 15000); // Every 15 seconds

    // Check alerts
    this.alertCheckInterval = setInterval(() => {
      this.checkAlertConditions();
    }, 60000); // Every minute

    logger.info('Advanced monitoring started');
  }

  /**
   * Shutdown monitoring
   */
  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = undefined;
    }

    logger.info('Advanced monitoring shutdown completed');
  }
}

/**
 * Create monitoring middleware
 */
export function createMonitoringMiddleware() {
  const monitoring = AdvancedMonitoring.getInstance();

  return (context: any) => {
    // Add monitoring context
    context.monitoring = {
      recordMetric: monitoring.recordCustomMetric.bind(monitoring),
      getDashboard: monitoring.getDashboard.bind(monitoring),
      getSystemMetrics: monitoring.getSystemMetrics.bind(monitoring),
      getApplicationMetrics: monitoring.getApplicationMetrics.bind(monitoring),
    };
  };
}