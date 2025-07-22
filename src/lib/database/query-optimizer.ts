/**
 * Database Query Optimizer
 * Query analysis, optimization, and prepared statement management
 */

import { logger } from '../../logger.js';
import type { DatabaseConnectionPool } from './connection-pool.js';

// ================================
// Types and Interfaces
// ================================

export interface QueryPlan {
  query: string;
  estimatedCost: number;
  indexRecommendations: string[];
  optimizationSuggestions: string[];
  executionTime?: number;
  isOptimized: boolean;
}

export interface PreparedStatement {
  id: string;
  query: string;
  parameters: string[];
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  averageExecutionTime: number;
}

export interface QueryAnalysis {
  originalQuery: string;
  optimizedQuery: string;
  improvements: string[];
  potentialIssues: string[];
  performanceGain?: number;
}

export interface QueryStats {
  totalQueries: number;
  optimizedQueries: number;
  preparedStatements: number;
  averageExecutionTime: number;
  slowestQueries: Array<{ query: string; duration: number; timestamp: number }>;
}

// ================================
// Query Optimization Patterns
// ================================

const OPTIMIZATION_PATTERNS = {
  // N+1 query detection
  nPlusOne: /SELECT \* FROM (\w+) WHERE (\w+)_id = \$1/gi,
  
  // Missing indexes
  fullTableScan: /SELECT .* FROM (\w+) WHERE (?!.*INDEX)/gi,
  
  // Inefficient joins
  cartesianProduct: /FROM (\w+), (\w+) WHERE/gi,
  
  // Suboptimal LIKE patterns
  leadingWildcard: /LIKE '%.*'/gi,
  
  // Missing LIMIT clauses
  unboundedQueries: /SELECT .* FROM (\w+)(?!.*LIMIT)/gi,
  
  // Inefficient COUNT queries
  countStar: /COUNT\(\*\) FROM (\w+) WHERE/gi,
};

const QUERY_IMPROVEMENTS = {
  // Use indexes
  addIndex: (table: string, column: string) => 
    `Consider adding an index on ${table}(${column})`,
  
  // Use prepared statements
  usePreparedStatement: (query: string) => 
    `Convert to prepared statement to improve performance`,
  
  // Optimize joins
  useExplicitJoins: () => 
    `Use explicit JOIN syntax instead of implicit joins`,
  
  // Add LIMIT clauses
  addLimit: () => 
    `Add LIMIT clause to prevent unbounded result sets`,
  
  // Optimize LIKE patterns
  optimizeLike: () => 
    `Avoid leading wildcards in LIKE patterns for better index usage`,
  
  // Use EXISTS instead of COUNT
  useExists: () => 
    `Use EXISTS instead of COUNT(*) for boolean checks`,
};

// ================================
// Database Query Optimizer
// ================================

export class DatabaseQueryOptimizer {
  private preparedStatements = new Map<string, PreparedStatement>();
  private queryCache = new Map<string, QueryAnalysis>();
  private queryStats = {
    totalQueries: 0,
    optimizedQueries: 0,
    executionTimes: [] as number[],
    slowQueries: [] as Array<{ query: string; duration: number; timestamp: number }>,
  };

  constructor(
    private connectionPool: DatabaseConnectionPool,
    private options: {
      enableQueryAnalysis: boolean;
      enablePreparedStatements: boolean;
      slowQueryThreshold: number;
      maxPreparedStatements: number;
      maxQueryCacheSize: number;
    } = {
      enableQueryAnalysis: true,
      enablePreparedStatements: true,
      slowQueryThreshold: 1000,
      maxPreparedStatements: 100,
      maxQueryCacheSize: 500,
    }
  ) {}

  // ================================
  // Query Analysis
  // ================================

  analyzeQuery(query: string): QueryAnalysis {
    const cacheKey = this.generateQueryHash(query);
    
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)!;
    }

    const analysis = this.performQueryAnalysis(query);
    
    // Cache the analysis
    if (this.queryCache.size >= this.options.maxQueryCacheSize) {
      // Remove oldest entry
      const oldestKey = this.queryCache.keys().next().value;
      this.queryCache.delete(oldestKey);
    }
    
    this.queryCache.set(cacheKey, analysis);
    
    return analysis;
  }

  private performQueryAnalysis(query: string): QueryAnalysis {
    const normalizedQuery = query.trim().toLowerCase();
    const improvements: string[] = [];
    const potentialIssues: string[] = [];
    
    // Check for N+1 queries
    if (OPTIMIZATION_PATTERNS.nPlusOne.test(normalizedQuery)) {
      potentialIssues.push('Potential N+1 query detected');
      improvements.push('Consider using batch loading or joins to fetch related data');
    }

    // Check for missing indexes
    if (OPTIMIZATION_PATTERNS.fullTableScan.test(normalizedQuery)) {
      potentialIssues.push('Potential full table scan');
      improvements.push('Consider adding indexes on frequently queried columns');
    }

    // Check for cartesian products
    if (OPTIMIZATION_PATTERNS.cartesianProduct.test(normalizedQuery)) {
      potentialIssues.push('Potential cartesian product in join');
      improvements.push(QUERY_IMPROVEMENTS.useExplicitJoins());
    }

    // Check for leading wildcards
    if (OPTIMIZATION_PATTERNS.leadingWildcard.test(normalizedQuery)) {
      potentialIssues.push('Leading wildcard in LIKE clause');
      improvements.push(QUERY_IMPROVEMENTS.optimizeLike());
    }

    // Check for unbounded queries
    if (OPTIMIZATION_PATTERNS.unboundedQueries.test(normalizedQuery)) {
      potentialIssues.push('Query without LIMIT clause');
      improvements.push(QUERY_IMPROVEMENTS.addLimit());
    }

    // Check for inefficient COUNT queries
    if (OPTIMIZATION_PATTERNS.countStar.test(normalizedQuery)) {
      potentialIssues.push('Using COUNT(*) for existence check');
      improvements.push(QUERY_IMPROVEMENTS.useExists());
    }

    // Generate optimized query
    const optimizedQuery = this.generateOptimizedQuery(query, improvements);

    return {
      originalQuery: query,
      optimizedQuery,
      improvements,
      potentialIssues,
    };
  }

  private generateOptimizedQuery(originalQuery: string, improvements: string[]): string {
    let optimized = originalQuery;

    // Apply basic optimizations
    if (improvements.some(i => i.includes('LIMIT'))) {
      if (!optimized.toLowerCase().includes('limit')) {
        // Add a reasonable default LIMIT if none exists
        optimized += ' LIMIT 1000';
      }
    }

    // Convert implicit joins to explicit joins
    if (improvements.some(i => i.includes('JOIN'))) {
      optimized = optimized.replace(
        /FROM (\w+), (\w+) WHERE (\w+)\.(\w+) = (\w+)\.(\w+)/gi,
        'FROM $1 JOIN $2 ON $1.$4 = $2.$6'
      );
    }

    // Optimize LIKE patterns (remove leading wildcards where possible)
    if (improvements.some(i => i.includes('LIKE'))) {
      // This is a simplified optimization - in practice, you'd need more context
      optimized = optimized.replace(/LIKE '%([^%]+)'/gi, "LIKE '$1%'");
    }

    return optimized;
  }

  // ================================
  // Prepared Statements
  // ================================

  async executePreparedQuery<T>(
    queryTemplate: string,
    parameters: any[],
    operation = 'prepared_query'
  ): Promise<T> {
    if (!this.options.enablePreparedStatements) {
      return this.connectionPool.executeQuery(
        client => client.$queryRawUnsafe(queryTemplate, ...parameters),
        operation
      );
    }

    const statementId = this.generateQueryHash(queryTemplate);
    
    // Register prepared statement if not exists
    if (!this.preparedStatements.has(statementId)) {
      this.registerPreparedStatement(queryTemplate, parameters, statementId);
    }

    // Update usage statistics
    const statement = this.preparedStatements.get(statementId)!;
    statement.lastUsed = Date.now();
    statement.usageCount++;

    const startTime = Date.now();
    
    try {
      const result = await this.connectionPool.executeQuery<T>(
        client => client.$queryRawUnsafe(queryTemplate, ...parameters),
        operation
      );
      
      const executionTime = Date.now() - startTime;
      this.updateExecutionStats(statement, executionTime);
      
      return result;
    } catch (error) {
      logger.error('Prepared statement execution failed', {
        statementId,
        query: queryTemplate.slice(0, 100),
        parameters,
        error,
      });
      throw error;
    }
  }

  private registerPreparedStatement(
    query: string,
    parameters: any[],
    statementId: string
  ): void {
    // Remove oldest prepared statement if we've reached the limit
    if (this.preparedStatements.size >= this.options.maxPreparedStatements) {
      let oldestId = '';
      let oldestTime = Infinity;
      
      for (const [id, stmt] of this.preparedStatements.entries()) {
        if (stmt.lastUsed < oldestTime) {
          oldestTime = stmt.lastUsed;
          oldestId = id;
        }
      }
      
      if (oldestId) {
        this.preparedStatements.delete(oldestId);
        logger.debug('Removed old prepared statement', { statementId: oldestId });
      }
    }

    const statement: PreparedStatement = {
      id: statementId,
      query,
      parameters: parameters.map(p => typeof p),
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
      averageExecutionTime: 0,
    };

    this.preparedStatements.set(statementId, statement);
    
    logger.debug('Registered prepared statement', {
      statementId,
      query: query.slice(0, 100),
    });
  }

  private updateExecutionStats(statement: PreparedStatement, executionTime: number): void {
    // Update average execution time using rolling average
    const totalTime = statement.averageExecutionTime * (statement.usageCount - 1) + executionTime;
    statement.averageExecutionTime = totalTime / statement.usageCount;

    // Track slow queries
    if (executionTime > this.options.slowQueryThreshold) {
      this.queryStats.slowQueries.push({
        query: statement.query,
        duration: executionTime,
        timestamp: Date.now(),
      });

      // Keep only recent slow queries
      if (this.queryStats.slowQueries.length > 50) {
        this.queryStats.slowQueries.shift();
      }
    }

    // Update global stats
    this.queryStats.totalQueries++;
    this.queryStats.executionTimes.push(executionTime);
    
    // Keep only recent execution times for average calculation
    if (this.queryStats.executionTimes.length > 1000) {
      this.queryStats.executionTimes.shift();
    }
  }

  // ================================
  // Query Plan Analysis
  // ================================

  async explainQuery(query: string): Promise<QueryPlan> {
    const startTime = Date.now();
    
    try {
      // Execute EXPLAIN ANALYZE to get query plan
      const explainResult = await this.connectionPool.executeQuery(
        client => client.$queryRawUnsafe(`EXPLAIN ANALYZE ${query}`),
        'explain_query'
      );

      const executionTime = Date.now() - startTime;
      
      return this.parseQueryPlan(explainResult as any[], query, executionTime);
    } catch (error) {
      logger.error('Failed to explain query', { query: query.slice(0, 100), error });
      
      // Return basic analysis based on query structure
      return this.fallbackQueryAnalysis(query);
    }
  }

  private parseQueryPlan(planRows: any[], query: string, executionTime: number): QueryPlan {
    const plan = planRows.map(row => row['QUERY PLAN'] || row).join('\n');
    const estimatedCost = this.extractCostFromPlan(plan);
    const indexRecommendations = this.generateIndexRecommendations(plan);
    const optimizationSuggestions = this.generateOptimizationSuggestions(plan);
    
    return {
      query,
      estimatedCost,
      indexRecommendations,
      optimizationSuggestions,
      executionTime,
      isOptimized: estimatedCost < 1000 && !plan.includes('Seq Scan'),
    };
  }

  private extractCostFromPlan(plan: string): number {
    const costMatch = plan.match(/cost=([0-9.]+)\.\.[0-9.]+/);
    return costMatch ? parseFloat(costMatch[1]) : 0;
  }

  private generateIndexRecommendations(plan: string): string[] {
    const recommendations: string[] = [];
    
    if (plan.includes('Seq Scan')) {
      recommendations.push('Consider adding indexes to eliminate sequential scans');
    }
    
    if (plan.includes('Hash Join')) {
      recommendations.push('Hash joins detected - verify indexes on join columns');
    }
    
    if (plan.includes('Sort')) {
      recommendations.push('Sort operations detected - consider adding indexes for ORDER BY clauses');
    }
    
    return recommendations;
  }

  private generateOptimizationSuggestions(plan: string): string[] {
    const suggestions: string[] = [];
    
    if (plan.includes('Nested Loop')) {
      suggestions.push('Consider restructuring joins to use more efficient join algorithms');
    }
    
    if (plan.includes('Bitmap Heap Scan')) {
      suggestions.push('Bitmap scans indicate potential for index optimization');
    }
    
    const costMatch = plan.match(/cost=([0-9.]+)/);
    if (costMatch && parseFloat(costMatch[1]) > 10000) {
      suggestions.push('High cost query - consider breaking into smaller operations');
    }
    
    return suggestions;
  }

  private fallbackQueryAnalysis(query: string): QueryPlan {
    const analysis = this.analyzeQuery(query);
    
    return {
      query,
      estimatedCost: 1000, // Default moderate cost
      indexRecommendations: analysis.improvements,
      optimizationSuggestions: analysis.potentialIssues,
      isOptimized: false,
    };
  }

  // ================================
  // Batch Operations
  // ================================

  async executeBatchQuery<T>(
    queries: Array<{ query: string; parameters: any[]; operation?: string }>,
    useTransaction = true
  ): Promise<T[]> {
    if (useTransaction) {
      return this.connectionPool.executeTransaction(async (client) => {
        const results: T[] = [];
        
        for (const { query, parameters, operation = 'batch_query' } of queries) {
          const result = await client.$queryRawUnsafe<T>(query, ...parameters);
          results.push(result);
          
          // Update stats for each query in batch
          this.queryStats.totalQueries++;
        }
        
        return results;
      }, 'batch_transaction');
    } else {
      const results: T[] = [];
      
      for (const { query, parameters, operation = 'batch_query' } of queries) {
        const result = await this.executePreparedQuery<T>(query, parameters, operation);
        results.push(result);
      }
      
      return results;
    }
  }

  // ================================
  // Utility Methods
  // ================================

  private generateQueryHash(query: string): string {
    // Simple hash function for query identification
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // ================================
  // Statistics and Monitoring
  // ================================

  getQueryStats(): QueryStats {
    const avgExecutionTime = this.queryStats.executionTimes.length > 0
      ? this.queryStats.executionTimes.reduce((a, b) => a + b, 0) / this.queryStats.executionTimes.length
      : 0;

    const slowestQueries = [...this.queryStats.slowQueries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalQueries: this.queryStats.totalQueries,
      optimizedQueries: this.queryStats.optimizedQueries,
      preparedStatements: this.preparedStatements.size,
      averageExecutionTime: avgExecutionTime,
      slowestQueries,
    };
  }

  getPreparedStatements(): PreparedStatement[] {
    return Array.from(this.preparedStatements.values())
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  getQueryAnalysisCache(): QueryAnalysis[] {
    return Array.from(this.queryCache.values());
  }

  // ================================
  // Maintenance
  // ================================

  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old prepared statements
    for (const [id, statement] of this.preparedStatements.entries()) {
      if (now - statement.lastUsed > maxAge && statement.usageCount < 5) {
        this.preparedStatements.delete(id);
      }
    }

    // Clean up query cache
    const cacheEntries = Array.from(this.queryCache.entries());
    if (cacheEntries.length > this.options.maxQueryCacheSize * 0.8) {
      // Remove 20% of oldest entries
      const toRemove = Math.floor(cacheEntries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.queryCache.delete(cacheEntries[i][0]);
      }
    }

    // Clean up old slow queries
    this.queryStats.slowQueries = this.queryStats.slowQueries.filter(
      query => now - query.timestamp < maxAge
    );

    logger.debug('Query optimizer cleanup completed', {
      preparedStatements: this.preparedStatements.size,
      queryCacheSize: this.queryCache.size,
      slowQueriesCount: this.queryStats.slowQueries.length,
    });
  }
}