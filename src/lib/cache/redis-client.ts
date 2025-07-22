/**
 * Redis Client Configuration and Management
 * Production-ready Redis client with connection pooling, error handling, and monitoring
 */

import Redis from 'ioredis';
import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import {
  recordCacheOperation,
  cacheOperationsTotal,
  cacheOperationDuration,
  cacheMemoryUsage,
} from '../monitoring/metrics.js';
import type { 
  CacheConfig,
  CacheError,
  CacheConnectionError,
  CacheTimeoutError
} from './types.js';

// ================================
// Redis Client Manager
// ================================

export class RedisClientManager extends EventEmitter {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(private config: CacheConfig) {
    super();
    this.setMaxListeners(100); // Support many listeners
  }

  // ================================
  // Connection Management
  // ================================

  async connect(): Promise<void> {
    try {
      logger.info('Initializing Redis connection', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db,
      });

      // Create main client
      this.client = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        keyPrefix: this.config.redis.keyPrefix,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        connectTimeout: this.config.redis.connectTimeout,
        lazyConnect: this.config.redis.lazyConnect,
        family: this.config.redis.family,
        keepAlive: this.config.redis.keepAlive,
        retryStrategy: this.config.redis.retryStrategy,
        maxLoadingTimeout: 5000,
      });

      // Create subscriber client for cache invalidation
      this.subscriber = this.client.duplicate();

      // Create publisher client for cache invalidation
      this.publisher = this.client.duplicate();

      // Set up event handlers
      this.setupEventHandlers();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Start monitoring
      this.startHealthCheck();
      this.startMetricsCollection();

      logger.info('Redis connection established successfully', {
        host: this.config.redis.host,
        port: this.config.redis.port,
      });

      this.emit('connected');

    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : error,
        host: this.config.redis.host,
        port: this.config.redis.port,
      });

      throw new CacheConnectionError(
        `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'l3',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      logger.info('Disconnecting from Redis');

      // Stop monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }

      // Disconnect clients
      const disconnectPromises: Promise<void>[] = [];
      
      if (this.client) {
        disconnectPromises.push(this.client.disconnect());
      }
      
      if (this.subscriber) {
        disconnectPromises.push(this.subscriber.disconnect());
      }
      
      if (this.publisher) {
        disconnectPromises.push(this.publisher.disconnect());
      }

      await Promise.all(disconnectPromises);

      this.isConnected = false;
      this.client = null;
      this.subscriber = null;
      this.publisher = null;

      logger.info('Redis disconnection completed');
      this.emit('disconnected');

    } catch (error) {
      logger.error('Error during Redis disconnection', { error });
      throw new CacheConnectionError(
        `Failed to disconnect from Redis: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'l3',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ================================
  // Event Handlers
  // ================================

  private setupEventHandlers(): void {
    if (!this.client || !this.subscriber || !this.publisher) return;

    // Main client events
    this.client.on('connect', () => {
      logger.debug('Redis main client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis main client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis main client error', { error });
      this.emit('error', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis main client connection closed');
      this.isConnected = false;
      this.handleReconnect();
    });

    this.client.on('reconnecting', (delay) => {
      logger.info('Redis main client reconnecting', { delay });
      this.reconnectAttempts++;
    });

    // Subscriber events
    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', { error });
    });

    this.subscriber.on('message', (channel, message) => {
      this.handleInvalidationMessage(channel, message);
    });

    // Publisher events  
    this.publisher.on('error', (error) => {
      logger.error('Redis publisher error', { error });
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max Redis reconnection attempts exceeded', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      });
      
      this.emit('max_reconnect_attempts_exceeded');
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    logger.info('Scheduling Redis reconnection', { delay, attempt: this.reconnectAttempts + 1 });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Redis reconnection failed', { error });
      }
    }, delay);
  }

  // ================================
  // Health Monitoring
  // ================================

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.client) {
          const startTime = Date.now();
          await this.client.ping();
          const duration = Date.now() - startTime;

          if (duration > 100) {
            logger.warn('Redis health check slow response', { duration });
          }

          // Update connection status
          if (!this.isConnected) {
            this.isConnected = true;
            logger.info('Redis connection restored');
            this.emit('connection_restored');
          }
        }
      } catch (error) {
        logger.error('Redis health check failed', { error });
        
        if (this.isConnected) {
          this.isConnected = false;
          this.emit('connection_lost', error);
        }
      }
    }, 30000); // Every 30 seconds
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Failed to collect Redis metrics', { error });
      }
    }, 60000); // Every minute
  }

  private async collectMetrics(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      // Get Redis info
      const info = await this.client.info('memory');
      const memoryLines = info.split('\r\n');
      
      let usedMemory = 0;
      for (const line of memoryLines) {
        if (line.startsWith('used_memory:')) {
          usedMemory = parseInt(line.split(':')[1], 10);
          break;
        }
      }

      // Update metrics
      cacheMemoryUsage.set(usedMemory);

      logger.debug('Redis metrics collected', {
        usedMemory: `${Math.round(usedMemory / 1024 / 1024)} MB`,
      });

    } catch (error) {
      logger.error('Error collecting Redis metrics', { error });
    }
  }

  // ================================
  // Cache Invalidation
  // ================================

  private handleInvalidationMessage(channel: string, message: string): void {
    try {
      const data = JSON.parse(message);
      logger.debug('Received cache invalidation message', { channel, data });
      
      this.emit('invalidation', data);
    } catch (error) {
      logger.error('Failed to parse invalidation message', { 
        channel, 
        message, 
        error 
      });
    }
  }

  async publishInvalidation(pattern: string, data: any): Promise<void> {
    if (!this.publisher || !this.isConnected) {
      logger.warn('Cannot publish invalidation - Redis not connected');
      return;
    }

    try {
      const message = JSON.stringify(data);
      await this.publisher.publish(`cache:invalidate:${pattern}`, message);
      
      logger.debug('Published cache invalidation', { pattern, data });
    } catch (error) {
      logger.error('Failed to publish cache invalidation', { pattern, data, error });
      throw new CacheError(
        'Failed to publish invalidation',
        'invalidation',
        'l3',
        pattern,
        error instanceof Error ? error : undefined
      );
    }
  }

  async subscribeToInvalidations(pattern: string): Promise<void> {
    if (!this.subscriber || !this.isConnected) {
      logger.warn('Cannot subscribe to invalidations - Redis not connected');
      return;
    }

    try {
      await this.subscriber.psubscribe(`cache:invalidate:${pattern}`);
      logger.debug('Subscribed to cache invalidations', { pattern });
    } catch (error) {
      logger.error('Failed to subscribe to cache invalidations', { pattern, error });
      throw new CacheError(
        'Failed to subscribe to invalidations',
        'subscription',
        'l3',
        pattern,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ================================
  // Client Access
  // ================================

  getClient(): Redis {
    if (!this.client) {
      throw new CacheConnectionError('Redis client not initialized', 'l3');
    }
    
    if (!this.isConnected) {
      throw new CacheConnectionError('Redis client not connected', 'l3');
    }

    return this.client;
  }

  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new CacheConnectionError('Redis subscriber not initialized', 'l3');
    }

    return this.subscriber;
  }

  getPublisher(): Redis {
    if (!this.publisher) {
      throw new CacheConnectionError('Redis publisher not initialized', 'l3');
    }

    return this.publisher;
  }

  // ================================
  // Status and Utilities
  // ================================

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  getConnectionInfo(): {
    connected: boolean;
    reconnectAttempts: number;
    clientsInitialized: boolean;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      clientsInitialized: this.client !== null && this.subscriber !== null && this.publisher !== null,
    };
  }

  async flushAll(): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new CacheConnectionError('Redis client not available', 'l3');
    }

    try {
      await this.client.flushall();
      logger.info('Redis cache flushed');
    } catch (error) {
      logger.error('Failed to flush Redis cache', { error });
      throw new CacheError(
        'Failed to flush cache',
        'flush',
        'l3',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }
}

// ================================
// Configuration Factory
// ================================

export function createRedisConfig(): CacheConfig['redis'] {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'pothos:',
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    lazyConnect: true,
    family: 4,
    keepAlive: 30000,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  };
}

// ================================
// Singleton Instance
// ================================

let redisManager: RedisClientManager | null = null;

export function getRedisManager(config?: CacheConfig): RedisClientManager {
  if (!redisManager && config) {
    redisManager = new RedisClientManager(config);
  }
  
  if (!redisManager) {
    throw new Error('Redis manager not initialized. Call with config first.');
  }
  
  return redisManager;
}

export async function initializeRedis(config: CacheConfig): Promise<RedisClientManager> {
  if (redisManager) {
    logger.warn('Redis manager already initialized');
    return redisManager;
  }

  redisManager = new RedisClientManager(config);
  await redisManager.connect();
  
  return redisManager;
}