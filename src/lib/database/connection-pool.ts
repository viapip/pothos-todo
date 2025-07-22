/**
 * Enhanced Database Connection Pool Management
 * Advanced connection pooling, query optimization, and performance monitoring
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import { getDatabaseConfig } from '../../config/index.js';
import {
  recordDatabaseQuery,
  databaseConnectionsActive,
  databaseConnectionsIdle,
  databaseQueryDuration,
  databaseSlowQueries,
} from '../monitoring/metrics.js';

// ================================
// Types and Interfaces
// ================================

export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
  healthCheckIntervalMs: number;
  slowQueryThresholdMs: number;
  enableQueryLogging: boolean;
  enablePerformanceInsights: boolean;
}

export interface ConnectionStats {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  acquiredConnections: number;
  queuedRequests: number;
  averageAcquireTime: number;
  averageQueryTime: number;
  slowQueries: number;
  errors: number;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
  params?: any[];
}

// ================================
// Enhanced Connection Pool Manager
// ================================

export class DatabaseConnectionPool extends EventEmitter {
  private clients: Map<string, { client: PrismaClient; lastUsed: number; inUse: boolean }> = new Map();
  private config: ConnectionPoolConfig;
  private stats = {
    activeConnections: 0,
    idleConnections: 0,
    acquiredConnections: 0,
    queuedRequests: 0,
    totalQueries: 0,
    slowQueries: 0,
    errors: 0,
    acquireTimes: [] as number[],
    queryTimes: [] as number[],
  };
  
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private queryMetrics: QueryMetrics[] = [];
  private isShuttingDown = false;

  constructor(config?: Partial<ConnectionPoolConfig>) {
    super();
    
    this.config = {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeoutMs: 10000,
      idleTimeoutMs: 300000, // 5 minutes
      maxLifetimeMs: 1800000, // 30 minutes
      healthCheckIntervalMs: 60000, // 1 minute
      slowQueryThresholdMs: 1000,
      enableQueryLogging: process.env.NODE_ENV !== 'production',
      enablePerformanceInsights: true,
      ...config,
    };

    this.startHealthCheck();
    this.setupCleanupTasks();
  }

  // ================================
  // Connection Management
  // ================================

  async initialize(): Promise<void> {
    logger.info('Initializing database connection pool', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections,
    });

    // Create minimum number of connections
    for (let i = 0; i < this.config.minConnections; i++) {
      const client = await this.createConnection();
      const id = `conn_${Date.now()}_${i}`;
      
      this.clients.set(id, {
        client,
        lastUsed: Date.now(),
        inUse: false,
      });
      
      this.stats.idleConnections++;
    }

    this.updateMetrics();
    this.emit('initialized', this.getStats());
    logger.info('Database connection pool initialized', this.getStats());
  }

  private async createConnection(): Promise<PrismaClient> {
    const dbConfig = getDatabaseConfig();
    
    const client = new PrismaClient({
      datasources: {
        db: {
          url: dbConfig.url,
        },
      },
      log: this.config.enableQueryLogging 
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
      errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
    });

    // Set up query event handlers
    if (this.config.enableQueryLogging) {
      client.$on('query', (event) => {
        this.handleQueryEvent(event);
      });
    }

    client.$on('error', (event) => {
      logger.error('Prisma client error', { event });
      this.stats.errors++;
      this.emit('error', event);
    });

    client.$on('warn', (event) => {
      logger.warn('Prisma client warning', { event });
    });

    // Connect the client
    await client.$connect();
    
    return client;
  }

  async acquireConnection(): Promise<{ client: PrismaClient; release: () => void }> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    const startTime = Date.now();
    this.stats.queuedRequests++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stats.queuedRequests--;
        reject(new Error(`Connection acquire timeout after ${this.config.acquireTimeoutMs}ms`));
      }, this.config.acquireTimeoutMs);

      this.findOrCreateConnection()
        .then(({ connectionId, client }) => {
          clearTimeout(timeout);
          this.stats.queuedRequests--;
          
          const acquireTime = Date.now() - startTime;
          this.stats.acquireTimes.push(acquireTime);
          
          // Keep only last 100 acquire times for average calculation
          if (this.stats.acquireTimes.length > 100) {
            this.stats.acquireTimes.shift();
          }

          this.stats.acquiredConnections++;
          this.updateMetrics();

          const release = () => {
            this.releaseConnection(connectionId);
          };

          resolve({ client, release });
        })
        .catch((error) => {
          clearTimeout(timeout);
          this.stats.queuedRequests--;
          this.stats.errors++;
          reject(error);
        });
    });
  }

  private async findOrCreateConnection(): Promise<{ connectionId: string; client: PrismaClient }> {
    // First, try to find an idle connection
    for (const [id, conn] of this.clients.entries()) {
      if (!conn.inUse) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        
        this.stats.idleConnections--;
        this.stats.activeConnections++;
        
        return { connectionId: id, client: conn.client };
      }
    }

    // If no idle connections and we haven't reached max, create a new one
    if (this.clients.size < this.config.maxConnections) {
      const client = await this.createConnection();
      const id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.clients.set(id, {
        client,
        lastUsed: Date.now(),
        inUse: true,
      });
      
      this.stats.activeConnections++;
      
      return { connectionId: id, client };
    }

    // If we've reached max connections, wait for one to be released
    throw new Error('Maximum number of connections reached');
  }

  private releaseConnection(connectionId: string): void {
    const conn = this.clients.get(connectionId);
    
    if (conn && conn.inUse) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
      
      this.stats.activeConnections--;
      this.stats.idleConnections++;
      this.stats.acquiredConnections--;
      
      this.updateMetrics();
      this.emit('connectionReleased', connectionId);
    }
  }

  // ================================
  // Query Execution with Monitoring
  // ================================

  async executeQuery<T>(
    queryFn: (client: PrismaClient) => Promise<T>,
    operation = 'unknown'
  ): Promise<T> {
    const { client, release } = await this.acquireConnection();
    const startTime = Date.now();
    
    try {
      const result = await queryFn(client);
      const duration = Date.now() - startTime;
      
      this.recordQueryMetrics(operation, duration, true);
      
      if (duration > this.config.slowQueryThresholdMs) {
        this.stats.slowQueries++;
        databaseSlowQueries.inc({ operation });
        
        logger.warn('Slow query detected', {
          operation,
          duration,
          threshold: this.config.slowQueryThresholdMs,
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(operation, duration, false, error);
      
      logger.error('Query execution failed', {
        operation,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      
      throw error;
    } finally {
      release();
    }
  }

  async executeTransaction<T>(
    operations: (client: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
    operation = 'transaction'
  ): Promise<T> {
    const { client, release } = await this.acquireConnection();
    const startTime = Date.now();
    
    try {
      const result = await client.$transaction(operations);
      const duration = Date.now() - startTime;
      
      this.recordQueryMetrics(operation, duration, true);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(operation, duration, false, error);
      
      throw error;
    } finally {
      release();
    }
  }

  // ================================
  // Health Monitoring
  // ================================

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const healthyConnections = new Set<string>();
      const unhealthyConnections = new Set<string>();

      // Check each connection
      for (const [id, conn] of this.clients.entries()) {
        if (!conn.inUse) {
          try {
            await conn.client.$queryRaw`SELECT 1`;
            healthyConnections.add(id);
          } catch (error) {
            logger.warn('Unhealthy connection detected', { connectionId: id, error });
            unhealthyConnections.add(id);
          }
        }
      }

      // Replace unhealthy connections
      for (const id of unhealthyConnections) {
        await this.replaceConnection(id);
      }

      // Clean up old connections
      await this.cleanupOldConnections();

      // Ensure minimum connections
      await this.ensureMinimumConnections();

      this.updateMetrics();
      
      logger.debug('Database health check completed', {
        healthy: healthyConnections.size,
        unhealthy: unhealthyConnections.size,
        total: this.clients.size,
      });
      
    } catch (error) {
      logger.error('Health check failed', { error });
    }
  }

  private async replaceConnection(connectionId: string): Promise<void> {
    const oldConn = this.clients.get(connectionId);
    
    if (oldConn) {
      try {
        await oldConn.client.$disconnect();
      } catch (error) {
        logger.error('Failed to disconnect unhealthy connection', { connectionId, error });
      }
      
      this.clients.delete(connectionId);
      
      if (oldConn.inUse) {
        this.stats.activeConnections--;
      } else {
        this.stats.idleConnections--;
      }
      
      // Create replacement connection
      try {
        const newClient = await this.createConnection();
        const newId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.clients.set(newId, {
          client: newClient,
          lastUsed: Date.now(),
          inUse: false,
        });
        
        this.stats.idleConnections++;
        
        logger.info('Replaced unhealthy connection', { oldId: connectionId, newId });
      } catch (error) {
        logger.error('Failed to create replacement connection', { error });
        this.stats.errors++;
      }
    }
  }

  private async cleanupOldConnections(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: string[] = [];

    for (const [id, conn] of this.clients.entries()) {
      if (!conn.inUse) {
        const age = now - conn.lastUsed;
        
        if (age > this.config.idleTimeoutMs || age > this.config.maxLifetimeMs) {
          connectionsToRemove.push(id);
        }
      }
    }

    // Only remove connections if we have more than minimum
    const canRemove = Math.max(0, this.clients.size - this.config.minConnections);
    const toRemove = connectionsToRemove.slice(0, canRemove);

    for (const id of toRemove) {
      const conn = this.clients.get(id);
      if (conn) {
        try {
          await conn.client.$disconnect();
          this.clients.delete(id);
          this.stats.idleConnections--;
          
          logger.debug('Cleaned up old connection', { connectionId: id });
        } catch (error) {
          logger.error('Failed to cleanup connection', { connectionId: id, error });
        }
      }
    }
  }

  private async ensureMinimumConnections(): Promise<void> {
    const currentConnections = this.clients.size;
    
    if (currentConnections < this.config.minConnections) {
      const needed = this.config.minConnections - currentConnections;
      
      logger.info('Creating additional connections to meet minimum', {
        current: currentConnections,
        minimum: this.config.minConnections,
        needed,
      });
      
      for (let i = 0; i < needed; i++) {
        try {
          const client = await this.createConnection();
          const id = `conn_${Date.now()}_${i}`;
          
          this.clients.set(id, {
            client,
            lastUsed: Date.now(),
            inUse: false,
          });
          
          this.stats.idleConnections++;
        } catch (error) {
          logger.error('Failed to create minimum connection', { error });
          break;
        }
      }
    }
  }

  // ================================
  // Metrics and Monitoring
  // ================================

  private handleQueryEvent(event: any): void {
    if (this.config.enablePerformanceInsights) {
      const duration = event.duration || 0;
      
      this.stats.queryTimes.push(duration);
      if (this.stats.queryTimes.length > 1000) {
        this.stats.queryTimes.shift();
      }

      const queryMetric: QueryMetrics = {
        query: event.query || 'unknown',
        duration,
        timestamp: Date.now(),
        success: true,
        params: event.params,
      };

      this.queryMetrics.push(queryMetric);
      
      // Keep only last 100 query metrics
      if (this.queryMetrics.length > 100) {
        this.queryMetrics.shift();
      }

      if (duration > this.config.slowQueryThresholdMs) {
        logger.warn('Slow query detected in event handler', {
          query: event.query?.slice(0, 100),
          duration,
          params: event.params,
        });
      }
    }
  }

  private recordQueryMetrics(operation: string, duration: number, success: boolean, error?: any): void {
    this.stats.totalQueries++;
    
    recordDatabaseQuery(
      operation,
      'query',
      success ? 'success' : 'error',
      duration
    );
    
    databaseQueryDuration.observe({ operation, status: success ? 'success' : 'error' }, duration / 1000);
    
    if (this.config.enablePerformanceInsights) {
      this.stats.queryTimes.push(duration);
      if (this.stats.queryTimes.length > 1000) {
        this.stats.queryTimes.shift();
      }

      const queryMetric: QueryMetrics = {
        query: operation,
        duration,
        timestamp: Date.now(),
        success,
        error: error instanceof Error ? error.message : error,
      };

      this.queryMetrics.push(queryMetric);
      if (this.queryMetrics.length > 100) {
        this.queryMetrics.shift();
      }
    }
  }

  private updateMetrics(): void {
    databaseConnectionsActive.set(this.stats.activeConnections);
    databaseConnectionsIdle.set(this.stats.idleConnections);
  }

  private setupCleanupTasks(): void {
    // Cleanup old metrics periodically
    setInterval(() => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      this.queryMetrics = this.queryMetrics.filter(metric => metric.timestamp > cutoff);
      
      // Limit array sizes
      if (this.stats.acquireTimes.length > 1000) {
        this.stats.acquireTimes = this.stats.acquireTimes.slice(-100);
      }
      if (this.stats.queryTimes.length > 1000) {
        this.stats.queryTimes = this.stats.queryTimes.slice(-100);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  // ================================
  // Public API
  // ================================

  getStats(): ConnectionStats {
    const avgAcquireTime = this.stats.acquireTimes.length > 0
      ? this.stats.acquireTimes.reduce((a, b) => a + b, 0) / this.stats.acquireTimes.length
      : 0;

    const avgQueryTime = this.stats.queryTimes.length > 0
      ? this.stats.queryTimes.reduce((a, b) => a + b, 0) / this.stats.queryTimes.length
      : 0;

    return {
      activeConnections: this.stats.activeConnections,
      idleConnections: this.stats.idleConnections,
      totalConnections: this.clients.size,
      acquiredConnections: this.stats.acquiredConnections,
      queuedRequests: this.stats.queuedRequests,
      averageAcquireTime: avgAcquireTime,
      averageQueryTime: avgQueryTime,
      slowQueries: this.stats.slowQueries,
      errors: this.stats.errors,
    };
  }

  getQueryMetrics(): QueryMetrics[] {
    return [...this.queryMetrics];
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    connections: number;
    activeConnections: number;
    idleConnections: number;
    errors: number;
  }> {
    const stats = this.getStats();
    
    return {
      healthy: stats.totalConnections >= this.config.minConnections && stats.errors === 0,
      connections: stats.totalConnections,
      activeConnections: stats.activeConnections,
      idleConnections: stats.idleConnections,
      errors: stats.errors,
    };
  }

  // ================================
  // Shutdown
  // ================================

  async shutdown(): Promise<void> {
    logger.info('Shutting down database connection pool');
    
    this.isShuttingDown = true;

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Wait for active connections to be released (with timeout)
    const timeout = 30000; // 30 seconds
    const start = Date.now();
    
    while (this.stats.activeConnections > 0 && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force disconnect all connections
    const disconnectPromises: Promise<void>[] = [];
    
    for (const [id, conn] of this.clients.entries()) {
      disconnectPromises.push(
        conn.client.$disconnect().catch(error => {
          logger.error('Failed to disconnect connection during shutdown', { connectionId: id, error });
        })
      );
    }

    await Promise.allSettled(disconnectPromises);
    
    this.clients.clear();
    this.stats.activeConnections = 0;
    this.stats.idleConnections = 0;
    
    this.updateMetrics();
    
    logger.info('Database connection pool shutdown completed');
    this.emit('shutdown');
  }
}