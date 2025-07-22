import { PrismaClient } from '@prisma/client';
import { getDatabaseConfig } from '../config/index.js';

// Global variable to store the Prisma client instance
declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Create Prisma client with optimized configuration
 */
function createPrismaClient(): PrismaClient {
  const dbConfig = getDatabaseConfig();
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return new PrismaClient({
    datasources: {
      db: {
        url: dbConfig.url
      }
    },
    
    // Connection pool configuration
    // Note: Connection pooling is handled by Prisma internally
    
    // Logging configuration
    log: isDevelopment 
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'info' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' }
        ]
      : [
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' }
        ],
    
    // Error formatting
    errorFormat: isDevelopment ? 'pretty' : 'minimal',
  });
}

/**
 * Enhanced Prisma client with connection management
 */
class EnhancedPrismaClient {
  private client: PrismaClient;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.client = createPrismaClient();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Handle query events for monitoring (development only)
    if (process.env.NODE_ENV === 'development') {
      try {
        // Note: Query event logging is available only with specific Prisma configurations
        // and may not be available in all setups
        (this.client.$on as any)?.('query', (event: any) => {
          if (event?.duration > 1000) { // Log slow queries (>1s)
            console.warn(`Slow query detected: ${event.duration}ms`, {
              query: event.query,
              params: event.params,
            });
          }
        });
      } catch (error) {
        // Ignore if query event is not available
      }
    }

    // Note: beforeExit is deprecated in Prisma 5.0+
    // Process exit handlers are set up at the module level instead
  }

  /**
   * Get the underlying Prisma client
   */
  get $client(): PrismaClient {
    return this.client;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    if (this.connectionPromise) return this.connectionPromise;
    
    this.connectionPromise = this.client.$connect().then(() => {
      this.isConnected = true;
      console.log('Connected to database');
    });
    
    return this.connectionPromise;
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    
    await this.client.$disconnect();
    this.isConnected = false;
    this.connectionPromise = null;
    console.log('Disconnected from database');
  }

  /**
   * Check database connection health
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    
    try {
      await this.client.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a raw query with error handling
   */
  async rawQuery<T = any>(sql: string, ...params: any[]): Promise<T> {
    try {
      return await this.client.$queryRawUnsafe<T>(sql, ...params);
    } catch (error) {
      console.error('Raw query failed:', { sql, params, error });
      throw error;
    }
  }

  /**
   * Execute multiple operations in a transaction
   */
  async transaction<T>(operations: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T> {
    return this.client.$transaction(operations);
  }

  /**
   * Get connection info
   */
  getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      hasConnectionPromise: this.connectionPromise !== null,
    };
  }

  // Proxy all Prisma client methods
  get user() { return this.client.user; }
  get session() { return this.client.session; }
  get todo() { return this.client.todo; }
  get todoList() { return this.client.todoList; }
  get domainEvent() { return this.client.domainEvent; }
  
  // Proxy utility methods
  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $queryRawUnsafe() { return this.client.$queryRawUnsafe.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }
  get $executeRawUnsafe() { return this.client.$executeRawUnsafe.bind(this.client); }
  get $transaction() { return this.client.$transaction.bind(this.client); }
  get $connect() { return this.client.$connect.bind(this.client); }
  get $disconnect() { return this.client.$disconnect.bind(this.client); }
  get $use() { return this.client.$use.bind(this.client); }
  get $on() { return this.client.$on.bind(this.client); }
  get $extends() { return this.client.$extends.bind(this.client); }
}

// Singleton pattern for Prisma client
let prisma: EnhancedPrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new EnhancedPrismaClient();
} else {
  // In development, use global variable to prevent re-initialization on hot reloads
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  // Create enhanced client using the global instance
  prisma = new EnhancedPrismaClient();
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await prisma.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Export the raw client as the default for backward compatibility with generated files  
// This is what the generated GraphQL files expect as the default import
const defaultPrismaClient = prisma.$client;
export default defaultPrismaClient;

// Named exports
export { prisma, EnhancedPrismaClient };