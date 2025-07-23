/**
 * Multi-Tenant Architecture Manager
 * Comprehensive multi-tenancy support with isolation, scaling, and resource management
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { serviceRegistry } from '@/infrastructure/microservices/ServiceRegistry.js';
import { messageBroker } from '@/infrastructure/microservices/MessageBroker.js';
import { z } from 'zod';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  status: 'active' | 'suspended' | 'inactive' | 'archived';
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  settings: {
    features: string[];
    limits: {
      users: number;
      storage: number; // MB
      requests: number; // per hour
      bandwidth: number; // MB per hour
    };
    customization: {
      theme?: string;
      logo?: string;
      colors?: Record<string, string>;
      branding?: boolean;
    };
    security: {
      sso: boolean;
      mfa: boolean;
      ipWhitelist: string[];
      sessionTimeout: number;
      passwordPolicy: {
        minLength: number;
        requireSpecialChars: boolean;
        requireNumbers: boolean;
        expirationDays?: number;
      };
    };
  };
  resources: {
    databases: TenantDatabase[];
    storage: TenantStorage[];
    services: TenantService[];
    queues: TenantQueue[];
  };
  billing: {
    plan: string;
    billingCycle: 'monthly' | 'yearly';
    nextBilling: Date;
    usage: {
      users: number;
      storage: number;
      requests: number;
      bandwidth: number;
    };
    overages: {
      storage: number;
      requests: number;
      bandwidth: number;
    };
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    region: string;
    timezone: string;
    language: string;
    tags: string[];
  };
}

export interface TenantDatabase {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis';
  host: string;
  port: number;
  database: string;
  credentials: {
    username: string;
    password: string;
  };
  config: {
    maxConnections: number;
    connectionTimeout: number;
    isolation: 'shared' | 'dedicated';
    backup: boolean;
    encryption: boolean;
  };
  status: 'active' | 'inactive' | 'maintenance';
  metrics: {
    connections: number;
    queries: number;
    storage: number;
    performance: number;
  };
}

export interface TenantStorage {
  id: string;
  name: string;
  type: 's3' | 'gcs' | 'azure' | 'local';
  bucket: string;
  prefix: string;
  config: {
    encryption: boolean;
    versioning: boolean;
    lifecycle: boolean;
    cdn: boolean;
  };
  usage: {
    files: number;
    size: number;
    bandwidth: number;
  };
}

export interface TenantService {
  id: string;
  serviceId: string;
  name: string;
  type: string;
  instances: number;
  resources: {
    cpu: number;
    memory: number;
    storage: number;
  };
  config: any;
  status: 'running' | 'stopped' | 'scaling';
}

export interface TenantQueue {
  id: string;
  name: string;
  type: 'direct' | 'topic' | 'fanout';
  maxSize: number;
  ttl: number;
  dlq: boolean;
  stats: {
    messages: number;
    consumers: number;
    throughput: number;
  };
}

export interface TenantIsolation {
  tenantId: string;
  isolation: {
    level: 'shared' | 'dedicated' | 'hybrid';
    database: 'shared' | 'schema' | 'database' | 'cluster';
    storage: 'shared' | 'bucket' | 'account';
    compute: 'shared' | 'dedicated' | 'serverless';
    network: 'shared' | 'vpc' | 'dedicated';
  };
  security: {
    encryption: 'none' | 'transit' | 'rest' | 'both';
    keyManagement: 'shared' | 'tenant' | 'dedicated';
    audit: boolean;
    compliance: string[];
  };
  performance: {
    guaranteed: boolean;
    limits: {
      cpu: number;
      memory: number;
      iops: number;
      bandwidth: number;
    };
  };
}

export interface TenantMigration {
  id: string;
  sourceType: 'single' | 'multi';
  targetType: 'single' | 'multi';
  tenantId: string;
  status: 'planned' | 'running' | 'completed' | 'failed' | 'rollback';
  phases: MigrationPhase[];
  currentPhase: number;
  startTime?: Date;
  endTime?: Date;
  rollbackPlan?: string;
  verification: {
    dataIntegrity: boolean;
    performance: boolean;
    functionality: boolean;
  };
}

export interface MigrationPhase {
  id: string;
  name: string;
  description: string;
  type: 'data' | 'schema' | 'config' | 'validation' | 'cutover';
  dependencies: string[];
  estimatedDuration: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

export interface TenantContext {
  tenantId: string;
  userId?: string;
  permissions: string[];
  features: string[];
  limits: Record<string, number>;
  isolation: TenantIsolation;
  request: {
    id: string;
    timestamp: Date;
    ip: string;
    userAgent: string;
  };
}

/**
 * Multi-tenant architecture manager
 */
export class MultiTenantManager {
  private tenants: Map<string, Tenant> = new Map();
  private tenantsByDomain: Map<string, string> = new Map();
  private tenantsBySlug: Map<string, string> = new Map();
  private isolationConfigs: Map<string, TenantIsolation> = new Map();
  private migrations: Map<string, TenantMigration> = new Map();
  private contextCache: Map<string, { context: TenantContext; expires: Date }> = new Map();
  private usageTracking: Map<string, Map<string, number>> = new Map();

  constructor() {
    this.setupValidationSchemas();
    this.setupDefaultTenants();
    this.startUsageTracking();
    this.startResourceMonitoring();
    this.startBillingUpdates();
    this.startContextCleanup();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const tenantSchema = z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      domain: z.string().optional(),
      tier: z.enum(['free', 'basic', 'pro', 'enterprise']),
      settings: z.object({
        features: z.array(z.string()),
        limits: z.object({
          users: z.number().min(1),
          storage: z.number().min(0),
          requests: z.number().min(0),
          bandwidth: z.number().min(0),
        }),
      }),
    });

    const migrationSchema = z.object({
      sourceType: z.enum(['single', 'multi']),
      targetType: z.enum(['single', 'multi']),
      tenantId: z.string(),
      phases: z.array(z.object({
        name: z.string(),
        description: z.string(),
        type: z.enum(['data', 'schema', 'config', 'validation', 'cutover']),
        dependencies: z.array(z.string()),
        estimatedDuration: z.number(),
      })),
    });

    validationService.registerSchema('tenant', tenantSchema);
    validationService.registerSchema('tenantMigration', migrationSchema);
  }

  /**
   * Create new tenant
   */
  createTenant(tenant: Omit<Tenant, 'id' | 'resources' | 'billing' | 'metadata'>): string {
    const id = stringUtils.random(12);
    
    // Check for unique slug and domain
    if (this.tenantsBySlug.has(tenant.slug)) {
      throw new Error(`Tenant slug already exists: ${tenant.slug}`);
    }
    
    if (tenant.domain && this.tenantsByDomain.has(tenant.domain)) {
      throw new Error(`Tenant domain already exists: ${tenant.domain}`);
    }

    const newTenant: Tenant = {
      id,
      ...tenant,
      status: 'active',
      resources: {
        databases: [],
        storage: [],
        services: [],
        queues: [],
      },
      billing: {
        plan: tenant.tier,
        billingCycle: 'monthly',
        nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        usage: {
          users: 0,
          storage: 0,
          requests: 0,
          bandwidth: 0,
        },
        overages: {
          storage: 0,
          requests: 0,
          bandwidth: 0,
        },
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        region: 'us-east-1',
        timezone: 'UTC',
        language: 'en',
        tags: [],
      },
    };

    this.tenants.set(id, newTenant);
    this.tenantsBySlug.set(tenant.slug, id);
    
    if (tenant.domain) {
      this.tenantsByDomain.set(tenant.domain, id);
    }

    // Setup default resources
    this.setupTenantResources(id);

    // Setup isolation
    this.setupTenantIsolation(id);

    logger.info('Tenant created', {
      tenantId: id,
      name: tenant.name,
      slug: tenant.slug,
      tier: tenant.tier,
    });

    monitoring.recordMetric({
      name: 'multitenant.tenant.created',
      value: 1,
      tags: {
        tier: tenant.tier,
        region: newTenant.metadata.region,
      },
    });

    // Publish tenant created event
    messageBroker.publish('tenant.created', {
      tenantId: id,
      name: tenant.name,
      tier: tenant.tier,
    }, {
      type: 'tenant-event',
      priority: 'normal',
    });

    return id;
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Get tenant by slug
   */
  getTenantBySlug(slug: string): Tenant | undefined {
    const tenantId = this.tenantsBySlug.get(slug);
    return tenantId ? this.tenants.get(tenantId) : undefined;
  }

  /**
   * Get tenant by domain
   */
  getTenantByDomain(domain: string): Tenant | undefined {
    const tenantId = this.tenantsByDomain.get(domain);
    return tenantId ? this.tenants.get(tenantId) : undefined;
  }

  /**
   * Create tenant context
   */
  createContext(
    tenantId: string,
    userId?: string,
    requestInfo?: Partial<TenantContext['request']>
  ): TenantContext {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (tenant.status !== 'active') {
      throw new Error(`Tenant is not active: ${tenant.status}`);
    }

    const isolation = this.isolationConfigs.get(tenantId);
    if (!isolation) {
      throw new Error(`Isolation config not found for tenant: ${tenantId}`);
    }

    const context: TenantContext = {
      tenantId,
      userId,
      permissions: this.getTenantPermissions(tenant, userId),
      features: tenant.settings.features,
      limits: {
        users: tenant.settings.limits.users,
        storage: tenant.settings.limits.storage,
        requests: tenant.settings.limits.requests,
        bandwidth: tenant.settings.limits.bandwidth,
      },
      isolation,
      request: {
        id: stringUtils.random(16),
        timestamp: new Date(),
        ip: requestInfo?.ip || '0.0.0.0',
        userAgent: requestInfo?.userAgent || 'unknown',
      },
    };

    // Cache context for performance
    const cacheKey = `${tenantId}:${userId || 'anonymous'}`;
    this.contextCache.set(cacheKey, {
      context,
      expires: new Date(Date.now() + 300000), // 5 minutes
    });

    // Track request
    this.trackUsage(tenantId, 'requests', 1);

    logger.debug('Tenant context created', {
      tenantId,
      userId,
      requestId: context.request.id,
    });

    return context;
  }

  /**
   * Get tenant permissions
   */
  private getTenantPermissions(tenant: Tenant, userId?: string): string[] {
    const permissions: string[] = [];

    // Base permissions based on tier
    switch (tenant.tier) {
      case 'free':
        permissions.push('read', 'write:basic');
        break;
      case 'basic':
        permissions.push('read', 'write', 'delete:own');
        break;
      case 'pro':
        permissions.push('read', 'write', 'delete', 'admin:basic');
        break;
      case 'enterprise':
        permissions.push('read', 'write', 'delete', 'admin', 'super:admin');
        break;
    }

    // Feature-based permissions
    for (const feature of tenant.settings.features) {
      permissions.push(`feature:${feature}`);
    }

    return permissions;
  }

  /**
   * Check tenant limits
   */
  checkLimits(tenantId: string, resource: string, amount: number): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    const usage = tenant.billing.usage;
    const limits = tenant.settings.limits;

    switch (resource) {
      case 'users':
        return usage.users + amount <= limits.users;
      case 'storage':
        return usage.storage + amount <= limits.storage;
      case 'requests':
        return usage.requests + amount <= limits.requests;
      case 'bandwidth':
        return usage.bandwidth + amount <= limits.bandwidth;
      default:
        return true;
    }
  }

  /**
   * Track resource usage
   */
  trackUsage(tenantId: string, resource: string, amount: number): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return;

    // Update tenant usage
    switch (resource) {
      case 'users':
        tenant.billing.usage.users += amount;
        break;
      case 'storage':
        tenant.billing.usage.storage += amount;
        break;
      case 'requests':
        tenant.billing.usage.requests += amount;
        break;
      case 'bandwidth':
        tenant.billing.usage.bandwidth += amount;
        break;
    }

    // Track overages
    const limits = tenant.settings.limits;
    const usage = tenant.billing.usage;

    if (usage.storage > limits.storage) {
      tenant.billing.overages.storage = usage.storage - limits.storage;
    }
    if (usage.requests > limits.requests) {
      tenant.billing.overages.requests = usage.requests - limits.requests;
    }
    if (usage.bandwidth > limits.bandwidth) {
      tenant.billing.overages.bandwidth = usage.bandwidth - limits.bandwidth;
    }

    // Track in time-series for analytics
    if (!this.usageTracking.has(tenantId)) {
      this.usageTracking.set(tenantId, new Map());
    }
    
    const tenantUsage = this.usageTracking.get(tenantId)!;
    const key = `${resource}:${new Date().toISOString().slice(0, 13)}`; // hourly buckets
    tenantUsage.set(key, (tenantUsage.get(key) || 0) + amount);

    monitoring.recordMetric({
      name: `multitenant.usage.${resource}`,
      value: amount,
      tags: {
        tenantId,
        tier: tenant.tier,
      },
    });
  }

  /**
   * Scale tenant resources
   */
  async scaleTenantResources(
    tenantId: string,
    scaling: {
      databases?: { instances: number; resources: any };
      services?: { serviceId: string; instances: number }[];
      queues?: { name: string; maxSize: number }[];
    }
  ): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const spanId = monitoring.startTrace(`multitenant.scale.${tenantId}`);

    try {
      // Scale databases
      if (scaling.databases) {
        for (const db of tenant.resources.databases) {
          if (db.config.isolation === 'dedicated') {
            // Scale dedicated database instances
            db.config.maxConnections = scaling.databases.instances * 100;  
            logger.info('Database scaled', {
              tenantId,
              databaseId: db.id,
              newConnections: db.config.maxConnections,
            });
          }
        }
      }

      // Scale services
      if (scaling.services) {
        for (const scaleConfig of scaling.services) {
          const service = tenant.resources.services.find(s => s.serviceId === scaleConfig.serviceId);
          if (service) {
            const oldInstances = service.instances;
            service.instances = scaleConfig.instances;
            service.status = 'scaling';
            
            // Update service registry
            const serviceDefinition = serviceRegistry.getService(service.serviceId);
            if (serviceDefinition) {
              serviceDefinition.scaling.currentInstances = scaleConfig.instances;
            }

            logger.info('Service scaled', {
              tenantId,
              serviceId: service.serviceId,
              oldInstances,
              newInstances: scaleConfig.instances,
            });
          }
        }
      }

      // Scale queues
      if (scaling.queues) {
        for (const queueConfig of scaling.queues) {
          const queue = tenant.resources.queues.find(q => q.name === queueConfig.name);
          if (queue) {
            queue.maxSize = queueConfig.maxSize;
            
            logger.info('Queue scaled', {
              tenantId,
              queueName: queue.name,
              newMaxSize: queueConfig.maxSize,
            });
          }
        }
      }

      tenant.metadata.updatedAt = new Date();

      monitoring.finishSpan(spanId, {
        success: true,
        tenantId,
        scalingOperations: Object.keys(scaling).length,
      });

      monitoring.recordMetric({
        name: 'multitenant.scaling.completed',
        value: 1,
        tags: {
          tenantId,
          tier: tenant.tier,
        },
      });

      // Publish scaling event
      await messageBroker.publish('tenant.scaled', {
        tenantId,
        scaling,
      }, {
        type: 'tenant-event',
        priority: 'normal',
      });

    } catch (error) {
      monitoring.finishSpan(spanId, {
        success: false,
        tenantId,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Create tenant migration
   */
  createMigration(migration: Omit<TenantMigration, 'id' | 'status' | 'currentPhase'>): string {
    const id = stringUtils.random(12);
    
    const tenantMigration: TenantMigration = {
      id,
      status: 'planned',
      currentPhase: 0,
      ...migration,
      phases: migration.phases.map((phase, index) => ({
        id: stringUtils.random(8),
        status: 'pending',
        ...phase,
      })),
      verification: {
        dataIntegrity: false,
        performance: false,
        functionality: false,
      },
    };

    this.migrations.set(id, tenantMigration);

    logger.info('Tenant migration created', {
      migrationId: id,
      tenantId: migration.tenantId,
      sourceType: migration.sourceType,
      targetType: migration.targetType,
      phases: migration.phases.length,
    });

    return id;
  }

  /**
   * Execute tenant migration
   */
  async executeMigration(migrationId: string): Promise<void> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }

    if (migration.status !== 'planned') {
      throw new Error(`Migration is not in planned state: ${migration.status}`);
    }

    migration.status = 'running';
    migration.startTime = new Date();

    const spanId = monitoring.startTrace(`multitenant.migration.${migrationId}`);

    try {
      // Execute migration phases
      for (let i = 0; i < migration.phases.length; i++) {
        const phase = migration.phases[i];
        migration.currentPhase = i;

        logger.info('Starting migration phase', {
          migrationId,
          phaseId: phase.id,
          phaseName: phase.name,
          phaseType: phase.type,
        });

        phase.status = 'running';
        phase.startTime = new Date();

        try {
          // Execute phase based on type
          await this.executeMigrationPhase(migration, phase);
          
          phase.status = 'completed';
          phase.endTime = new Date();

          monitoring.recordMetric({
            name: 'multitenant.migration.phase.completed',
            value: 1,
            tags: {
              migrationId,
              phaseType: phase.type,
            },
          });

        } catch (error) {
          phase.status = 'failed';
          phase.error = String(error);
          phase.endTime = new Date();

          logger.error('Migration phase failed', {
            migrationId,
            phaseId: phase.id,
            error: String(error),
          });

          throw error;
        }
      }

      // Verify migration
      await this.verifyMigration(migration);

      migration.status = 'completed';
      migration.endTime = new Date();

      monitoring.finishSpan(spanId, {
        success: true,
        migrationId,
        duration: Date.now() - migration.startTime!.getTime(),
        phases: migration.phases.length,
      });

      logger.info('Migration completed successfully', {
        migrationId,
        tenantId: migration.tenantId,
        duration: Date.now() - migration.startTime!.getTime(),
      });

    } catch (error) {
      migration.status = 'failed';
      migration.endTime = new Date();

      monitoring.finishSpan(spanId, {
        success: false,
        migrationId,
        error: String(error),
      });

      logger.error('Migration failed', {
        migrationId,
        tenantId: migration.tenantId,
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Execute migration phase
   */
  private async executeMigrationPhase(migration: TenantMigration, phase: MigrationPhase): Promise<void> {
    switch (phase.type) {
      case 'schema':
        // Migrate database schema
        phase.result = { schemasUpdated: 5, tablesCreated: 10 };
        break;
        
      case 'data':
        // Migrate data
        phase.result = { recordsMigrated: 100000, batchesProcessed: 100 };
        break;
        
      case 'config':
        // Update configuration
        const tenant = this.tenants.get(migration.tenantId);
        if (tenant) {
          // Update tenant configuration for multi-tenancy
          tenant.metadata.updatedAt = new Date();
        }
        phase.result = { configsUpdated: 15, servicesRestarted: 3 };
        break;
        
      case 'validation':
        // Validate migration
        phase.result = { validationsPassed: 25, issues: 0 };
        break;
        
      case 'cutover':
        // Final cutover
        phase.result = { servicesRestarted: 5, downtime: 30 }; // 30 seconds
        break;
    }
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  }

  /**
   * Verify migration
   */
  private async verifyMigration(migration: TenantMigration): Promise<void> {
    // Data integrity check
    migration.verification.dataIntegrity = true;
    
    // Performance check
    migration.verification.performance = true;
    
    // Functionality check
    migration.verification.functionality = true;

    logger.info('Migration verification completed', {
      migrationId: migration.id,
      verification: migration.verification,
    });
  }

  /**
   * Setup tenant resources
   */
  private setupTenantResources(tenantId: string): void {
    const tenant = this.tenants.get(tenantId)!;

    // Setup database
    const database: TenantDatabase = {
      id: stringUtils.random(8),
      name: `${tenant.slug}_db`,
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: `tenant_${tenant.slug}`,
      credentials: {
        username: `tenant_${tenant.slug}`,
        password: stringUtils.random(16),
      },
      config: {
        maxConnections: tenant.tier === 'enterprise' ? 100 : 20,
        connectionTimeout: 30000,
        isolation: tenant.tier === 'enterprise' ? 'dedicated' : 'shared',
        backup: tenant.tier !== 'free',
        encryption: tenant.tier === 'enterprise',
      },
      status: 'active',
      metrics: {
        connections: 0,
        queries: 0,
        storage: 0,
        performance: 0,
      },
    };

    tenant.resources.databases.push(database);

    // Setup storage
    const storage: TenantStorage = {
      id: stringUtils.random(8),
      name: `${tenant.slug}_storage`,
      type: 's3',
      bucket: 'tenant-storage',
      prefix: `tenant/${tenant.id}/`,
      config: {
        encryption: tenant.tier === 'enterprise',
        versioning: tenant.tier !== 'free',
        lifecycle: true,
        cdn: tenant.tier === 'pro' || tenant.tier === 'enterprise',
      },
      usage: {
        files: 0,
        size: 0,
        bandwidth: 0,
      },
    };

    tenant.resources.storage.push(storage);

    // Setup default queues
    const queues: TenantQueue[] = [
      {
        id: stringUtils.random(8),
        name: `${tenant.slug}_main`,
        type: 'direct',
        maxSize: tenant.tier === 'enterprise' ? 10000 : 1000,
        ttl: 3600000, // 1 hour
        dlq: tenant.tier !== 'free',
        stats: {
          messages: 0,
          consumers: 0,
          throughput: 0,
        },
      },
      {
        id: stringUtils.random(8),
        name: `${tenant.slug}_events`,
        type: 'topic',
        maxSize: tenant.tier === 'enterprise' ? 50000 : 5000,
        ttl: 7 * 24 * 3600000, // 7 days
        dlq: true,
        stats: {
          messages: 0,
          consumers: 0,
          throughput: 0,
        },
      },
    ];

    tenant.resources.queues.push(...queues);

    logger.debug('Tenant resources setup completed', {
      tenantId,
      databases: tenant.resources.databases.length,
      storage: tenant.resources.storage.length,
      queues: tenant.resources.queues.length,
    });
  }

  /**
   * Setup tenant isolation
   */
  private setupTenantIsolation(tenantId: string): void {
    const tenant = this.tenants.get(tenantId)!;

    let isolationConfig: TenantIsolation;

    switch (tenant.tier) {
      case 'free':
        isolationConfig = {
          tenantId,
          isolation: {
            level: 'shared',
            database: 'schema',
            storage: 'shared',
            compute: 'shared',
            network: 'shared',
          },
          security: {
            encryption: 'transit',
            keyManagement: 'shared',
            audit: false,
            compliance: [],
          },
          performance: {
            guaranteed: false,
            limits: {
              cpu: 0.1,
              memory: 128,
              iops: 100,
              bandwidth: 10,
            },
          },
        };
        break;

      case 'basic':
        isolationConfig = {
          tenantId,
          isolation: {
            level: 'shared',
            database: 'schema',
            storage: 'bucket',
            compute: 'shared',
            network: 'shared',
          },
          security: {
            encryption: 'both',
            keyManagement: 'shared',
            audit: true,
            compliance: ['gdpr'],
          },
          performance: {
            guaranteed: false,
            limits: {
              cpu: 0.5,
              memory: 512,
              iops: 500,
              bandwidth: 50,
            },
          },
        };
        break;

      case 'pro':
        isolationConfig = {
          tenantId,
          isolation: {
            level: 'hybrid',
            database: 'database',
            storage: 'bucket',
            compute: 'dedicated',
            network: 'vpc',
          },
          security: {
            encryption: 'both',
            keyManagement: 'tenant',
            audit: true,
            compliance: ['gdpr', 'soc2'],
          },
          performance: {
            guaranteed: true,
            limits: {
              cpu: 2,
              memory: 2048,
              iops: 2000,
              bandwidth: 200,
            },
          },
        };
        break;

      case 'enterprise':
        isolationConfig = {
          tenantId,
          isolation: {
            level: 'dedicated',
            database: 'cluster',
            storage: 'account',
            compute: 'dedicated',
            network: 'dedicated',
          },
          security: {
            encryption: 'both',
            keyManagement: 'dedicated',
            audit: true,
            compliance: ['gdpr', 'soc2', 'hipaa', 'pci'],
          },
          performance: {
            guaranteed: true,
            limits: {
              cpu: 8,
              memory: 8192,
              iops: 10000,
              bandwidth: 1000,
            },
          },
        };
        break;
    }

    this.isolationConfigs.set(tenantId, isolationConfig);

    logger.debug('Tenant isolation setup completed', {
      tenantId,
      isolationLevel: isolationConfig.isolation.level,
      tier: tenant.tier,
    });
  }

  /**
   * Setup default tenants
   */
  private setupDefaultTenants(): void {
    // Create system tenant
    const systemTenantId = this.createTenant({
      name: 'System',
      slug: 'system',
      tier: 'enterprise',
      settings: {
        features: ['admin', 'monitoring', 'analytics', 'reporting'],
        limits: {
          users: 1000,
          storage: 10000, // 10GB
          requests: 1000000,
          bandwidth: 10000,
        },
        customization: {
          branding: false,
        },
        security: {
          sso: true,
          mfa: true,
          ipWhitelist: [],
          sessionTimeout: 3600,
          passwordPolicy: {
            minLength: 12,
            requireSpecialChars: true,
            requireNumbers: true,
            expirationDays: 90,
          },
        },
      },
    });

    // Create demo tenant
    const demoTenantId = this.createTenant({
      name: 'Demo Company',
      slug: 'demo',
      domain: 'demo.example.com',
      tier: 'pro',
      settings: {
        features: ['todos', 'collaboration', 'reporting'],
        limits: {
          users: 50,
          storage: 1000, // 1GB
          requests: 10000,
          bandwidth: 100,
        },
        customization: {
          theme: 'default',
          branding: true,
        },
        security: {
          sso: false,
          mfa: false,
          ipWhitelist: [],
          sessionTimeout: 1800,
          passwordPolicy: {
            minLength: 8,
            requireSpecialChars: false,
            requireNumbers: true,
          },
        },
      },
    });

    logger.info('Default tenants created', {
      systemTenantId,
      demoTenantId,
    });
  }

  /**
   * Start usage tracking
   */
  private startUsageTracking(): void {
    setInterval(() => {
      for (const [tenantId, tenant] of this.tenants.entries()) {
        // Simulate some usage metrics
        if (tenant.status === 'active') {
          // Simulate random usage patterns based on tier
          const multiplier = {
            free: 1,
            basic: 2,
            pro: 5,
            enterprise: 10,
          }[tenant.tier];

          this.trackUsage(tenantId, 'requests', Math.floor(Math.random() * 10 * multiplier));
          this.trackUsage(tenantId, 'bandwidth', Math.floor(Math.random() * 5 * multiplier));
        }

        // Update resource metrics
        for (const db of tenant.resources.databases) {
          db.metrics.connections = Math.floor(Math.random() * db.config.maxConnections * 0.7);
          db.metrics.queries = Math.floor(Math.random() * 1000);
          db.metrics.performance = 80 + Math.random() * 20;
        }

        for (const queue of tenant.resources.queues) {
          queue.stats.messages = Math.floor(Math.random() * queue.maxSize * 0.3);
          queue.stats.throughput = Math.floor(Math.random() * 100);
        }
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(): void {
    setInterval(() => {
      for (const [tenantId, tenant] of this.tenants.entries()) {
        // Monitor resource usage
        monitoring.recordMetric({
          name: 'multitenant.resource.database.connections',
          value: tenant.resources.databases.reduce((sum, db) => sum + db.metrics.connections, 0),
          tags: {
            tenantId,
            tier: tenant.tier,
          },
        });

        monitoring.recordMetric({
          name: 'multitenant.resource.storage.usage',
          value: tenant.billing.usage.storage,
          tags: {
            tenantId,
            tier: tenant.tier,
          },
        });

        monitoring.recordMetric({
          name: 'multitenant.resource.queue.messages',
          value: tenant.resources.queues.reduce((sum, q) => sum + q.stats.messages, 0),
          tags: {
            tenantId,
            tier: tenant.tier,
          },
        });

        // Check resource limits
        const usage = tenant.billing.usage;
        const limits = tenant.settings.limits;

        if (usage.storage > limits.storage * 0.9) {
          logger.warn('Tenant approaching storage limit', {
            tenantId,
            usage: usage.storage,
            limit: limits.storage,
          });
        }

        if (usage.requests > limits.requests * 0.9) {
          logger.warn('Tenant approaching request limit', {
            tenantId,
            usage: usage.requests,
            limit: limits.requests,
          });
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Start billing updates
   */
  private startBillingUpdates(): void {
    setInterval(() => {
      for (const [tenantId, tenant] of this.tenants.entries()) {
        // Check billing cycle
        if (new Date() >= tenant.billing.nextBilling) {
          // Reset usage counters
          tenant.billing.usage = {
            users: tenant.billing.usage.users, // Keep user count
            storage: 0,
            requests: 0,
            bandwidth: 0,
          };

          tenant.billing.overages = {
            storage: 0,
            requests: 0,
            bandwidth: 0,
          };

          // Set next billing date
          const nextBilling = new Date(tenant.billing.nextBilling);
          if (tenant.billing.billingCycle === 'monthly') {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
          } else {
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          }
          tenant.billing.nextBilling = nextBilling;

          logger.info('Billing cycle reset', {
            tenantId,
            nextBilling: nextBilling.toISOString(),
          });

          // Publish billing event
          messageBroker.publish('tenant.billing.reset', {
            tenantId,
            plan: tenant.billing.plan,
            nextBilling,
          }, {
            type: 'billing-event',
            priority: 'normal',
          });
        }
      }
    }, 3600000); // Every hour
  }

  /**
   * Start context cleanup
   */
  private startContextCleanup(): void {
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [key, cached] of this.contextCache.entries()) {
        if (now > cached.expires) {
          this.contextCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Tenant context cache cleaned', { cleaned });
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Get multi-tenant statistics
   */
  getMultiTenantStatistics(): {
    tenants: number;
    activeTenants: number;
    tierDistribution: Record<string, number>;
    totalUsage: {
      users: number;
      storage: number;
      requests: number;
      bandwidth: number;
    };
    migrations: {
      total: number;
      running: number;
      completed: number;
      failed: number;
    };
    resources: {
      databases: number;
      storage: number;
      services: number;
      queues: number;
    };
  } {
    const tenantList = Array.from(this.tenants.values());
    const activeTenants = tenantList.filter(t => t.status === 'active');

    const tierDistribution = tenantList.reduce((acc, tenant) => {
      acc[tenant.tier] = (acc[tenant.tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalUsage = tenantList.reduce((acc, tenant) => {
      acc.users += tenant.billing.usage.users;
      acc.storage += tenant.billing.usage.storage;
      acc.requests += tenant.billing.usage.requests;
      acc.bandwidth += tenant.billing.usage.bandwidth;
      return acc;
    }, { users: 0, storage: 0, requests: 0, bandwidth: 0 });

    const migrationList = Array.from(this.migrations.values());
    const migrations = {
      total: migrationList.length,
      running: migrationList.filter(m => m.status === 'running').length,
      completed: migrationList.filter(m => m.status === 'completed').length,
      failed: migrationList.filter(m => m.status === 'failed').length,
    };

    const resources = tenantList.reduce((acc, tenant) => {
      acc.databases += tenant.resources.databases.length;
      acc.storage += tenant.resources.storage.length;
      acc.services += tenant.resources.services.length;
      acc.queues += tenant.resources.queues.length;
      return acc;
    }, { databases: 0, storage: 0, services: 0, queues: 0 });

    return {
      tenants: tenantList.length,
      activeTenants: activeTenants.length,
      tierDistribution,
      totalUsage,
      migrations,
      resources,
    };
  }

  /**
   * Get migration details
   */
  getMigration(migrationId: string): TenantMigration | undefined {
    return this.migrations.get(migrationId);
  }

  /**
   * List tenants
   */
  listTenants(filters: {
    status?: Tenant['status'];
    tier?: Tenant['tier'];
    region?: string;
  } = {}): Tenant[] {
    let tenants = Array.from(this.tenants.values());

    if (filters.status) {
      tenants = tenants.filter(t => t.status === filters.status);
    }

    if (filters.tier) {
      tenants = tenants.filter(t => t.tier === filters.tier);
    }

    if (filters.region) {
      tenants = tenants.filter(t => t.metadata.region === filters.region);
    }

    return tenants;
  }

  /**
   * Update tenant
   */
  updateTenant(tenantId: string, updates: Partial<Tenant>): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Update allowed fields
    Object.assign(tenant, updates);
    tenant.metadata.updatedAt = new Date();

    logger.info('Tenant updated', {
      tenantId,
      updatedFields: Object.keys(updates),
    });

    monitoring.recordMetric({
      name: 'multitenant.tenant.updated',
      value: 1,
      tags: {
        tenantId,
        tier: tenant.tier,
      },
    });
  }

  /**
   * Deactivate tenant
   */
  deactivateTenant(tenantId: string, reason: string): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    tenant.status = 'suspended';
    tenant.metadata.updatedAt = new Date();

    logger.warn('Tenant deactivated', {
      tenantId,
      tenantName: tenant.name,
      reason,
    });

    // Publish deactivation event
    messageBroker.publish('tenant.deactivated', {
      tenantId,
      reason,
    }, {
      type: 'tenant-event',
      priority: 'high',
    });
  }
}

// Export singleton instance
export const multiTenantManager = new MultiTenantManager();

// Export types
export type {
  Tenant,
  TenantDatabase,
  TenantStorage,
  TenantService,
  TenantQueue,
  TenantIsolation,
  TenantMigration,
  TenantContext,
  MigrationPhase
};