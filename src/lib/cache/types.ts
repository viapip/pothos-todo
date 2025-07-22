/**
 * Multi-Level Caching System Types
 * Comprehensive type definitions for Redis-based distributed caching and DataLoader batching
 */

// ================================
// Cache Configuration Types
// ================================

export interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    maxRetriesPerRequest: number;
    connectTimeout: number;
    lazyConnect: boolean;
    family: number;
    keepAlive: number;
    retryStrategy: (times: number) => number;
  };
  levels: {
    l1: L1CacheConfig; // Request-level (DataLoader)
    l2: L2CacheConfig; // Application-level (in-memory)
    l3: L3CacheConfig; // Distributed (Redis)
  };
  invalidation: InvalidationConfig;
  monitoring: CacheMonitoringConfig;
}

export interface L1CacheConfig {
  enabled: boolean;
  maxBatchSize: number;
  batchScheduleFn?: (callback: () => void) => void;
  cacheKeyFn?: (key: any) => string;
  maxCacheSize: number;
}

export interface L2CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number; // seconds
  checkInterval: number; // seconds
  deleteOnExpire: boolean;
}

export interface L3CacheConfig {
  enabled: boolean;
  defaultTTL: number; // seconds
  maxRetries: number;
  keyPatterns: Record<string, CacheKeyPattern>;
  compression: {
    enabled: boolean;
    algorithm: 'gzip' | 'deflate';
    threshold: number; // bytes
  };
}

export interface CacheKeyPattern {
  pattern: string;
  ttl: number;
  tags: string[];
  invalidateOn: string[];
}

export interface InvalidationConfig {
  enabled: boolean;
  strategies: {
    timeBasedInvalidation: boolean;
    tagBasedInvalidation: boolean;
    eventBasedInvalidation: boolean;
    versionBasedInvalidation: boolean;
  };
  patterns: Record<string, InvalidationPattern>;
}

export interface InvalidationPattern {
  events: string[];
  keys: string[];
  tags: string[];
  cascade: boolean;
}

export interface CacheMonitoringConfig {
  enabled: boolean;
  metricsPrefix: string;
  detailedMetrics: boolean;
  slowQueryThreshold: number; // milliseconds
}

// ================================
// Cache Operation Types
// ================================

export type CacheLevel = 'l1' | 'l2' | 'l3' | 'all';

export interface CacheKey {
  key: string;
  level: CacheLevel;
  ttl?: number;
  tags?: string[];
  version?: string;
}

export interface CacheEntry<T = any> {
  value: T;
  createdAt: number;
  expiresAt?: number;
  version?: string;
  tags?: string[];
  metadata?: CacheMetadata;
}

export interface CacheMetadata {
  source: 'database' | 'computation' | 'api';
  queryTime?: number;
  size?: number;
  compressionRatio?: number;
  hitCount?: number;
  lastAccessed?: number;
}

export interface CacheResult<T = any> {
  value: T | null;
  hit: boolean;
  level?: CacheLevel;
  ttl?: number;
  metadata?: CacheMetadata;
}

export interface CacheStats {
  l1: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  l2: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
    memory: number;
  };
  l3: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
    memory: number;
    connections: number;
  };
  overall: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    averageResponseTime: number;
  };
}

// ================================
// DataLoader Types
// ================================

export interface DataLoaderConfig<K = any, V = any> {
  batchLoadFn: (keys: readonly K[]) => Promise<V[]>;
  options?: {
    batch?: boolean;
    maxBatchSize?: number;
    cache?: boolean;
    cacheKeyFn?: (key: K) => any;
    cacheMap?: Map<any, Promise<V>>;
    batchScheduleFn?: (callback: () => void) => void;
  };
  cacheConfig?: {
    ttl: number;
    persistToL2: boolean;
    persistToL3: boolean;
    tags: string[];
  };
}

export interface LoaderContext {
  userLoader: DataLoader<string, any>;
  todoLoader: DataLoader<string, any>;
  todoListLoader: DataLoader<string, any>;
  todosByUserLoader: DataLoader<string, any[]>;
  todosByListLoader: DataLoader<string, any[]>;
  usersByTodoListLoader: DataLoader<string, any[]>;
}

// ================================
// Cache Strategy Types
// ================================

export type CacheStrategy = 
  | 'cache-first'      // Check cache first, fallback to source
  | 'cache-only'       // Only use cache, fail if miss
  | 'network-first'    // Check source first, fallback to cache
  | 'network-only'     // Only use source, ignore cache
  | 'cache-and-network' // Return cache immediately, update from source
  | 'stale-while-revalidate'; // Return stale cache, revalidate in background

export interface CachePolicy {
  strategy: CacheStrategy;
  ttl: number;
  staleWhileRevalidate?: number;
  tags: string[];
  invalidateOn: string[];
  version?: string;
}

// ================================
// Invalidation Types
// ================================

export type InvalidationType = 'immediate' | 'delayed' | 'lazy' | 'batch';

export interface InvalidationEvent {
  type: string;
  entityType: string;
  entityId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface InvalidationJob {
  id: string;
  type: InvalidationType;
  keys: string[];
  tags: string[];
  scheduledFor: number;
  retries: number;
  maxRetries: number;
}

// ================================
// Performance Types
// ================================

export interface CachePerformanceMetrics {
  operation: string;
  level: CacheLevel;
  duration: number;
  hit: boolean;
  keySize: number;
  valueSize: number;
  compressionTime?: number;
  networkTime?: number;
  timestamp: number;
}

export interface QueryOptimization {
  queryHash: string;
  cacheHits: number;
  avgResponseTime: number;
  dataSize: number;
  lastOptimized: number;
  optimizations: OptimizationSuggestion[];
}

export interface OptimizationSuggestion {
  type: 'cache_strategy' | 'ttl_adjustment' | 'key_pattern' | 'batch_optimization';
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  estimatedImprovement: number; // percentage
}

// ================================
// GraphQL Integration Types
// ================================

export interface CacheableResolver<TSource = any, TArgs = any, TContext = any, TReturn = any> {
  resolve: (
    source: TSource,
    args: TArgs,
    context: TContext,
    info: any
  ) => Promise<TReturn> | TReturn;
  cachePolicy?: CachePolicy;
  cacheKeyGenerator?: (
    source: TSource,
    args: TArgs,
    context: TContext
  ) => string;
}

export interface CachedGraphQLContext {
  cache: CacheManager;
  loaders: LoaderContext;
  cacheHints: CacheHint[];
}

export interface CacheHint {
  path: string;
  maxAge: number;
  tags?: string[];
  version?: string;
}

// ================================
// Error Types
// ================================

export class CacheError extends Error {
  constructor(
    message: string,
    public operation: string,
    public level: CacheLevel,
    public key?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

export class CacheConnectionError extends CacheError {
  constructor(message: string, level: CacheLevel, cause?: Error) {
    super(message, 'connection', level, undefined, cause);
    this.name = 'CacheConnectionError';
  }
}

export class CacheTimeoutError extends CacheError {
  constructor(message: string, level: CacheLevel, key?: string) {
    super(message, 'timeout', level, key);
    this.name = 'CacheTimeoutError';
  }
}

export class CacheInvalidationError extends CacheError {
  constructor(message: string, keys: string[], cause?: Error) {
    super(message, 'invalidation', 'all', keys.join(','), cause);
    this.name = 'CacheInvalidationError';
  }
}

// ================================
// Utility Types
// ================================

export interface Serializable {
  [key: string]: any;
}

export type CacheValue = Serializable | string | number | boolean | null | undefined;

export type BatchFunction<K, V> = (keys: readonly K[]) => Promise<(V | Error)[]>;

export interface CacheMiddleware<T = any> {
  beforeGet?: (key: string, level: CacheLevel) => Promise<void> | void;
  afterGet?: (key: string, value: T | null, hit: boolean, level: CacheLevel) => Promise<void> | void;
  beforeSet?: (key: string, value: T, ttl: number, level: CacheLevel) => Promise<void> | void;
  afterSet?: (key: string, value: T, level: CacheLevel) => Promise<void> | void;
  beforeDelete?: (key: string, level: CacheLevel) => Promise<void> | void;
  afterDelete?: (key: string, level: CacheLevel) => Promise<void> | void;
}

export interface CacheEventEmitter {
  on(event: 'hit' | 'miss' | 'set' | 'delete' | 'invalidate' | 'error', listener: (...args: any[]) => void): void;
  emit(event: 'hit' | 'miss' | 'set' | 'delete' | 'invalidate' | 'error', ...args: any[]): boolean;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}