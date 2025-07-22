/**
 * Enhanced Database Client
 * Integrated database client with connection pooling, query optimization, and monitoring
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '../../logger.js';
import { DatabaseConnectionPool } from './connection-pool.js';
import { DatabaseQueryOptimizer } from './query-optimizer.js';
import { getDatabaseConfig } from '../../config/index.js';

// ================================
// Enhanced Database Client
// ================================

export class EnhancedDatabaseClient {
  private connectionPool: DatabaseConnectionPool;
  private queryOptimizer: DatabaseQueryOptimizer;
  private isInitialized = false;

  constructor(
    poolConfig?: Partial<import('./connection-pool.js').ConnectionPoolConfig>,
    optimizerConfig?: Partial<{
      enableQueryAnalysis: boolean;
      enablePreparedStatements: boolean;
      slowQueryThreshold: number;
      maxPreparedStatements: number;
      maxQueryCacheSize: number;
    }>
  ) {
    this.connectionPool = new DatabaseConnectionPool(poolConfig);
    
    // Provide defaults for optimizer config
    const fullOptimizerConfig = {
      enableQueryAnalysis: true,
      enablePreparedStatements: true,
      slowQueryThreshold: 1000,
      maxPreparedStatements: 100,
      maxQueryCacheSize: 500,
      ...optimizerConfig,
    };
    
    this.queryOptimizer = new DatabaseQueryOptimizer(this.connectionPool, fullOptimizerConfig);
    
    this.setupCleanupTasks();
  }

  // ================================
  // Initialization
  // ================================

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Enhanced database client already initialized');
      return;
    }

    logger.info('Initializing enhanced database client');
    
    try {
      await this.connectionPool.initialize();
      this.isInitialized = true;
      
      logger.info('Enhanced database client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize enhanced database client', { error });
      throw error;
    }
  }

  // ================================
  // Core Database Operations
  // ================================

  /**
   * Execute a function with a database connection
   */
  async withConnection<T>(
    operation: (client: PrismaClient) => Promise<T>,
    operationName = 'database_operation'
  ): Promise<T> {
    this.ensureInitialized();
    
    return this.connectionPool.executeQuery(operation, operationName);
  }

  /**
   * Execute multiple operations in a transaction
   */
  async withTransaction<T>(
    operations: (client: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
    operationName = 'transaction'
  ): Promise<T> {
    this.ensureInitialized();
    
    return this.connectionPool.executeTransaction(operations, operationName);
  }

  /**
   * Execute an optimized prepared query
   */
  async executePreparedQuery<T>(
    query: string,
    parameters: any[],
    operation = 'prepared_query'
  ): Promise<T> {
    this.ensureInitialized();
    
    return this.queryOptimizer.executePreparedQuery<T>(query, parameters, operation);
  }

  /**
   * Execute batch queries with optional transaction
   */
  async executeBatch<T>(
    queries: Array<{ query: string; parameters: any[]; operation?: string }>,
    useTransaction = true
  ): Promise<T[]> {
    this.ensureInitialized();
    
    return this.queryOptimizer.executeBatchQuery<T>(queries, useTransaction);
  }

  // ================================
  // Query Analysis and Optimization
  // ================================

  /**
   * Analyze a query for potential optimizations
   */
  analyzeQuery(query: string) {
    return this.queryOptimizer.analyzeQuery(query);
  }

  /**
   * Get query execution plan
   */
  async explainQuery(query: string) {
    this.ensureInitialized();
    
    return this.queryOptimizer.explainQuery(query);
  }

  // ================================
  // Convenience Methods for Common Operations
  // ================================

  /**
   * User operations
   */
  get user() {
    return {
      findMany: (args?: any) => this.withConnection(client => client.user.findMany(args), 'user_findMany'),
      findUnique: (args: any) => this.withConnection(client => client.user.findUnique(args), 'user_findUnique'),
      findFirst: (args?: any) => this.withConnection(client => client.user.findFirst(args), 'user_findFirst'),
      create: (args: any) => this.withConnection(client => client.user.create(args), 'user_create'),
      update: (args: any) => this.withConnection(client => client.user.update(args), 'user_update'),
      updateMany: (args: any) => this.withConnection(client => client.user.updateMany(args), 'user_updateMany'),
      upsert: (args: any) => this.withConnection(client => client.user.upsert(args), 'user_upsert'),
      delete: (args: any) => this.withConnection(client => client.user.delete(args), 'user_delete'),
      deleteMany: (args?: any) => this.withConnection(client => client.user.deleteMany(args), 'user_deleteMany'),
      count: (args?: any) => this.withConnection(client => client.user.count(args), 'user_count'),
      aggregate: (args: any) => this.withConnection(client => client.user.aggregate(args), 'user_aggregate'),
      groupBy: (args: any) => this.withConnection(client => client.user.groupBy(args), 'user_groupBy'),
    };
  }

  /**
   * Todo operations
   */
  get todo() {
    return {
      findMany: (args?: any) => this.withConnection(client => client.todo.findMany(args), 'todo_findMany'),
      findUnique: (args: any) => this.withConnection(client => client.todo.findUnique(args), 'todo_findUnique'),
      findFirst: (args?: any) => this.withConnection(client => client.todo.findFirst(args), 'todo_findFirst'),
      create: (args: any) => this.withConnection(client => client.todo.create(args), 'todo_create'),
      update: (args: any) => this.withConnection(client => client.todo.update(args), 'todo_update'),
      updateMany: (args: any) => this.withConnection(client => client.todo.updateMany(args), 'todo_updateMany'),
      upsert: (args: any) => this.withConnection(client => client.todo.upsert(args), 'todo_upsert'),
      delete: (args: any) => this.withConnection(client => client.todo.delete(args), 'todo_delete'),
      deleteMany: (args?: any) => this.withConnection(client => client.todo.deleteMany(args), 'todo_deleteMany'),
      count: (args?: any) => this.withConnection(client => client.todo.count(args), 'todo_count'),
      aggregate: (args: any) => this.withConnection(client => client.todo.aggregate(args), 'todo_aggregate'),
      groupBy: (args: any) => this.withConnection(client => client.todo.groupBy(args), 'todo_groupBy'),
    };
  }

  /**
   * TodoList operations
   */
  get todoList() {
    return {
      findMany: (args?: any) => this.withConnection(client => client.todoList.findMany(args), 'todoList_findMany'),
      findUnique: (args: any) => this.withConnection(client => client.todoList.findUnique(args), 'todoList_findUnique'),
      findFirst: (args?: any) => this.withConnection(client => client.todoList.findFirst(args), 'todoList_findFirst'),
      create: (args: any) => this.withConnection(client => client.todoList.create(args), 'todoList_create'),
      update: (args: any) => this.withConnection(client => client.todoList.update(args), 'todoList_update'),
      updateMany: (args: any) => this.withConnection(client => client.todoList.updateMany(args), 'todoList_updateMany'),
      upsert: (args: any) => this.withConnection(client => client.todoList.upsert(args), 'todoList_upsert'),
      delete: (args: any) => this.withConnection(client => client.todoList.delete(args), 'todoList_delete'),
      deleteMany: (args?: any) => this.withConnection(client => client.todoList.deleteMany(args), 'todoList_deleteMany'),
      count: (args?: any) => this.withConnection(client => client.todoList.count(args), 'todoList_count'),
      aggregate: (args: any) => this.withConnection(client => client.todoList.aggregate(args), 'todoList_aggregate'),
      groupBy: (args: any) => this.withConnection(client => client.todoList.groupBy(args), 'todoList_groupBy'),
    };
  }

  /**
   * Session operations
   */
  get session() {
    return {
      findMany: (args?: any) => this.withConnection(client => client.session.findMany(args), 'session_findMany'),
      findUnique: (args: any) => this.withConnection(client => client.session.findUnique(args), 'session_findUnique'),
      findFirst: (args?: any) => this.withConnection(client => client.session.findFirst(args), 'session_findFirst'),
      create: (args: any) => this.withConnection(client => client.session.create(args), 'session_create'),
      update: (args: any) => this.withConnection(client => client.session.update(args), 'session_update'),
      updateMany: (args: any) => this.withConnection(client => client.session.updateMany(args), 'session_updateMany'),
      upsert: (args: any) => this.withConnection(client => client.session.upsert(args), 'session_upsert'),
      delete: (args: any) => this.withConnection(client => client.session.delete(args), 'session_delete'),
      deleteMany: (args?: any) => this.withConnection(client => client.session.deleteMany(args), 'session_deleteMany'),
      count: (args?: any) => this.withConnection(client => client.session.count(args), 'session_count'),
      aggregate: (args: any) => this.withConnection(client => client.session.aggregate(args), 'session_aggregate'),
      groupBy: (args: any) => this.withConnection(client => client.session.groupBy(args), 'session_groupBy'),
    };
  }

  /**
   * Domain event operations
   */
  get domainEvent() {
    return {
      findMany: (args?: any) => this.withConnection(client => client.domainEvent.findMany(args), 'domainEvent_findMany'),
      findUnique: (args: any) => this.withConnection(client => client.domainEvent.findUnique(args), 'domainEvent_findUnique'),
      findFirst: (args?: any) => this.withConnection(client => client.domainEvent.findFirst(args), 'domainEvent_findFirst'),
      create: (args: any) => this.withConnection(client => client.domainEvent.create(args), 'domainEvent_create'),
      update: (args: any) => this.withConnection(client => client.domainEvent.update(args), 'domainEvent_update'),
      updateMany: (args: any) => this.withConnection(client => client.domainEvent.updateMany(args), 'domainEvent_updateMany'),
      upsert: (args: any) => this.withConnection(client => client.domainEvent.upsert(args), 'domainEvent_upsert'),
      delete: (args: any) => this.withConnection(client => client.domainEvent.delete(args), 'domainEvent_delete'),
      deleteMany: (args?: any) => this.withConnection(client => client.domainEvent.deleteMany(args), 'domainEvent_deleteMany'),
      count: (args?: any) => this.withConnection(client => client.domainEvent.count(args), 'domainEvent_count'),
      aggregate: (args: any) => this.withConnection(client => client.domainEvent.aggregate(args), 'domainEvent_aggregate'),
      groupBy: (args: any) => this.withConnection(client => client.domainEvent.groupBy(args), 'domainEvent_groupBy'),
    };
  }

  // ================================
  // Raw Query Methods
  // ================================

  async $queryRaw<T>(query: TemplateStringsArray, ...values: any[]): Promise<T> {
    const rawQuery = String.raw({ raw: query }, ...values);
    return this.executePreparedQuery<T>(rawQuery, values);
  }

  async $queryRawUnsafe<T>(query: string, ...values: any[]): Promise<T> {
    return this.executePreparedQuery<T>(query, values);
  }

  async $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<number> {
    const rawQuery = String.raw({ raw: query }, ...values);
    return this.withConnection(client => client.$executeRawUnsafe(rawQuery, ...values), 'execute_raw');
  }

  async $executeRawUnsafe(query: string, ...values: any[]): Promise<number> {
    return this.withConnection(client => client.$executeRawUnsafe(query, ...values), 'execute_raw_unsafe');
  }

  // ================================
  // Health and Statistics
  // ================================

  async getHealthStatus() {
    const poolHealth = await this.connectionPool.getHealthStatus();
    const optimizerStats = this.queryOptimizer.getQueryStats();
    
    return {
      healthy: poolHealth.healthy && this.isInitialized,
      pool: poolHealth,
      optimizer: optimizerStats,
      initialized: this.isInitialized,
    };
  }

  getConnectionStats() {
    return this.connectionPool.getStats();
  }

  getQueryStats() {
    return this.queryOptimizer.getQueryStats();
  }

  getPreparedStatements() {
    return this.queryOptimizer.getPreparedStatements();
  }

  getQueryAnalysisCache() {
    return this.queryOptimizer.getQueryAnalysisCache();
  }

  // ================================
  // Maintenance and Cleanup
  // ================================

  private setupCleanupTasks(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.queryOptimizer.cleanup();
    }, 60 * 60 * 1000);
  }

  cleanup(): void {
    this.queryOptimizer.cleanup();
  }

  // ================================
  // Shutdown
  // ================================

  async shutdown(): Promise<void> {
    logger.info('Shutting down enhanced database client');
    
    try {
      await this.connectionPool.shutdown();
      this.isInitialized = false;
      
      logger.info('Enhanced database client shutdown completed');
    } catch (error) {
      logger.error('Error during enhanced database client shutdown', { error });
      throw error;
    }
  }

  // ================================
  // Utility Methods
  // ================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Enhanced database client not initialized. Call initialize() first.');
    }
  }

  /**
   * Get database configuration
   */
  getConfig() {
    return getDatabaseConfig();
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<{ success: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.withConnection(client => client.$queryRaw`SELECT 1 as test`, 'connection_test');
      
      return {
        success: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ================================
// Singleton Instance
// ================================

let enhancedClient: EnhancedDatabaseClient | null = null;

export function getEnhancedDatabaseClient(
  poolConfig?: Partial<import('./connection-pool.js').ConnectionPoolConfig>,
  optimizerConfig?: Partial<{
    enableQueryAnalysis: boolean;
    enablePreparedStatements: boolean;
    slowQueryThreshold: number;
    maxPreparedStatements: number;
    maxQueryCacheSize: number;
  }>
): EnhancedDatabaseClient {
  if (!enhancedClient) {
    enhancedClient = new EnhancedDatabaseClient(poolConfig, optimizerConfig);
  }
  
  return enhancedClient;
}

export async function initializeEnhancedDatabase(
  poolConfig?: Partial<import('./connection-pool.js').ConnectionPoolConfig>,
  optimizerConfig?: Partial<{
    enableQueryAnalysis: boolean;
    enablePreparedStatements: boolean;
    slowQueryThreshold: number;
    maxPreparedStatements: number;
    maxQueryCacheSize: number;
  }>
): Promise<EnhancedDatabaseClient> {
  if (enhancedClient) {
    logger.warn('Enhanced database client already initialized');
    return enhancedClient;
  }
  
  enhancedClient = new EnhancedDatabaseClient(poolConfig, optimizerConfig);
  await enhancedClient.initialize();
  
  return enhancedClient;
}

export async function shutdownEnhancedDatabase(): Promise<void> {
  if (enhancedClient) {
    await enhancedClient.shutdown();
    enhancedClient = null;
  }
}