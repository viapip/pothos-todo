/**
 * Multi-Level Cache Manager
 * Orchestrates L1 (DataLoader), L2 (in-memory), and L3 (Redis) cache layers
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import { getRedisManager } from './redis-client.js';
import {
  recordCacheOperation,
  cacheOperationsTotal,
  cacheOperationDuration,
} from '../monitoring/metrics.js';
import { 
  CacheError,
  CacheTimeoutError,
} from './types.js';
import type {
  CacheConfig,
  CacheLevel,
  CacheKey,
  CacheEntry,
  CacheResult,
  CacheStrategy,
  CachePolicy,
  CacheStats,
  CacheValue,
  CacheMiddleware,
  CacheEventEmitter,
} from './types.js';

// ================================
// L2 Cache (In-Memory)
// ================================

class L2Cache {
  private cache = new Map<string, CacheEntry>();
  private timers = new Map<string, NodeJS.Timeout>();
  private maxSize: number;
  private defaultTTL: number;
  private checkInterval: NodeJS.Timeout;
  
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
  };

  constructor(config: CacheConfig['levels']['l2']) {
    this.maxSize = config.maxSize;
    this.defaultTTL = config.ttl * 1000; // Convert to milliseconds

    // Periodic cleanup
    this.checkInterval = setInterval(() => {
      this.cleanup();
    }, config.checkInterval * 1000);
  }

  get(key: string): CacheResult {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return { value: null, hit: false, level: 'l2' };
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      this.stats.misses++;
      return { value: null, hit: false, level: 'l2' };
    }

    // Update metadata
    if (entry.metadata) {
      entry.metadata.hitCount = (entry.metadata.hitCount || 0) + 1;
      entry.metadata.lastAccessed = Date.now();
    }

    this.stats.hits++;
    return {
      value: entry.value,
      hit: true,
      level: 'l2',
      ttl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : undefined,
      metadata: entry.metadata,
    };
  }

  set(key: string, value: CacheValue, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    const expireTime = ttl ? now + (ttl * 1000) : now + this.defaultTTL;

    const entry: CacheEntry = {
      value,
      createdAt: now,
      expiresAt: expireTime,
      metadata: {
        source: 'unknown',
        hitCount: 0,
        lastAccessed: now,
        size: this.calculateSize(value),
      },
    };

    this.cache.set(key, entry);
    this.stats.sets++;

    // Set expiration timer
    if (ttl || this.defaultTTL > 0) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, expireTime - now);
      
      this.timers.set(key, timer);
    }
  }

  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    
    if (existed) {
      this.stats.deletes++;
      
      // Clear timer
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }

    return existed;
  }

  clear(): void {
    this.cache.clear();
    
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? this.stats.hits / (this.stats.hits + this.stats.misses) 
      : 0;

    const memoryUsage = Array.from(this.cache.values())
      .reduce((total, entry) => total + (entry.metadata?.size || 0), 0);

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
      memory: memoryUsage,
      ...this.stats,
    };
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const lastAccessed = entry.metadata?.lastAccessed || entry.createdAt;
      if (lastAccessed < oldestTime) {
        oldestTime = lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug('L2 cache cleanup completed', { 
        expiredKeys: expiredKeys.length,
        remainingKeys: this.cache.size,
      });
    }
  }

  private calculateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimation
    } catch {
      return 1000; // Default size for non-serializable values
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.clear();
  }
}

// ================================
// Main Cache Manager
// ================================

export class CacheManager extends EventEmitter implements CacheEventEmitter {
  private l2Cache: L2Cache;
  private config: CacheConfig;
  private middleware: CacheMiddleware[] = [];

  constructor(config: CacheConfig) {
    super();
    this.config = config;
    this.l2Cache = new L2Cache(config.levels.l2);

    // Set up Redis invalidation subscriptions
    this.setupInvalidationSubscriptions();

    logger.info('Cache manager initialized', {
      levels: {
        l1: config.levels.l1.enabled,
        l2: config.levels.l2.enabled,
        l3: config.levels.l3.enabled,
      },
    });
  }

  // ================================
  // Core Cache Operations
  // ================================

  async get<T = CacheValue>(
    key: string | CacheKey,
    level: CacheLevel = 'all'
  ): Promise<CacheResult<T>> {
    const cacheKey = typeof key === 'string' ? { key, level } : key;
    const startTime = Date.now();

    try {
      // Run middleware
      await this.runMiddleware('beforeGet', cacheKey.key, level);

      let result: CacheResult<T> = { value: null, hit: false };

      // Try different cache levels based on strategy
      if (level === 'all' || level === 'l2') {
        if (this.config.levels.l2.enabled) {
          result = this.l2Cache.get(cacheKey.key) as CacheResult<T>;
          
          if (result.hit) {
            await this.runMiddleware('afterGet', cacheKey.key, result.value, true, 'l2');
            this.recordMetrics('get', 'l2', Date.now() - startTime, true, cacheKey.key);
            this.emit('hit', cacheKey.key, 'l2', result.value);
            return result;
          }
        }
      }

      // Try Redis (L3)
      if ((level === 'all' || level === 'l3') && this.config.levels.l3.enabled) {
        try {
          const redisManager = getRedisManager();
          if (redisManager.isHealthy()) {
            const client = redisManager.getClient();
            const redisValue = await client.get(cacheKey.key);
            
            if (redisValue !== null) {
              const parsedValue = JSON.parse(redisValue) as T;
              const ttl = await client.ttl(cacheKey.key);
              
              result = {
                value: parsedValue,
                hit: true,
                level: 'l3',
                ttl: ttl > 0 ? ttl : undefined,
              };

              // Populate L2 cache
              if (this.config.levels.l2.enabled && ttl > 0) {
                this.l2Cache.set(cacheKey.key, parsedValue, Math.min(ttl, this.config.levels.l2.ttl));
              }

              await this.runMiddleware('afterGet', cacheKey.key, result.value, true, 'l3');
              this.recordMetrics('get', 'l3', Date.now() - startTime, true, cacheKey.key);
              this.emit('hit', cacheKey.key, 'l3', result.value);
              return result;
            }
          }
        } catch (error) {
          logger.error('L3 cache get error', { key: cacheKey.key, error });
          // Continue to return miss
        }
      }

      // Cache miss
      await this.runMiddleware('afterGet', cacheKey.key, null, false, level);
      this.recordMetrics('get', level, Date.now() - startTime, false, cacheKey.key);
      this.emit('miss', cacheKey.key, level);
      
      return result;

    } catch (error) {
      this.emit('error', error, 'get', cacheKey.key);
      throw new CacheError(
        `Cache get operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'get',
        level,
        cacheKey.key,
        error instanceof Error ? error : undefined
      );
    }
  }

  async set<T = CacheValue>(
    key: string | CacheKey,
    value: T,
    ttl?: number,
    level: CacheLevel = 'all'
  ): Promise<void> {
    const cacheKey = typeof key === 'string' ? { key, level } : key;
    const startTime = Date.now();

    try {
      const effectiveTTL = ttl || cacheKey.ttl || this.config.levels.l2.ttl;
      
      await this.runMiddleware('beforeSet', cacheKey.key, value, effectiveTTL, level);

      // Set in L2 cache
      if ((level === 'all' || level === 'l2') && this.config.levels.l2.enabled) {
        this.l2Cache.set(cacheKey.key, value, effectiveTTL);
      }

      // Set in Redis (L3)
      if ((level === 'all' || level === 'l3') && this.config.levels.l3.enabled) {
        try {
          const redisManager = getRedisManager();
          if (redisManager.isHealthy()) {
            const client = redisManager.getClient();
            const serializedValue = JSON.stringify(value);
            
            if (effectiveTTL > 0) {
              await client.setex(cacheKey.key, effectiveTTL, serializedValue);
            } else {
              await client.set(cacheKey.key, serializedValue);
            }

            // Add tags if specified
            if (cacheKey.tags && cacheKey.tags.length > 0) {
              for (const tag of cacheKey.tags) {
                await client.sadd(`tag:${tag}`, cacheKey.key);
                if (effectiveTTL > 0) {
                  await client.expire(`tag:${tag}`, effectiveTTL + 300); // Tag expires 5 minutes after keys
                }
              }
            }
          }
        } catch (error) {
          logger.error('L3 cache set error', { key: cacheKey.key, error });
          // Don't throw - L2 cache was successful
        }
      }

      await this.runMiddleware('afterSet', cacheKey.key, value, level);
      this.recordMetrics('set', level, Date.now() - startTime, true, cacheKey.key, value);
      this.emit('set', cacheKey.key, level, value);

    } catch (error) {
      this.emit('error', error, 'set', cacheKey.key);
      throw new CacheError(
        `Cache set operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'set',
        level,
        cacheKey.key,
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(key: string, level: CacheLevel = 'all'): Promise<boolean> {
    const startTime = Date.now();
    let deleted = false;

    try {
      await this.runMiddleware('beforeDelete', key, level);

      // Delete from L2
      if ((level === 'all' || level === 'l2') && this.config.levels.l2.enabled) {
        deleted = this.l2Cache.delete(key) || deleted;
      }

      // Delete from Redis (L3)
      if ((level === 'all' || level === 'l3') && this.config.levels.l3.enabled) {
        try {
          const redisManager = getRedisManager();
          if (redisManager.isHealthy()) {
            const client = redisManager.getClient();
            const redisDeleted = await client.del(key);
            deleted = redisDeleted > 0 || deleted;
          }
        } catch (error) {
          logger.error('L3 cache delete error', { key, error });
        }
      }

      await this.runMiddleware('afterDelete', key, level);
      this.recordMetrics('delete', level, Date.now() - startTime, deleted, key);
      this.emit('delete', key, level);

      return deleted;

    } catch (error) {
      this.emit('error', error, 'delete', key);
      throw new CacheError(
        `Cache delete operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'delete',
        level,
        key,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ================================
  // Advanced Operations
  // ================================

  async getOrSet<T = CacheValue>(
    key: string | CacheKey,
    factory: () => Promise<T> | T,
    ttl?: number,
    strategy: CacheStrategy = 'cache-first'
  ): Promise<T> {
    const cacheKey = typeof key === 'string' ? { key, level: 'all' as CacheLevel } : key;

    switch (strategy) {
      case 'cache-first': {
        const cached = await this.get<T>(cacheKey);
        if (cached.hit && cached.value !== null) {
          return cached.value;
        }
        
        const value = await factory();
        await this.set(cacheKey, value, ttl);
        return value;
      }

      case 'network-first': {
        try {
          const value = await factory();
          await this.set(cacheKey, value, ttl);
          return value;
        } catch (error) {
          const cached = await this.get<T>(cacheKey);
          if (cached.hit && cached.value !== null) {
            logger.warn('Falling back to stale cache due to network error', { 
              key: cacheKey.key, 
              error 
            });
            return cached.value;
          }
          throw error;
        }
      }

      case 'cache-only': {
        const cached = await this.get<T>(cacheKey);
        if (cached.hit && cached.value !== null) {
          return cached.value;
        }
        throw new CacheError('Cache miss in cache-only mode', 'get', 'all', cacheKey.key);
      }

      case 'network-only': {
        return await factory();
      }

      case 'stale-while-revalidate': {
        const cached = await this.get<T>(cacheKey);
        
        if (cached.hit && cached.value !== null) {
          // Return stale data immediately
          const staleValue = cached.value;
          
          // Revalidate in background
          setImmediate(async () => {
            try {
              const freshValue = await factory();
              await this.set(cacheKey, freshValue, ttl);
            } catch (error) {
              logger.error('Background revalidation failed', { 
                key: cacheKey.key, 
                error 
              });
            }
          });
          
          return staleValue;
        } else {
          // No cache, fetch normally
          const value = await factory();
          await this.set(cacheKey, value, ttl);
          return value;
        }
      }

      default:
        throw new Error(`Unsupported cache strategy: ${strategy}`);
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    let invalidatedCount = 0;

    try {
      // Get Redis keys by tag
      if (this.config.levels.l3.enabled) {
        const redisManager = getRedisManager();
        if (redisManager.isHealthy()) {
          const client = redisManager.getClient();
          const keys = await client.smembers(`tag:${tag}`);
          
          if (keys.length > 0) {
            // Delete keys
            await client.del(...keys);
            
            // Delete tag set
            await client.del(`tag:${tag}`);
            
            // Also remove from L2 cache
            for (const key of keys) {
              this.l2Cache.delete(key);
            }
            
            invalidatedCount = keys.length;
          }

          // Publish invalidation event
          await redisManager.publishInvalidation(tag, {
            type: 'tag_invalidation',
            tag,
            keys,
            timestamp: Date.now(),
          });
        }
      }

      logger.info('Cache invalidation by tag completed', { 
        tag, 
        invalidatedCount 
      });

      this.emit('invalidate', tag, 'tag', invalidatedCount);
      return invalidatedCount;

    } catch (error) {
      logger.error('Cache invalidation by tag failed', { tag, error });
      throw new CacheError(
        `Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'invalidation',
        'all',
        tag,
        error instanceof Error ? error : undefined
      );
    }
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    let invalidatedCount = 0;

    try {
      if (this.config.levels.l3.enabled) {
        const redisManager = getRedisManager();
        if (redisManager.isHealthy()) {
          const client = redisManager.getClient();
          
          // Use Redis SCAN to find matching keys
          const keys: string[] = [];
          let cursor = 0;
          
          do {
            const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = parseInt(result[0], 10);
            keys.push(...result[1]);
          } while (cursor !== 0);
          
          if (keys.length > 0) {
            await client.del(...keys);
            
            // Also remove from L2 cache
            for (const key of keys) {
              this.l2Cache.delete(key);
            }
            
            invalidatedCount = keys.length;
          }

          // Publish invalidation event
          await redisManager.publishInvalidation('pattern', {
            type: 'pattern_invalidation',
            pattern,
            keys,
            timestamp: Date.now(),
          });
        }
      }

      logger.info('Cache invalidation by pattern completed', { 
        pattern, 
        invalidatedCount 
      });

      this.emit('invalidate', pattern, 'pattern', invalidatedCount);
      return invalidatedCount;

    } catch (error) {
      logger.error('Cache invalidation by pattern failed', { pattern, error });
      throw new CacheError(
        `Pattern invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'invalidation',
        'all',
        pattern,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ================================
  // Utility Methods
  // ================================

  getStats(): CacheStats {
    const l2Stats = this.l2Cache.getStats();
    
    // Mock L3 stats for now - would come from Redis INFO in production
    const l3Stats = {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
      memory: 0,
      connections: 1,
    };

    return {
      l1: { hits: 0, misses: 0, size: 0, hitRate: 0 }, // DataLoader stats would be tracked separately
      l2: l2Stats,
      l3: l3Stats,
      overall: {
        totalHits: l2Stats.hits + l3Stats.hits,
        totalMisses: l2Stats.misses + l3Stats.misses,
        overallHitRate: (l2Stats.hits + l3Stats.hits) / 
                       Math.max(1, l2Stats.hits + l2Stats.misses + l3Stats.hits + l3Stats.misses),
        averageResponseTime: 0, // Would be calculated from metrics
      },
    };
  }

  addMiddleware(middleware: CacheMiddleware): void {
    this.middleware.push(middleware);
  }

  async clear(level: CacheLevel = 'all'): Promise<void> {
    if (level === 'all' || level === 'l2') {
      this.l2Cache.clear();
    }

    if (level === 'all' || level === 'l3') {
      try {
        const redisManager = getRedisManager();
        if (redisManager.isHealthy()) {
          const client = redisManager.getClient();
          await client.flushdb(); // Only flush current database
        }
      } catch (error) {
        logger.error('Failed to clear L3 cache', { error });
      }
    }

    logger.info('Cache cleared', { level });
  }

  async destroy(): Promise<void> {
    this.l2Cache.destroy();
    this.removeAllListeners();
    
    // Redis will be closed by the RedisManager
    logger.info('Cache manager destroyed');
  }

  // ================================
  // Private Methods
  // ================================

  private async runMiddleware(
    event: keyof CacheMiddleware,
    key: string,
    ...args: any[]
  ): Promise<void> {
    for (const middleware of this.middleware) {
      const handler = middleware[event];
      if (handler) {
        try {
          await handler(key, ...args);
        } catch (error) {
          logger.error('Cache middleware error', { event, key, error });
        }
      }
    }
  }

  private recordMetrics(
    operation: string,
    level: CacheLevel,
    duration: number,
    success: boolean,
    key?: string,
    value?: any
  ): void {
    if (!this.config.monitoring.enabled) return;

    const status = success ? 'success' : 'error';
    const labels = { operation, level, status };

    recordCacheOperation(operation, success ? 'success' : 'error', duration / 1000);
    cacheOperationsTotal.inc(labels);
    cacheOperationDuration.observe(labels, duration / 1000);
  }

  private setupInvalidationSubscriptions(): void {
    if (!this.config.invalidation.enabled) return;

    try {
      const redisManager = getRedisManager();
      
      redisManager.on('invalidation', (data) => {
        this.handleInvalidationEvent(data);
      });

      // Subscribe to common patterns
      redisManager.subscribeToInvalidations('*');
      
    } catch (error) {
      logger.warn('Could not set up cache invalidation subscriptions', { error });
    }
  }

  private handleInvalidationEvent(data: any): void {
    try {
      switch (data.type) {
        case 'tag_invalidation':
          // Remove tagged items from L2 cache
          if (data.keys) {
            for (const key of data.keys) {
              this.l2Cache.delete(key);
            }
          }
          break;
          
        case 'pattern_invalidation':
          // Remove pattern-matching items from L2 cache
          if (data.keys) {
            for (const key of data.keys) {
              this.l2Cache.delete(key);
            }
          }
          break;
      }
      
      this.emit('invalidation', data);
    } catch (error) {
      logger.error('Failed to handle invalidation event', { data, error });
    }
  }
}