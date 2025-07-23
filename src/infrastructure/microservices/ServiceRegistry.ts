/**
 * Service Registry and Discovery System
 * Comprehensive microservices registry with health monitoring and load balancing
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { httpClient } from '@/infrastructure/http/UnJSHttpClient.js';
import { z } from 'zod';

export interface ServiceDefinition {
  id: string;
  name: string;
  version: string;
  type: 'api' | 'worker' | 'gateway' | 'database' | 'cache' | 'queue';
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping' | 'maintenance';
  endpoints: {
    health: string;
    metrics: string;
    api?: string;
    admin?: string;
  };
  network: {
    host: string;
    port: number;
    protocol: 'http' | 'https' | 'grpc' | 'tcp';
  };
  metadata: {
    region: string;
    zone: string;
    environment: string;
    tags: string[];
    dependencies: string[];
    capabilities: string[];
  };
  resources: {
    cpu: number;
    memory: number;
    disk: number;
    connections: number;
  };
  scaling: {
    minInstances: number;
    maxInstances: number;
    currentInstances: number;
    autoScale: boolean;
  };
  deployment: {
    strategy: 'rolling' | 'blue-green' | 'canary';
    rollbackOnFailure: boolean;
    healthCheckGracePeriod: number;
  };
  security: {
    authRequired: boolean;
    roles: string[];
    rateLimit: {
      requests: number;
      window: number;
    };
  };
}

export interface ServiceInstance {
  id: string;
  serviceId: string;
  host: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  lastHeartbeat: Date;
  startTime: Date;
  metadata: Record<string, any>;
  metrics: {
    requestCount: number;
    errorCount: number;
    avgResponseTime: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

export interface LoadBalancingStrategy {
  type: 'round-robin' | 'least-connections' | 'weighted' | 'random' | 'ip-hash';
  weights?: Map<string, number>;
  stickySession?: boolean;
}

/**
 * Comprehensive service registry with discovery and load balancing
 */
export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();
  private instances: Map<string, ServiceInstance[]> = new Map();
  private loadBalancers: Map<string, LoadBalancingStrategy> = new Map();
  private healthCheckInterval = 30000; // 30 seconds
  private instanceTimeout = 120000; // 2 minutes
  private circuit_breakers: Map<string, {
    failures: number;
    lastFailure: Date;
    state: 'closed' | 'open' | 'half-open';
    threshold: number;
    timeout: number;
  }> = new Map();

  constructor() {
    this.setupValidationSchemas();
    this.startHealthChecking();
    this.startInstanceCleanup();
    this.setupDefaultServices();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const serviceDefinitionSchema = z.object({
      name: z.string().min(1),
      version: z.string(),
      type: z.enum(['api', 'worker', 'gateway', 'database', 'cache', 'queue']),
      endpoints: z.object({
        health: z.string().url(),
        metrics: z.string().url(),
        api: z.string().url().optional(),
        admin: z.string().url().optional(),
      }),
      network: z.object({
        host: z.string(),
        port: z.number().min(1).max(65535),
        protocol: z.enum(['http', 'https', 'grpc', 'tcp']),
      }),
      metadata: z.object({
        region: z.string(),
        zone: z.string(),
        environment: z.string(),
        tags: z.array(z.string()),
        dependencies: z.array(z.string()),
        capabilities: z.array(z.string()),
      }),
    });

    validationService.registerSchema('serviceDefinition', serviceDefinitionSchema);
  }

  /**
   * Register a new service
   */
  registerService(service: Omit<ServiceDefinition, 'id'>): string {
    const id = stringUtils.random(12);
    const serviceDefinition: ServiceDefinition = {
      id,
      ...service,
    };

    this.services.set(id, serviceDefinition);
    this.instances.set(id, []);

    // Setup default load balancing
    this.loadBalancers.set(id, {
      type: 'round-robin',
      stickySession: false,
    });

    // Initialize circuit breaker
    this.circuit_breakers.set(id, {
      failures: 0,
      lastFailure: new Date(0),
      state: 'closed',
      threshold: 5,
      timeout: 60000, // 1 minute
    });

    logger.info('Service registered', {
      serviceId: id,
      name: service.name,
      version: service.version,
      type: service.type,
    });

    monitoring.recordMetric({
      name: 'microservices.service.registered',
      value: 1,
      tags: {
        service: service.name,
        version: service.version,
        type: service.type,
      },
    });

    return id;
  }

  /**
   * Register service instance
   */
  registerInstance(serviceId: string, instance: Omit<ServiceInstance, 'id' | 'serviceId' | 'lastHeartbeat' | 'startTime'>): string {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    const instanceId = stringUtils.random(8);
    const serviceInstance: ServiceInstance = {
      id: instanceId,
      serviceId,
      lastHeartbeat: new Date(),
      startTime: new Date(),
      ...instance,
    };

    const instances = this.instances.get(serviceId) || [];
    instances.push(serviceInstance);
    this.instances.set(serviceId, instances);

    logger.info('Service instance registered', {
      serviceId,
      instanceId,
      host: instance.host,
      port: instance.port,
    });

    monitoring.recordMetric({
      name: 'microservices.instance.registered',
      value: 1,
      tags: {
        service: service.name,
        serviceId,
        instanceId,
      },
    });

    return instanceId;
  }

  /**
   * Discover services by name or type
   */
  discoverServices(criteria: {
    name?: string;
    type?: string;
    tags?: string[];
    region?: string;
    environment?: string;
    healthyOnly?: boolean;
  }): ServiceDefinition[] {
    const services = Array.from(this.services.values());

    return services.filter(service => {
      if (criteria.name && service.name !== criteria.name) return false;
      if (criteria.type && service.type !== criteria.type) return false;
      if (criteria.region && service.metadata.region !== criteria.region) return false;
      if (criteria.environment && service.metadata.environment !== criteria.environment) return false;

      if (criteria.tags && !criteria.tags.every(tag => service.metadata.tags.includes(tag))) {
        return false;
      }

      if (criteria.healthyOnly && service.status !== 'healthy') return false;

      return true;
    });
  }

  /**
   * Get service instance with load balancing
   */
  getServiceInstance(serviceId: string, strategy?: LoadBalancingStrategy): ServiceInstance | null {
    const instances = this.instances.get(serviceId) || [];
    const healthyInstances = instances.filter(instance =>
      instance.status === 'healthy' &&
      Date.now() - instance.lastHeartbeat.getTime() < this.instanceTimeout
    );

    if (healthyInstances.length === 0) return null;

    const loadBalancer = strategy || this.loadBalancers.get(serviceId);
    if (!loadBalancer) return healthyInstances[0] || null;

    return this.applyLoadBalancing(healthyInstances, loadBalancer);
  }

  /**
 * Apply load balancing strategy
 */
  private applyLoadBalancing(instances: ServiceInstance[], strategy: LoadBalancingStrategy): ServiceInstance {
    if (instances.length === 0) {
      throw new Error('No instances available for load balancing');
    }

    switch (strategy.type) {
      case 'round-robin':
        return this.roundRobinSelection(instances);

      case 'least-connections':
        return this.leastConnectionsSelection(instances);

      case 'weighted':
        return this.weightedSelection(instances, strategy.weights || new Map());

      case 'random':
        return instances[Math.floor(Math.random() * instances.length)]!;

      case 'ip-hash':
        // Would use client IP for consistent routing
        return instances[0]!;

      default:
        return instances[0]!;
    }
  }

  /**
   * Round-robin selection
   */
  private roundRobinSelection(instances: ServiceInstance[]): ServiceInstance {
    // Simple round-robin implementation
    const now = Date.now();
    const index = Math.floor(now / 1000) % instances.length;
    return instances[index]!;
  }

  /**
   * Least connections selection
   */
  private leastConnectionsSelection(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((least, current) =>
      current.metrics.requestCount < least.metrics.requestCount ? current : least
    );
  }

  /**
 * Weighted selection
 */
  private weightedSelection(instances: ServiceInstance[], weights: Map<string, number>): ServiceInstance {
    const totalWeight = Array.from(weights.values()).reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (const instance of instances) {
      const weight = weights.get(instance.id) || 1;
      random -= weight;
      if (random <= 0) return instance;
    }

    return instances[0]!;
  }

  /**
   * Update instance heartbeat
   */
  updateHeartbeat(serviceId: string, instanceId: string, metrics?: Partial<ServiceInstance['metrics']>): void {
    const instances = this.instances.get(serviceId) || [];
    const instance = instances.find(i => i.id === instanceId);

    if (instance) {
      instance.lastHeartbeat = new Date();
      instance.status = 'healthy';

      if (metrics) {
        instance.metrics = { ...instance.metrics, ...metrics };
      }

      monitoring.recordMetric({
        name: 'microservices.heartbeat',
        value: 1,
        tags: {
          serviceId,
          instanceId,
          status: instance.status,
        },
      });
    }
  }

  /**
   * Remove service instance
   */
  removeInstance(serviceId: string, instanceId: string): void {
    const instances = this.instances.get(serviceId) || [];
    const filteredInstances = instances.filter(i => i.id !== instanceId);
    this.instances.set(serviceId, filteredInstances);

    logger.info('Service instance removed', { serviceId, instanceId });

    monitoring.recordMetric({
      name: 'microservices.instance.removed',
      value: 1,
      tags: { serviceId, instanceId },
    });
  }

  /**
   * Circuit breaker logic
   */
  async callService<T>(
    serviceId: string,
    path: string,
    options: any = {}
  ): Promise<T> {
    const circuitBreaker = this.circuit_breakers.get(serviceId);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker not found for service: ${serviceId}`);
    }

    // Check circuit breaker state
    if (circuitBreaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure.getTime();
      if (timeSinceLastFailure < circuitBreaker.timeout) {
        throw new Error(`Circuit breaker is open for service: ${serviceId}`);
      }
      circuitBreaker.state = 'half-open';
    }

    const instance = this.getServiceInstance(serviceId);
    if (!instance) {
      throw new Error(`No healthy instances available for service: ${serviceId}`);
    }

    const service = this.services.get(serviceId)!;
    const url = `${service.network.protocol}://${instance.host}:${instance.port}${path}`;

    try {
      const startTime = Date.now();
      const response = await httpClient.request<T>(url, options);
      const duration = Date.now() - startTime;

      // Update instance metrics
      instance.metrics.requestCount++;
      instance.metrics.avgResponseTime =
        (instance.metrics.avgResponseTime + duration) / 2;

      // Reset circuit breaker on success
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.state = 'closed';
        circuitBreaker.failures = 0;
      }

      monitoring.recordMetric({
        name: 'microservices.call.success',
        value: 1,
        tags: {
          serviceId,
          instanceId: instance.id,
          path,
        },
      });

      monitoring.recordMetric({
        name: 'microservices.call.duration',
        value: duration,
        tags: {
          serviceId,
          instanceId: instance.id,
        },
        unit: 'ms',
      });

      return response.data;

    } catch (error) {
      // Update failure metrics
      instance.metrics.errorCount++;
      circuitBreaker.failures++;
      circuitBreaker.lastFailure = new Date();

      // Open circuit breaker if threshold exceeded
      if (circuitBreaker.failures >= circuitBreaker.threshold) {
        circuitBreaker.state = 'open';
        logger.warn('Circuit breaker opened', {
          serviceId,
          failures: circuitBreaker.failures,
          threshold: circuitBreaker.threshold,
        });
      }

      monitoring.recordMetric({
        name: 'microservices.call.error',
        value: 1,
        tags: {
          serviceId,
          instanceId: instance.id,
          path,
          error: 'request_failed',
        },
      });

      throw error;
    }
  }

  /**
   * Start health checking
   */
  private startHealthChecking(): void {
    setInterval(async () => {
      for (const [serviceId, service] of this.services.entries()) {
        const instances = this.instances.get(serviceId) || [];

        for (const instance of instances) {
          try {
            const healthUrl = `${service.network.protocol}://${instance.host}:${instance.port}${service.endpoints.health}`;
            const response = await httpClient.get(healthUrl, { timeout: 5000 });

            if (response.data?.status === 'healthy') {
              instance.status = 'healthy';
              instance.lastHeartbeat = new Date();
            } else {
              instance.status = 'unhealthy';
            }

          } catch (error) {
            instance.status = 'unhealthy';
            logger.warn('Health check failed', {
              serviceId,
              instanceId: instance.id,
              error: String(error),
            });
          }

          monitoring.recordMetric({
            name: 'microservices.health_check',
            value: instance.status === 'healthy' ? 1 : 0,
            tags: {
              serviceId,
              instanceId: instance.id,
              status: instance.status,
            },
          });
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Start instance cleanup
   */
  private startInstanceCleanup(): void {
    setInterval(() => {
      for (const [serviceId, instances] of this.instances.entries()) {
        const now = Date.now();
        const activeInstances = instances.filter(instance => {
          const timeSinceHeartbeat = now - instance.lastHeartbeat.getTime();
          return timeSinceHeartbeat < this.instanceTimeout;
        });

        if (activeInstances.length !== instances.length) {
          this.instances.set(serviceId, activeInstances);
          logger.info('Cleaned up stale instances', {
            serviceId,
            removed: instances.length - activeInstances.length,
            remaining: activeInstances.length,
          });
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Setup default services
   */
  private setupDefaultServices(): void {
    // Main GraphQL API service
    this.registerService({
      name: 'pothos-graphql-api',
      version: '2.0.0',
      type: 'api',
      status: 'healthy',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        api: '/graphql',
        admin: '/admin',
      },
      network: {
        host: 'localhost',
        port: 4000,
        protocol: 'http',
      },
      metadata: {
        region: 'us-east-1',
        zone: 'us-east-1a',
        environment: 'development',
        tags: ['graphql', 'api', 'primary'],
        dependencies: ['postgres', 'redis', 'qdrant'],
        capabilities: ['graphql', 'subscriptions', 'federation'],
      },
      resources: {
        cpu: 1000, // millicores
        memory: 1024, // MB
        disk: 5120, // MB
        connections: 1000,
      },
      scaling: {
        minInstances: 1,
        maxInstances: 10,
        currentInstances: 1,
        autoScale: true,
      },
      deployment: {
        strategy: 'rolling',
        rollbackOnFailure: true,
        healthCheckGracePeriod: 30000,
      },
      security: {
        authRequired: true,
        roles: ['user', 'admin'],
        rateLimit: {
          requests: 1000,
          window: 60000,
        },
      },
    });

    // Worker service for background tasks
    this.registerService({
      name: 'background-worker',
      version: '1.0.0',
      type: 'worker',
      status: 'healthy',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        admin: '/admin',
      },
      network: {
        host: 'localhost',
        port: 4001,
        protocol: 'http',
      },
      metadata: {
        region: 'us-east-1',
        zone: 'us-east-1a',
        environment: 'development',
        tags: ['worker', 'background', 'jobs'],
        dependencies: ['postgres', 'redis'],
        capabilities: ['job-processing', 'email', 'notifications'],
      },
      resources: {
        cpu: 500,
        memory: 512,
        disk: 1024,
        connections: 100,
      },
      scaling: {
        minInstances: 1,
        maxInstances: 5,
        currentInstances: 1,
        autoScale: true,
      },
      deployment: {
        strategy: 'rolling',
        rollbackOnFailure: true,
        healthCheckGracePeriod: 15000,
      },
      security: {
        authRequired: false,
        roles: [],
        rateLimit: {
          requests: 100,
          window: 60000,
        },
      },
    });

    logger.info('Default services registered');
  }

  /**
   * Get service registry statistics
   */
  getRegistryStatistics(): {
    services: number;
    instances: number;
    healthyInstances: number;
    circuitBreakers: {
      open: number;
      closed: number;
      halfOpen: number;
    };
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const allInstances = Array.from(this.instances.values()).flat();
    const healthyInstances = allInstances.filter(i => i.status === 'healthy');

    const servicesByType = Array.from(this.services.values()).reduce((acc, service) => {
      acc[service.type] = (acc[service.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const servicesByStatus = Array.from(this.services.values()).reduce((acc, service) => {
      acc[service.status] = (acc[service.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const circuitBreakerStates = Array.from(this.circuit_breakers.values()).reduce((acc, cb) => {
      acc[cb.state] = (acc[cb.state] || 0) + 1;
      return acc;
    }, { open: 0, closed: 0, 'half-open': 0 } as { open: number; closed: number; 'half-open': number });

    return {
      services: this.services.size,
      instances: allInstances.length,
      healthyInstances: healthyInstances.length,
      circuitBreakers: {
        open: circuitBreakerStates.open,
        closed: circuitBreakerStates.closed,
        halfOpen: circuitBreakerStates['half-open'],
      },
      byType: servicesByType,
      byStatus: servicesByStatus,
    };
  }

  /**
   * Get service details
   */
  getService(serviceId: string): ServiceDefinition | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get service instances
   */
  getServiceInstances(serviceId: string): ServiceInstance[] {
    return this.instances.get(serviceId) || [];
  }

  /**
   * Update service status
   */
  updateServiceStatus(serviceId: string, status: ServiceDefinition['status']): void {
    const service = this.services.get(serviceId);
    if (service) {
      service.status = status;
      logger.info('Service status updated', { serviceId, status });

      monitoring.recordMetric({
        name: 'microservices.service.status_change',
        value: 1,
        tags: {
          serviceId,
          status,
          service: service.name,
        },
      });
    }
  }
}

// Export singleton instance
export const serviceRegistry = new ServiceRegistry();

// Types are already exported above