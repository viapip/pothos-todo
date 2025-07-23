/**
 * Enhanced development server using UnJS listhen with advanced features
 * Provides hot reload, auto-restart, and comprehensive development tools
 */

import { listen } from 'listhen';
import { createApp, toNodeListener } from 'h3';
import { logger, pathUtils, objectUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { router } from '@/infrastructure/router/UnJSRouter.js';
import { webSocketServer } from '@/infrastructure/websocket/UnJSWebSocket.js';
import { fileSystemService } from '@/infrastructure/filesystem/UnJSFileSystem.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { watch } from 'chokidar';
import type { Listener } from 'listhen';
import type { FSWatcher } from 'chokidar';

export interface DevServerOptions {
  port?: number;
  host?: string;
  https?: boolean;
  autoRestart?: boolean;
  hotReload?: boolean;
  watchPaths?: string[];
  ignorePaths?: string[];
  middleware?: any[];
  proxies?: Record<string, string>;
  devtools?: boolean;
  cors?: boolean;
}

export interface ServerMetrics {
  uptime: number;
  requests: number;
  errors: number;
  averageResponseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

/**
 * Enhanced development server with hot reload and monitoring
 */
export class UnJSDevServer {
  private listener?: Listener;
  private app = createApp();
  private watchers: FSWatcher[] = [];
  private config: any;
  private metrics: ServerMetrics;
  private startTime: number = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];

  constructor(options: DevServerOptions = {}) {
    this.config = {
      port: 4000,
      host: 'localhost',
      https: false,
      autoRestart: true,
      hotReload: true,
      watchPaths: ['src/**/*', 'config/**/*', '*.config.*'],
      ignorePaths: ['node_modules', 'dist', '.git', '*.log'],
      devtools: true,
      cors: true,
      ...options
    };

    this.metrics = {
      uptime: 0,
      requests: 0,
      errors: 0,
      averageResponseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    this.setupApp();
    this.setupMetricsCollection();
  }

  /**
   * Setup H3 application with middleware and routes
   */
  private setupApp(): void {
    // Add router
    this.app.use('/api', router.getH3Router());

    // Add development routes
    this.addDevRoutes();

    // Add middleware for metrics collection
    this.app.use('/', async (event, next) => {
      const start = Date.now();
      this.requestCount++;

      try {
        await next(event);
      } catch (error) {
        this.errorCount++;
        throw error;
      } finally {
        const duration = Date.now() - start;
        this.responseTimes.push(duration);
        
        // Keep only last 100 response times
        if (this.responseTimes.length > 100) {
          this.responseTimes = this.responseTimes.slice(-100);
        }
      }
    });

    logger.debug('Development server app configured');
  }

  /**
   * Add development-specific routes
   */
  private addDevRoutes(): void {
    if (!this.config.devtools) return;

    // Health check
    router.addRoute({
      path: '/health',
      method: 'GET',
      handler: async (event) => {
        return {
          status: 'healthy',
          timestamp: new Date(),
          uptime: Date.now() - this.startTime,
          version: process.version,
          environment: process.env.NODE_ENV || 'development'
        };
      },
      description: 'Health check endpoint'
    });

    // Server metrics
    router.addRoute({
      path: '/metrics',
      method: 'GET',
      handler: async (event) => {
        this.updateMetrics();
        return this.metrics;
      },
      description: 'Server metrics and statistics'
    });

    // Configuration info
    router.addRoute({
      path: '/config',
      method: 'GET',
      handler: async (event) => {
        const config = configManager.getConfig();
        // Remove sensitive information
        const sanitized = objectUtils.omit(config, [
          'database.url',
          'security.sessionSecret',
          'ai.openaiApiKey',
          'redis.password'
        ]);
        return sanitized;
      },
      description: 'Current server configuration (sanitized)'
    });

    // Routes info
    router.addRoute({
      path: '/routes',
      method: 'GET',
      handler: async (event) => {
        return {
          routes: router.getRoutes().map(route => ({
            method: route.method,
            path: route.path,
            description: route.description,
            hasAuth: !!route.auth?.required,
            hasValidation: !!route.validation,
            hasCache: !!route.cache?.enabled
          })),
          stats: router.getStats()
        };
      },
      description: 'Available routes and routing statistics'
    });

    // File system stats
    router.addRoute({
      path: '/fs/stats',
      method: 'GET',
      handler: async (event) => {
        return await fileSystemService.getStats();
      },
      description: 'File system statistics'
    });

    // HTTP client stats
    router.addRoute({
      path: '/http/stats',
      method: 'GET',
      handler: async (event) => {
        return httpClient.getMetricsSummary();
      },
      description: 'HTTP client statistics'
    });

    // WebSocket stats
    router.addRoute({
      path: '/ws/stats',
      method: 'GET',
      handler: async (event) => {
        return webSocketServer.getStats();
      },
      description: 'WebSocket server statistics'
    });

    // Hot reload trigger (for development)
    router.addRoute({
      path: '/dev/reload',
      method: 'POST',
      handler: async (event) => {
        if (this.config.hotReload) {
          logger.info('Manual hot reload triggered');
          await this.triggerReload();
          return { status: 'reloaded', timestamp: new Date() };
        }
        return { status: 'hot reload disabled' };
      },
      description: 'Trigger manual hot reload'
    });

    // Cache management
    router.addRoute({
      path: '/dev/cache/clear',
      method: 'POST',
      handler: async (event) => {
        router.clearCache();
        await httpClient.clearCache();
        return { status: 'cache cleared', timestamp: new Date() };
      },
      description: 'Clear all caches'
    });

    logger.debug('Development routes added');
  }

  /**
   * Setup metrics collection
   */
  private setupMetricsCollection(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
    }, 30000);
  }

  /**
   * Update server metrics
   */
  private updateMetrics(): void {
    this.metrics = {
      uptime: Date.now() - this.startTime,
      requests: this.requestCount,
      errors: this.errorCount,
      averageResponseTime: this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  /**
   * Setup file watching for hot reload
   */
  private async setupFileWatching(): Promise<void> {
    if (!this.config.hotReload) return;

    for (const watchPath of this.config.watchPaths) {
      const watcher = watch(watchPath, {
        ignored: this.config.ignorePaths,
        persistent: true,
        ignoreInitial: true
      });

      watcher.on('change', async (filePath) => {
        logger.info('File changed, triggering reload', { filePath });
        await this.triggerReload();
      });

      watcher.on('add', async (filePath) => {
        logger.debug('File added', { filePath });
      });

      watcher.on('unlink', async (filePath) => {
        logger.debug('File removed', { filePath });
        await this.triggerReload();
      });

      this.watchers.push(watcher);
      logger.debug('File watcher setup', { path: watchPath });
    }
  }

  /**
   * Trigger hot reload
   */
  private async triggerReload(): Promise<void> {
    try {
      // Clear module cache (simplified - in real scenario would be more sophisticated)
      logger.info('Hot reload triggered');
      
      // Reload configuration
      await configManager.reloadConfiguration();
      
      // Clear router cache
      router.clearCache();
      
      // Clear HTTP client cache
      await httpClient.clearCache();
      
      logger.success('Hot reload completed');
      
    } catch (error) {
      logger.error('Hot reload failed', { error });
    }
  }

  /**
   * Start the development server
   */
  async start(): Promise<void> {
    try {
      // Load configuration
      const { config } = await configManager.loadConfiguration();
      
      // Start WebSocket server if enabled
      if (config.features?.subscriptions !== false) {
        await webSocketServer.start(this.config.port + 1, this.config.host);
        logger.info('WebSocket server started', { 
          port: this.config.port + 1,
          host: this.config.host 
        });
      }

      // Setup file watching
      await this.setupFileWatching();

      // Start HTTP server
      this.listener = await listen(toNodeListener(this.app), {
        port: this.config.port,
        hostname: this.config.host,
        https: this.config.https,
        showURL: true,
        open: false, // Don't auto-open browser in development
      });

      logger.success('Development server started', {
        url: this.listener.url,
        port: this.config.port,
        host: this.config.host,
        https: this.config.https,
        hotReload: this.config.hotReload,
        devtools: this.config.devtools
      });

      // Display useful development information
      this.displayDevInfo();

    } catch (error) {
      logger.error('Failed to start development server', { error });
      throw error;
    }
  }

  /**
   * Display development information
   */
  private displayDevInfo(): void {
    const baseUrl = this.listener?.url || `http://${this.config.host}:${this.config.port}`;
    
    console.log('\n🚀 Development Server Ready!\n');
    console.log(`Server: ${baseUrl}`);
    console.log(`WebSocket: ws://${this.config.host}:${this.config.port + 1}`);
    
    if (this.config.devtools) {
      console.log('\n📊 Development Endpoints:');
      console.log(`Health: ${baseUrl}/api/health`);
      console.log(`Metrics: ${baseUrl}/api/metrics`);
      console.log(`Config: ${baseUrl}/api/config`);
      console.log(`Routes: ${baseUrl}/api/routes`);
      console.log(`File Stats: ${baseUrl}/api/fs/stats`);
    }
    
    if (this.config.hotReload) {
      console.log('\n🔥 Hot Reload: Enabled');
      console.log('Watching:', this.config.watchPaths.join(', '));
    }
    
    console.log('\n⚡ Features:');
    console.log(`CORS: ${this.config.cors ? 'Enabled' : 'Disabled'}`);
    console.log(`HTTPS: ${this.config.https ? 'Enabled' : 'Disabled'}`);
    console.log(`Auto-restart: ${this.config.autoRestart ? 'Enabled' : 'Disabled'}`);
    
    console.log('\n');
  }

  /**
   * Stop the development server
   */
  async stop(): Promise<void> {
    logger.info('Stopping development server...');

    // Stop file watchers
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];

    // Stop WebSocket server
    await webSocketServer.stop();

    // Stop HTTP server
    if (this.listener) {
      await this.listener.close();
      this.listener = undefined;
    }

    logger.success('Development server stopped');
  }

  /**
   * Restart the development server
   */
  async restart(): Promise<void> {
    logger.info('Restarting development server...');
    await this.stop();
    await this.start();
  }

  /**
   * Get server metrics
   */
  getMetrics(): ServerMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    uptime: number;
    url?: string;
    config: any;
  } {
    return {
      running: !!this.listener,
      uptime: Date.now() - this.startTime,
      url: this.listener?.url,
      config: {
        port: this.config.port,
        host: this.config.host,
        https: this.config.https,
        hotReload: this.config.hotReload,
        devtools: this.config.devtools
      }
    };
  }
}

// Export singleton instance
export const devServer = new UnJSDevServer();

// Export types
export { DevServerOptions, ServerMetrics };