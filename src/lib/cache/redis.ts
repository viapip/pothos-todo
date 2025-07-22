import Redis from 'ioredis';
import { getRedisConfig } from '../../config/index.js';

/**
 * Redis client instance
 */
let redisClient: Redis | null = null;
let isConnecting = false;

/**
 * Custom Redis error class
 */
export class RedisError extends Error {
  constructor(message: string, public readonly operation?: string) {
    super(message);
    this.name = 'RedisError';
  }
}

/**
 * Redis connection status
 */
export enum RedisConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): RedisConnectionStatus {
  if (!redisClient) return RedisConnectionStatus.DISCONNECTED;
  if (isConnecting) return RedisConnectionStatus.CONNECTING;
  if (redisClient.status === 'ready') return RedisConnectionStatus.CONNECTED;
  if (redisClient.status === 'connecting') return RedisConnectionStatus.CONNECTING;
  return RedisConnectionStatus.ERROR;
}

/**
 * Initialize Redis connection with configuration
 */
export async function initRedis(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  if (isConnecting) {
    // Wait for existing connection attempt
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (redisClient && redisClient.status === 'ready') {
      return redisClient;
    }
  }

  isConnecting = true;

  try {
    const config = getRedisConfig();
    
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      connectTimeout: config.connectTimeout,
      lazyConnect: config.lazyConnect,
      // Connection pool settings
      family: 4, // IPv4
      keepAlive: 30000,
      // Error handling
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Event listeners for connection monitoring
    redisClient.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready for operations');
      isConnecting = false;
    });

    redisClient.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
      isConnecting = false;
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    redisClient.on('reconnecting', (ms: number) => {
      console.log(`[Redis] Reconnecting in ${ms}ms`);
    });

    // Connect if not lazy connecting
    if (!config.lazyConnect) {
      await redisClient.connect();
    }

    return redisClient;
  } catch (error) {
    isConnecting = false;
    console.error('[Redis] Failed to initialize:', error);
    throw new RedisError(`Redis initialization failed: ${error}`);
  }
}

/**
 * Get Redis client instance
 */
export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    return await initRedis();
  }
  
  if (redisClient.status !== 'ready') {
    if (redisClient.status === 'connecting') {
      // Wait for connection to complete
      await new Promise((resolve, reject) => {
        redisClient!.once('ready', resolve);
        redisClient!.once('error', reject);
        // Timeout after 10 seconds
        setTimeout(() => reject(new RedisError('Connection timeout')), 10000);
      });
    } else {
      // Reconnect if not ready
      await redisClient.connect();
    }
  }
  
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error closing connection:', error);
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnecting = false;
    }
  }
}

/**
 * Redis cache operations
 */
export class RedisCache {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  /**
   * Get value by key
   */
  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) return null;
      
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      throw new RedisError(`Failed to get key "${key}": ${error}`, 'get');
    }
  }

  /**
   * Set value with optional expiration
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<'OK'> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttlSeconds) {
        return await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        return await this.client.set(key, serializedValue);
      }
    } catch (error) {
      throw new RedisError(`Failed to set key "${key}": ${error}`, 'set');
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      throw new RedisError(`Failed to delete key "${key}": ${error}`, 'del');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      throw new RedisError(`Failed to check existence of key "${key}": ${error}`, 'exists');
    }
  }

  /**
   * Set expiration time for key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      throw new RedisError(`Failed to set expiration for key "${key}": ${error}`, 'expire');
    }
  }

  /**
   * Get remaining time to live for key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      throw new RedisError(`Failed to get TTL for key "${key}": ${error}`, 'ttl');
    }
  }

  /**
   * Increment numeric value
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      throw new RedisError(`Failed to increment key "${key}": ${error}`, 'incr');
    }
  }

  /**
   * Increment by specific amount
   */
  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrby(key, increment);
    } catch (error) {
      throw new RedisError(`Failed to increment key "${key}" by ${increment}: ${error}`, 'incrby');
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValues: Record<string, any>): Promise<'OK'> {
    try {
      const serializedPairs: string[] = [];
      for (const [key, value] of Object.entries(keyValues)) {
        serializedPairs.push(key);
        serializedPairs.push(typeof value === 'string' ? value : JSON.stringify(value));
      }
      return await this.client.mset(...serializedPairs);
    } catch (error) {
      throw new RedisError(`Failed to set multiple keys: ${error}`, 'mset');
    }
  }

  /**
   * Get multiple values by keys
   */
  async mget<T = string>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      throw new RedisError(`Failed to get multiple keys: ${error}`, 'mget');
    }
  }

  /**
   * Find keys by pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      throw new RedisError(`Failed to find keys with pattern "${pattern}": ${error}`, 'keys');
    }
  }

  /**
   * Flush all keys in current database
   */
  async flushdb(): Promise<'OK'> {
    try {
      return await this.client.flushdb();
    } catch (error) {
      throw new RedisError(`Failed to flush database: ${error}`, 'flushdb');
    }
  }
}

/**
 * Get Redis cache instance
 */
export async function getRedisCache(): Promise<RedisCache> {
  const client = await getRedisClient();
  return new RedisCache(client);
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{
  status: RedisConnectionStatus;
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  try {
    if (!redisClient) {
      return {
        status: RedisConnectionStatus.DISCONNECTED,
        connected: false,
      };
    }

    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;

    return {
      status: getRedisStatus(),
      connected: true,
      latency,
    };
  } catch (error) {
    return {
      status: RedisConnectionStatus.ERROR,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}