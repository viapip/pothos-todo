import { defineEventHandler, setHeader, getQuery } from 'h3';
import { performanceMonitor } from '@/infrastructure/telemetry/PerformanceMonitor.js';
import { tracingMiddleware } from '@/infrastructure/telemetry/TracingMiddleware.js';

export default defineEventHandler(
  tracingMiddleware.traceHandler('performance.dashboard', async (event) => {
    // Get query parameters
    const query = getQuery(event);
    const format = query.format || 'json';

    // Get performance metrics
    const metrics = await performanceMonitor.getMetrics();
    const anomalies = await performanceMonitor.detectAnomalies();
    const complexityAnalysis = await performanceMonitor.getComplexityAnalysis();

    const dashboard = {
      timestamp: new Date().toISOString(),
      metrics,
      anomalies,
      complexityAnalysis,
      health: {
        status: anomalies.filter(a => a.severity === 'high').length > 0 ? 'unhealthy' : 'healthy',
        errorRate: metrics.errorCount / metrics.requestCount,
        avgResponseTime: metrics.averageResponseTime,
      },
    };

    if (format === 'html') {
      setHeader(event, 'Content-Type', 'text/html');
      return generateHtmlDashboard(dashboard);
    }

    setHeader(event, 'Content-Type', 'application/json');
    return dashboard;
  })
);

function generateHtmlDashboard(data: any): string {
  const healthColor = data.health.status === 'healthy' ? '#10b981' : '#ef4444';
  const errorRateColor = data.health.errorRate > 0.05 ? '#ef4444' : '#10b981';

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Dashboard</title>
  <meta http-equiv="refresh" content="10">
  <style>
    body {
      font-family: -apple-system, system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #334155;
    }
    .health-status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      background: ${healthColor}22;
      border: 1px solid ${healthColor};
      border-radius: 8px;
      font-weight: 600;
    }
    .health-indicator {
      width: 12px;
      height: 12px;
      background: ${healthColor};
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
    }
    .card h3 {
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #94a3b8;
    }
    .metric {
      font-size: 32px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .metric-label {
      font-size: 14px;
      color: #64748b;
      margin-top: 5px;
    }
    .anomaly {
      padding: 12px;
      background: #dc262622;
      border: 1px solid #dc2626;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .anomaly.low { 
      background: #eab30822; 
      border-color: #eab308;
    }
    .anomaly.medium { 
      background: #f9731622; 
      border-color: #f97316;
    }
    .slow-query {
      padding: 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      margin-bottom: 10px;
      font-family: monospace;
      font-size: 12px;
    }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-fill {
      height: 100%;
      background: #10b981;
      transition: width 0.3s ease;
    }
    .timestamp {
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Performance Dashboard</h1>
      <div class="health-status">
        <div class="health-indicator"></div>
        ${data.health.status.toUpperCase()}
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Request Count</h3>
        <div class="metric">${data.metrics.requestCount.toLocaleString()}</div>
        <div class="metric-label">Total GraphQL requests</div>
      </div>

      <div class="card">
        <h3>Error Rate</h3>
        <div class="metric" style="color: ${errorRateColor}">
          ${(data.health.errorRate * 100).toFixed(2)}%
        </div>
        <div class="metric-label">${data.metrics.errorCount} errors</div>
      </div>

      <div class="card">
        <h3>Average Response Time</h3>
        <div class="metric">${data.metrics.averageResponseTime.toFixed(0)}ms</div>
        <div class="metric-label">Mean latency</div>
      </div>

      <div class="card">
        <h3>95th Percentile</h3>
        <div class="metric">${data.metrics.p95ResponseTime.toFixed(0)}ms</div>
        <div class="metric-label">P95 latency</div>
      </div>

      <div class="card">
        <h3>Cache Hit Rate</h3>
        <div class="metric">${(data.metrics.cacheHitRate * 100).toFixed(1)}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${data.metrics.cacheHitRate * 100}%"></div>
        </div>
      </div>

      <div class="card">
        <h3>Active Connections</h3>
        <div class="metric">${data.metrics.activeConnections}</div>
        <div class="metric-label">WebSocket connections</div>
      </div>
    </div>

    ${data.anomalies.length > 0 ? `
      <div class="card">
        <h3>Detected Anomalies</h3>
        ${data.anomalies.map((anomaly: any) => `
          <div class="anomaly ${anomaly.severity}">
            <strong>${anomaly.type.replace(/_/g, ' ').toUpperCase()}</strong><br>
            ${anomaly.message}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${data.metrics.slowQueries.length > 0 ? `
      <div class="card">
        <h3>Slow Queries</h3>
        ${data.metrics.slowQueries.slice(0, 5).map((query: any) => `
          <div class="slow-query">
            <div>${query.query.substring(0, 100)}...</div>
            <div class="timestamp">${query.duration}ms - ${new Date(query.timestamp).toLocaleTimeString()}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card">
      <h3>Query Complexity Analysis</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <div class="metric">${data.complexityAnalysis.averageComplexity.toFixed(1)}</div>
          <div class="metric-label">Average complexity</div>
        </div>
        <div>
          <div class="metric">${data.complexityAnalysis.maxComplexity}</div>
          <div class="metric-label">Maximum complexity</div>
        </div>
      </div>
    </div>

    <div class="timestamp" style="text-align: center; margin-top: 30px;">
      Last updated: ${new Date(data.timestamp).toLocaleString()} - Auto-refreshing every 10 seconds
    </div>
  </div>
</body>
</html>
  `;
}