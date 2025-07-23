/**
 * Advanced Database Optimization and Caching System
 * Comprehensive database performance optimization with intelligent caching and query analysis
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { storage } from '@/lib/unjs-utils.js';
import { z } from 'zod';

export interface QueryMetrics {
  id: string;
  sql: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  table: string;
  duration: number;
  rowsAffected: number;
  timestamp: Date;
  userId?: string;
  cached: boolean;
  fromPool: boolean;
  connectionId?: string;
}

export interface CacheEntry {
  key: string;
  value: any;
  ttl: number;
  created: Date;
  accessed: Date;
  hits: number;
  tags: string[];
  size: number;
}

export interface QueryPlan {
  query: string;
  plan: any;
  cost: number;
  optimizations: string[];
  indexes: string[];
  warnings: string[];
}

export interface DatabaseHealth {
  connections: {
    active: number;
    idle: number;
    max: number;
    usage: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    qps: number; // queries per second
    cacheHitRate: number;
  };
  storage: {
    size: string;
    growth: string;
    fragmentation: number;
  };
  locks: {
    waiting: number;
    blocking: number;
  };
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist';
  impact: 'high' | 'medium' | 'low';
  reason: string;
  queries: string[];
  estimatedImprovement: number;
}

/**
 * Advanced database optimization system
 */
export class DatabaseOptimizationSystem {
  private queryMetrics: Map<string, QueryMetrics[]> = new Map();
  private cacheStore: Map<string, CacheEntry> = new Map();
  private queryPlans: Map<string, QueryPlan> = new Map();
  private connectionPool: Map<string, { id: string; created: Date; lastUsed: Date; queries: number }> = new Map();
  private slowQueryThreshold = 1000; // 1 second
  private cacheMaxSize = 100 * 1024 * 1024; // 100MB
  private retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.setupValidationSchemas();
    this.startMetricsCollection();
    this.startCacheEviction();
    this.startQueryAnalysis();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const queryMetricsSchema = z.object({
      sql: z.string().min(1),
      operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT']),
      table: z.string(),
      duration: z.number().min(0),
      rowsAffected: z.number().min(0),
      userId: z.string().optional(),
      cached: z.boolean().default(false),
    });

    const cacheEntrySchema = z.object({
      key: z.string().min(1),
      value: z.any(),
      ttl: z.number().min(0),
      tags: z.array(z.string()).default([]),
    });

    validationService.registerSchema('queryMetrics', queryMetricsSchema);
    validationService.registerSchema('cacheEntry', cacheEntrySchema);
  }

  /**
   * Record query execution metrics
   */
  recordQuery(metrics: Omit<QueryMetrics, 'id' | 'timestamp'>): void {
    const queryMetric: QueryMetrics = {
      id: stringUtils.random(8),
      timestamp: new Date(),
      ...metrics,
    };

    const tableKey = metrics.table;
    if (!this.queryMetrics.has(tableKey)) {
      this.queryMetrics.set(tableKey, []);
    }

    const tableMetrics = this.queryMetrics.get(tableKey)!;
    tableMetrics.push(queryMetric);

    // Keep only recent metrics
    const cutoff = Date.now() - this.retentionPeriod;
    this.queryMetrics.set(
      tableKey,
      tableMetrics.filter(m => m.timestamp.getTime() > cutoff)
    );

    // Record monitoring metrics
    monitoring.recordMetric({
      name: 'database.query.duration',
      value: metrics.duration,
      tags: {
        operation: metrics.operation,
        table: metrics.table,
        cached: metrics.cached.toString(),
      },
      unit: 'ms',
    });

    monitoring.recordMetric({
      name: 'database.query.rows',
      value: metrics.rowsAffected,
      tags: {
        operation: metrics.operation,
        table: metrics.table,
      },
    });

    // Check for slow queries
    if (metrics.duration > this.slowQueryThreshold) {
      this.handleSlowQuery(queryMetric);
    }

    logger.debug('Query metrics recorded', {
      id: queryMetric.id,
      operation: metrics.operation,
      table: metrics.table,
      duration: metrics.duration,
      cached: metrics.cached,
    });
  }

  /**
   * Intelligent caching with tags and TTL
   */
  async setCache(
    key: string,
    value: any,
    options: {
      ttl?: number;
      tags?: string[];
      compress?: boolean;
    } = {}
  ): Promise<void> {
    const {
      ttl = 300000, // 5 minutes default
      tags = [],
      compress = true,
    } = options;

    // Calculate size
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');

    // Check cache size limits
    if (this.getCurrentCacheSize() + size > this.cacheMaxSize) {
      await this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry = {
      key,
      value: compress ? this.compressValue(value) : value,
      ttl,
      created: new Date(),
      accessed: new Date(),
      hits: 0,
      tags,
      size,
    };

    this.cacheStore.set(key, entry);

    // Record cache metrics
    monitoring.recordMetric({
      name: 'database.cache.set',
      value: 1,
      tags: { compressed: compress.toString() },
    });

    monitoring.recordMetric({
      name: 'database.cache.size',
      value: size,
      tags: { key, compressed: compress.toString() },
      unit: 'bytes',
    });

    logger.debug('Cache entry created', { key, size, ttl, tags });
  }

  /**
   * Get cached value with hit tracking
   */
  async getCache<T = any>(key: string): Promise<T | null> {
    const entry = this.cacheStore.get(key);
    
    if (!entry) {
      monitoring.recordMetric({
        name: 'database.cache.miss',
        value: 1,
        tags: { key },
      });
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now > entry.created.getTime() + entry.ttl) {
      this.cacheStore.delete(key);
      monitoring.recordMetric({
        name: 'database.cache.expired',
        value: 1,
        tags: { key },
      });
      return null;
    }

    // Update access statistics
    entry.accessed = new Date();
    entry.hits++;

    // Record cache hit
    monitoring.recordMetric({
      name: 'database.cache.hit',
      value: 1,
      tags: { key },
    });

    logger.debug('Cache hit', { key, hits: entry.hits });

    return this.decompressValue(entry.value) as T;
  }

  /**
   * Invalidate cache by key or tags
   */
  async invalidateCache(options: { key?: string; tags?: string[]; pattern?: RegExp }): Promise<number> {
    let invalidated = 0;

    for (const [cacheKey, entry] of this.cacheStore.entries()) {
      let shouldInvalidate = false;

      if (options.key && cacheKey === options.key) {
        shouldInvalidate = true;
      }

      if (options.tags && options.tags.some(tag => entry.tags.includes(tag))) {
        shouldInvalidate = true;
      }

      if (options.pattern && options.pattern.test(cacheKey)) {
        shouldInvalidate = true;
      }

      if (shouldInvalidate) {
        this.cacheStore.delete(cacheKey);
        invalidated++;
      }
    }

    monitoring.recordMetric({
      name: 'database.cache.invalidated',
      value: invalidated,
      tags: {},
    });

    logger.debug('Cache invalidated', { invalidated, options });
    return invalidated;
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance(table?: string): Promise<{
    slowQueries: QueryMetrics[];
    recommendations: IndexRecommendation[];
    patterns: {
      mostFrequent: Array<{ sql: string; count: number; avgDuration: number }>;
      slowest: Array<{ sql: string; maxDuration: number; count: number }>;
    };
    cacheOpportunities: Array<{ query: string; frequency: number; avgDuration: number }>;
  }> {
    const allMetrics = table 
      ? (this.queryMetrics.get(table) || [])
      : Array.from(this.queryMetrics.values()).flat();

    // Find slow queries
    const slowQueries = allMetrics.filter(m => m.duration > this.slowQueryThreshold);

    // Group queries by SQL to find patterns
    const queryGroups = new Map<string, QueryMetrics[]>();
    allMetrics.forEach(metric => {
      const normalizedSql = this.normalizeSQL(metric.sql);
      if (!queryGroups.has(normalizedSql)) {
        queryGroups.set(normalizedSql, []);
      }
      queryGroups.get(normalizedSql)!.push(metric);
    });

    // Find most frequent queries
    const mostFrequent = Array.from(queryGroups.entries())
      .map(([sql, metrics]) => ({
        sql,
        count: metrics.length,
        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Find slowest queries
    const slowest = Array.from(queryGroups.entries())
      .map(([sql, metrics]) => ({
        sql,
        maxDuration: Math.max(...metrics.map(m => m.duration)),
        count: metrics.length,
      }))
      .sort((a, b) => b.maxDuration - a.maxDuration)
      .slice(0, 10);

    // Identify cache opportunities (frequent SELECT queries)
    const cacheOpportunities = Array.from(queryGroups.entries())
      .filter(([sql, metrics]) => 
        metrics[0].operation === 'SELECT' && 
        metrics.length > 5 &&
        !metrics[0].cached
      )
      .map(([query, metrics]) => ({
        query,
        frequency: metrics.length,
        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
      }))
      .sort((a, b) => b.frequency * b.avgDuration - a.frequency * a.avgDuration)
      .slice(0, 5);

    // Generate index recommendations
    const recommendations = await this.generateIndexRecommendations(slowQueries);

    return {
      slowQueries: slowQueries.slice(0, 20),
      recommendations,
      patterns: { mostFrequent, slowest },
      cacheOpportunities,
    };
  }

  /**
   * Get database health metrics
   */
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const recentMetrics = Array.from(this.queryMetrics.values())
      .flat()
      .filter(m => Date.now() - m.timestamp.getTime() < 3600000); // Last hour

    const avgQueryTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    const slowQueries = recentMetrics.filter(m => m.duration > this.slowQueryThreshold).length;
    const qps = recentMetrics.length / 60; // Approximate QPS over last hour

    const totalCacheRequests = Array.from(this.cacheStore.values())
      .reduce((sum, entry) => sum + entry.hits + 1, 0); // +1 for initial set
    const cacheHits = Array.from(this.cacheStore.values())
      .reduce((sum, entry) => sum + entry.hits, 0);
    const cacheHitRate = totalCacheRequests > 0 ? cacheHits / totalCacheRequests : 0;

    return {
      connections: {
        active: this.connectionPool.size,
        idle: Math.max(0, 10 - this.connectionPool.size), // Mock idle connections
        max: 20, // Mock max connections
        usage: this.connectionPool.size / 20,
      },
      performance: {
        avgQueryTime,
        slowQueries,
        qps,
        cacheHitRate,
      },
      storage: {
        size: '2.5GB', // Mock storage size
        growth: '+45MB/day', // Mock growth rate
        fragmentation: 0.15, // Mock fragmentation
      },
      locks: {
        waiting: 0, // Mock waiting locks
        blocking: 0, // Mock blocking locks
      },
    };
  }

  /**
   * Create database connection pool monitor
   */
  createConnectionPoolMiddleware() {
    return {
      beforeQuery: (connectionId: string) => {
        if (!this.connectionPool.has(connectionId)) {
          this.connectionPool.set(connectionId, {
            id: connectionId,
            created: new Date(),
            lastUsed: new Date(),
            queries: 0,
          });
        }

        const connection = this.connectionPool.get(connectionId)!;
        connection.lastUsed = new Date();
        connection.queries++;

        monitoring.recordMetric({
          name: 'database.connection.query',
          value: 1,
          tags: { connectionId },
        });
      },

      afterQuery: (connectionId: string, duration: number, error?: Error) => {
        const connection = this.connectionPool.get(connectionId);
        if (connection) {
          monitoring.recordMetric({
            name: 'database.connection.duration',
            value: duration,
            tags: { 
              connectionId,
              error: error ? 'true' : 'false',
            },
            unit: 'ms',
          });
        }
      },

      onConnectionClose: (connectionId: string) => {
        const connection = this.connectionPool.get(connectionId);
        if (connection) {
          const lifetime = Date.now() - connection.created.getTime();
          
          monitoring.recordMetric({
            name: 'database.connection.lifetime',
            value: lifetime,
            tags: { connectionId },
            unit: 'ms',
          });

          monitoring.recordMetric({
            name: 'database.connection.queries_total',
            value: connection.queries,
            tags: { connectionId },
          });

          this.connectionPool.delete(connectionId);
        }
      },
    };
  }

  /**
   * Generate automated index recommendations
   */
  private async generateIndexRecommendations(slowQueries: QueryMetrics[]): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];
    const queryPatterns = new Map<string, { queries: QueryMetrics[]; columns: Set<string> }>();

    // Analyze slow queries for patterns
    slowQueries.forEach(query => {
      const table = query.table;
      if (!queryPatterns.has(table)) {
        queryPatterns.set(table, { queries: [], columns: new Set() });
      }

      const pattern = queryPatterns.get(table)!;
      pattern.queries.push(query);

      // Extract WHERE clause columns (simplified)
      const whereColumns = this.extractWhereColumns(query.sql);
      whereColumns.forEach(col => pattern.columns.add(col));
    });

    // Generate recommendations for each table
    for (const [table, pattern] of queryPatterns.entries()) {
      if (pattern.columns.size > 0) {
        const avgDuration = pattern.queries.reduce((sum, q) => sum + q.duration, 0) / pattern.queries.length;
        const estimatedImprovement = Math.min(0.8, avgDuration / 1000); // Max 80% improvement

        recommendations.push({
          table,
          columns: Array.from(pattern.columns),
          type: 'btree',
          impact: avgDuration > 5000 ? 'high' : avgDuration > 2000 ? 'medium' : 'low',
          reason: `Frequent WHERE clause usage on these columns in ${pattern.queries.length} slow queries`,
          queries: pattern.queries.slice(0, 3).map(q => q.sql),
          estimatedImprovement,
        });
      }
    }

    return recommendations.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }

  /**
   * Handle slow query detection
   */
  private handleSlowQuery(query: QueryMetrics): void {
    logger.warn('Slow query detected', {
      id: query.id,
      duration: query.duration,
      table: query.table,
      operation: query.operation,
      sql: query.sql.substring(0, 200),
    });

    // Record slow query alert
    monitoring.recordMetric({
      name: 'database.slow_query',
      value: 1,
      tags: {
        table: query.table,
        operation: query.operation,
        duration_category: query.duration > 5000 ? 'critical' : 'warning',
      },
    });

    // Auto-analyze query plan for very slow queries
    if (query.duration > 5000) { // 5 seconds
      this.analyzeQueryPlan(query.sql, query.table);
    }
  }

  /**
   * Analyze query execution plan
   */
  private async analyzeQueryPlan(sql: string, table: string): Promise<void> {
    try {
      // Mock query plan analysis
      const queryPlan: QueryPlan = {
        query: sql,
        plan: {
          nodeType: 'Seq Scan',
          relation: table,
          cost: 1250.45,
          rows: 1000,
        },
        cost: 1250.45,
        optimizations: [
          'Consider adding index on WHERE clause columns',
          'Query could benefit from LIMIT clause',
        ],
        indexes: [`CREATE INDEX idx_${table}_optimized ON ${table} (column1, column2)`],
        warnings: [
          'Sequential scan detected - consider indexing',
          'High cost estimate',
        ],
      };

      const planKey = objectUtils.hash(sql);
      this.queryPlans.set(planKey, queryPlan);

      logger.info('Query plan analyzed', {
        table,
        cost: queryPlan.cost,
        optimizations: queryPlan.optimizations.length,
        warnings: queryPlan.warnings.length,
      });

    } catch (error) {
      logger.error('Query plan analysis failed', { sql, error });
    }
  }

  /**
   * Extract WHERE clause columns (simplified)
   */
  private extractWhereColumns(sql: string): string[] {
    const columns: string[] = [];
    
    // Simple regex to find WHERE clause columns
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      
      // Extract column names (simplified - real implementation would use SQL parser)
      const columnMatches = whereClause.match(/(\w+)\s*[=<>!]/g);
      if (columnMatches) {
        columnMatches.forEach(match => {
          const column = match.replace(/\s*[=<>!].*/, '').trim();
          if (column && !columns.includes(column)) {
            columns.push(column);
          }
        });
      }
    }

    return columns;
  }

  /**
   * Normalize SQL for pattern analysis
   */
  private normalizeSQL(sql: string): string {
    return sql
      .replace(/\s+/g, ' ')
      .replace(/\d+/g, '?')
      .replace(/'[^']*'/g, '?')
      .replace(/"/g, '')
      .trim()
      .toLowerCase();
  }

  /**
   * Compress cache value
   */
  private compressValue(value: any): any {
    // Simple compression - in production would use actual compression
    const serialized = JSON.stringify(value);
    return serialized.length > 1000 ? `compressed:${serialized}` : value;
  }

  /**
   * Decompress cache value
   */
  private decompressValue(value: any): any {
    if (typeof value === 'string' && value.startsWith('compressed:')) {
      return JSON.parse(value.substring(11));
    }
    return value;
  }

  /**
   * Get current cache size
   */
  private getCurrentCacheSize(): number {
    return Array.from(this.cacheStore.values())
      .reduce((total, entry) => total + entry.size, 0);
  }

  /**
   * Evict least recently used cache entries
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    const entries = Array.from(this.cacheStore.entries())
      .sort(([, a], [, b]) => a.accessed.getTime() - b.accessed.getTime());

    const toEvict = Math.ceil(entries.length * 0.1); // Evict 10%
    
    for (let i = 0; i < toEvict && entries.length > 0; i++) {
      const [key] = entries[i];
      this.cacheStore.delete(key);
    }

    monitoring.recordMetric({
      name: 'database.cache.evicted',
      value: toEvict,
      tags: { reason: 'lru' },
    });

    logger.debug('Cache LRU eviction', { evicted: toEvict });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      const health = this.getDatabaseHealth();
      
      // Record database health metrics
      monitoring.recordMetric({
        name: 'database.connections.active',
        value: health.connections.active,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'database.performance.avg_query_time',
        value: health.performance.avgQueryTime,
        tags: {},
        unit: 'ms',
      });

      monitoring.recordMetric({
        name: 'database.performance.qps',
        value: health.performance.qps,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'database.cache.hit_rate',
        value: health.performance.cacheHitRate,
        tags: {},
      });

      monitoring.recordMetric({
        name: 'database.cache.total_size',
        value: this.getCurrentCacheSize(),
        tags: {},
        unit: 'bytes',
      });

    }, 60000); // Every minute
  }

  /**
   * Start cache eviction process
   */
  private startCacheEviction(): void {
    setInterval(() => {
      const now = Date.now();
      let expired = 0;

      for (const [key, entry] of this.cacheStore.entries()) {
        if (now > entry.created.getTime() + entry.ttl) {
          this.cacheStore.delete(key);
          expired++;
        }
      }

      if (expired > 0) {
        monitoring.recordMetric({
          name: 'database.cache.expired',
          value: expired,
          tags: { reason: 'ttl' },
        });

        logger.debug('Cache TTL cleanup', { expired });
      }

    }, 30000); // Every 30 seconds
  }

  /**
   * Start query analysis
   */
  private startQueryAnalysis(): void {
    setInterval(async () => {
      try {
        const analysis = await this.analyzeQueryPerformance();
        
        logger.info('Database performance analysis', {
          slowQueries: analysis.slowQueries.length,
          recommendations: analysis.recommendations.length,
          cacheOpportunities: analysis.cacheOpportunities.length,
        });

        // Log top recommendations
        analysis.recommendations.slice(0, 3).forEach(rec => {
          logger.info('Index recommendation', {
            table: rec.table,
            columns: rec.columns,
            impact: rec.impact,
            improvement: `${(rec.estimatedImprovement * 100).toFixed(1)}%`,
          });
        });

      } catch (error) {
        logger.error('Query analysis failed', { error });
      }

    }, 300000); // Every 5 minutes
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    queries: {
      total: number;
      slow: number;
      cached: number;
      avgDuration: number;
    };
    cache: {
      entries: number;
      size: number;
      hitRate: number;
      evictions: number;
    };
    connections: {
      active: number;
      total: number;
      avgLifetime: number;
    };
    recommendations: {
      indexes: number;
      highImpact: number;
    };
  } {
    const allMetrics = Array.from(this.queryMetrics.values()).flat();
    const slowQueries = allMetrics.filter(m => m.duration > this.slowQueryThreshold);
    const cachedQueries = allMetrics.filter(m => m.cached);

    const totalCacheRequests = Array.from(this.cacheStore.values())
      .reduce((sum, entry) => sum + entry.hits + 1, 0);
    const cacheHits = Array.from(this.cacheStore.values())
      .reduce((sum, entry) => sum + entry.hits, 0);

    return {
      queries: {
        total: allMetrics.length,
        slow: slowQueries.length,
        cached: cachedQueries.length,
        avgDuration: allMetrics.length > 0 
          ? allMetrics.reduce((sum, m) => sum + m.duration, 0) / allMetrics.length 
          : 0,
      },
      cache: {
        entries: this.cacheStore.size,
        size: this.getCurrentCacheSize(),
        hitRate: totalCacheRequests > 0 ? cacheHits / totalCacheRequests : 0,
        evictions: 0, // Would track evictions in real implementation
      },
      connections: {
        active: this.connectionPool.size,
        total: this.connectionPool.size,
        avgLifetime: 0, // Would calculate average lifetime
      },
      recommendations: {
        indexes: this.queryPlans.size,
        highImpact: 0, // Would count high impact recommendations
      },
    };
  }
}

// Export singleton instance
export const databaseOptimization = new DatabaseOptimizationSystem();

// Export types
export type { 
  QueryMetrics, 
  CacheEntry, 
  QueryPlan, 
  DatabaseHealth, 
  IndexRecommendation 
};