/**
 * API Version Management System
 * Centralized management of API versions, deprecations, and client migrations
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';
import {
  recordVersionUsage,
  recordDeprecationWarning,
  versionUsageTotal,
  deprecationWarningsTotal,
} from '../monitoring/metrics.js';
import type {
  ApiVersion,
  VersionInfo,
  DeprecationInfo,
  DeprecatedField,
  ClientVersionInfo,
  DeprecationWarning,
  MigrationRecommendation,
  VersionContext,
  VersioningConfig,
  DeprecationTracker,
  MigrationHelper,
  MigrationPlan,
  VersionUsageStats,
  DeprecationReport,
  UnsupportedVersionError,
  DeprecationError,
} from './types.js';

// ================================
// Version Registry
// ================================

export class VersionRegistry {
  private versions = new Map<ApiVersion, VersionInfo>();
  private deprecatedFields = new Map<string, DeprecatedField>();
  private clientUsage = new Map<string, ClientVersionInfo>();

  constructor() {
    this.initializeVersions();
  }

  private initializeVersions(): void {
    // Register supported API versions
    this.registerVersion('v1', {
      version: 'v1',
      releaseDate: '2024-01-01',
      deprecationDate: '2024-07-01',
      sunsetDate: '2025-01-01',
      status: 'deprecated',
      description: 'Initial API version with basic todo functionality',
      breakingChanges: [],
      migrationGuide: '/docs/migration/v1-to-v2',
    });

    this.registerVersion('v2', {
      version: 'v2',
      releaseDate: '2024-06-01',
      status: 'stable',
      description: 'Enhanced API with improved todo management and user features',
      breakingChanges: [
        'Todo.completed field replaced with Todo.status enum',
        'User.name field split into User.firstName and User.lastName',
        'CreateTodoInput requires priority field',
      ],
      migrationGuide: '/docs/migration/v2',
    });

    this.registerVersion('v3', {
      version: 'v3',
      releaseDate: '2024-12-01',
      status: 'stable',
      description: 'Latest API with real-time subscriptions and advanced features',
      breakingChanges: [],
      migrationGuide: '/docs/migration/v3',
    });

    logger.info('API versions initialized', {
      versions: Array.from(this.versions.keys()),
      deprecated: this.getDeprecatedVersions(),
    });
  }

  registerVersion(version: ApiVersion, info: VersionInfo): void {
    this.versions.set(version, info);
  }

  getVersion(version: ApiVersion): VersionInfo | undefined {
    return this.versions.get(version);
  }

  getSupportedVersions(): ApiVersion[] {
    return Array.from(this.versions.keys());
  }

  getDeprecatedVersions(): ApiVersion[] {
    return Array.from(this.versions.entries())
      .filter(([_, info]) => info.status === 'deprecated')
      .map(([version]) => version);
  }

  isVersionSupported(version: ApiVersion): boolean {
    const versionInfo = this.versions.get(version);
    return versionInfo ? versionInfo.status !== 'sunset' : false;
  }

  getLatestVersion(): ApiVersion {
    const versions = Array.from(this.versions.entries())
      .filter(([_, info]) => info.status === 'stable')
      .sort(([_, a], [__, b]) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
    
    return versions[0]?.[0] || 'v3';
  }
}

// ================================
// Deprecation Manager
// ================================

export class DeprecationManager extends EventEmitter {
  private deprecatedFields = new Map<string, DeprecatedField>();
  private clientWarnings = new Map<string, DeprecationWarning[]>();
  private usageStats = new Map<string, { count: number; clients: Set<string>; lastUsed: Date }>();

  constructor(private config: VersioningConfig) {
    super();
    this.initializeDeprecations();
  }

  private initializeDeprecations(): void {
    // Register known deprecated fields
    this.registerDeprecatedField({
      typeName: 'Todo',
      fieldName: 'completed',
      deprecation: {
        reason: 'Replaced with status enum for better todo state management',
        deprecatedAt: '2024-06-01',
        removedAt: '2025-01-01',
        replacement: {
          field: 'status',
        },
        migrationSteps: [
          'Update queries to use `status` field instead of `completed`',
          'Map true/false values to TODO/COMPLETED enum values',
          'Update client-side state management',
        ],
        severity: 'high',
      },
    });

    this.registerDeprecatedField({
      typeName: 'User',
      fieldName: 'name',
      deprecation: {
        reason: 'Split into firstName and lastName for better user management',
        deprecatedAt: '2024-06-01',
        removedAt: '2025-01-01',
        replacement: {
          field: 'firstName, lastName',
        },
        migrationSteps: [
          'Replace `name` field with `firstName` and `lastName`',
          'Update user creation/update mutations',
          'Implement name concatenation in client if needed',
        ],
        severity: 'medium',
      },
    });

    this.registerDeprecatedField({
      typeName: 'Query',
      fieldName: 'allTodos',
      deprecation: {
        reason: 'Replaced with paginated todos query for better performance',
        deprecatedAt: '2024-06-01',
        removedAt: '2025-01-01',
        replacement: {
          query: 'todos(first: Int, after: String)',
        },
        migrationSteps: [
          'Replace `allTodos` with `todos` query',
          'Implement pagination in client',
          'Add cursor-based navigation',
        ],
        severity: 'high',
      },
    });

    logger.info('Deprecation registry initialized', {
      deprecatedFields: this.deprecatedFields.size,
    });
  }

  registerDeprecatedField(field: DeprecatedField): void {
    const key = `${field.typeName}.${field.fieldName}`;
    this.deprecatedFields.set(key, field);

    this.emit('deprecation_registered', {
      field: key,
      severity: field.deprecation.severity,
      removedAt: field.deprecation.removedAt,
    });
  }

  getDeprecatedField(typeName: string, fieldName: string): DeprecatedField | undefined {
    return this.deprecatedFields.get(`${typeName}.${fieldName}`);
  }

  isFieldDeprecated(typeName: string, fieldName: string): boolean {
    return this.deprecatedFields.has(`${typeName}.${fieldName}`);
  }

  trackFieldUsage(
    typeName: string,
    fieldName: string,
    clientId?: string,
    version?: ApiVersion
  ): DeprecationWarning | null {
    const field = this.getDeprecatedField(typeName, fieldName);
    if (!field) return null;

    const key = `${typeName}.${fieldName}`;
    const stats = this.usageStats.get(key) || { count: 0, clients: new Set(), lastUsed: new Date() };
    
    stats.count++;
    stats.lastUsed = new Date();
    if (clientId) stats.clients.add(clientId);
    
    this.usageStats.set(key, stats);

    // Create deprecation warning
    const warning: DeprecationWarning = {
      type: 'field',
      path: key,
      message: `Field ${key} is deprecated: ${field.deprecation.reason}`,
      severity: field.deprecation.severity,
      deprecatedAt: field.deprecation.deprecatedAt,
      removedAt: field.deprecation.removedAt,
      replacement: field.deprecation.replacement?.field,
      count: stats.count,
    };

    // Track warning for client
    if (clientId) {
      const clientWarnings = this.clientWarnings.get(clientId) || [];
      const existingWarning = clientWarnings.find(w => w.path === key);
      
      if (existingWarning) {
        existingWarning.count++;
      } else {
        clientWarnings.push({ ...warning, count: 1 });
        this.clientWarnings.set(clientId, clientWarnings);
      }
    }

    // Record metrics
    recordDeprecationWarning(typeName, fieldName, field.deprecation.severity);
    deprecationWarningsTotal.inc({
      field: key,
      severity: field.deprecation.severity,
    });

    this.emit('deprecation_used', {
      field: key,
      clientId,
      version,
      warning,
    });

    return warning;
  }

  getClientWarnings(clientId: string): DeprecationWarning[] {
    return this.clientWarnings.get(clientId) || [];
  }

  getDeprecationStats(fieldPath: string): { count: number; clients: string[]; lastUsed: Date } | null {
    const stats = this.usageStats.get(fieldPath);
    if (!stats) return null;

    return {
      count: stats.count,
      clients: Array.from(stats.clients),
      lastUsed: stats.lastUsed,
    };
  }

  generateDeprecationReport(): DeprecationReport {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const deprecatedItems = Array.from(this.deprecatedFields.entries()).map(([path, field]) => {
      const stats = this.usageStats.get(path);
      return {
        path,
        type: 'field',
        severity: field.deprecation.severity,
        usageCount: stats?.count || 0,
        affectedClients: stats ? Array.from(stats.clients) : [],
        sunsetDate: field.deprecation.removedAt,
      };
    });

    const totalWarnings = Array.from(this.usageStats.values())
      .reduce((sum, stats) => sum + stats.count, 0);

    const clientsAffected = new Set(
      Array.from(this.usageStats.values())
        .flatMap(stats => Array.from(stats.clients))
    ).size;

    return {
      generatedAt: now.toISOString(),
      period: {
        start: thirtyDaysAgo.toISOString(),
        end: now.toISOString(),
      },
      summary: {
        totalDeprecatedFields: this.deprecatedFields.size,
        totalWarningsIssued: totalWarnings,
        clientsAffected,
        criticalDeprecations: deprecatedItems.filter(item => item.severity === 'critical').length,
      },
      deprecatedItems: deprecatedItems.sort((a, b) => b.usageCount - a.usageCount),
      recommendations: this.generateMigrationRecommendations(),
    };
  }

  private generateMigrationRecommendations(): MigrationRecommendation[] {
    const recommendations: MigrationRecommendation[] = [];

    // Analyze usage patterns and generate recommendations
    for (const [path, field] of this.deprecatedFields) {
      const stats = this.usageStats.get(path);
      if (!stats || stats.count === 0) continue;

      if (field.deprecation.severity === 'high' || field.deprecation.severity === 'critical') {
        recommendations.push({
          type: 'field_migration',
          priority: field.deprecation.severity === 'critical' ? 'urgent' : 'high',
          title: `Migrate from deprecated ${path}`,
          description: field.deprecation.reason,
          steps: field.deprecation.migrationSteps || [],
          estimatedEffort: stats.count > 100 ? 'high' : 'medium',
          deadline: field.deprecation.removedAt,
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

// ================================
// Version Manager
// ================================

export class VersionManager {
  constructor(
    private registry: VersionRegistry,
    private deprecationManager: DeprecationManager,
    private config: VersioningConfig
  ) {}

  resolveVersion(requestHeaders: Record<string, string | string[]>): VersionContext {
    // Extract version from headers
    const versionHeader = requestHeaders['api-version'] || requestHeaders['x-api-version'];
    const userAgent = requestHeaders['user-agent'];
    const clientId = requestHeaders['x-client-id'] || requestHeaders['client-id'];

    let requestedVersion: ApiVersion = this.config.defaultVersion;
    
    if (typeof versionHeader === 'string' && this.registry.isVersionSupported(versionHeader as ApiVersion)) {
      requestedVersion = versionHeader as ApiVersion;
    }

    const context: VersionContext = {
      requestedVersion,
      clientId: typeof clientId === 'string' ? clientId : undefined,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      acceptsDeprecation: true,
      migrationMode: false,
    };

    // Record version usage
    recordVersionUsage(requestedVersion);
    versionUsageTotal.inc({ version: requestedVersion });

    return context;
  }

  createDeprecationTracker(context: VersionContext): DeprecationTracker {
    return {
      trackUsage: (path: string, severity: DeprecationWarning['severity']) => {
        const [typeName, fieldName] = path.split('.');
        if (typeName && fieldName) {
          const warning = this.deprecationManager.trackFieldUsage(
            typeName,
            fieldName,
            context.clientId,
            context.requestedVersion
          );
          
          if (warning && context.clientId) {
            logger.warn('Deprecated field usage', {
              clientId: context.clientId,
              version: context.requestedVersion,
              path,
              severity,
              replacement: warning.replacement,
            });
          }
        }
      },
      
      getWarnings: () => {
        if (!context.clientId) return [];
        return this.deprecationManager.getClientWarnings(context.clientId);
      },
      
      shouldWarnClient: (path: string) => {
        const [typeName, fieldName] = path.split('.');
        return this.deprecationManager.isFieldDeprecated(typeName, fieldName);
      },
    };
  }

  createMigrationHelper(context: VersionContext): MigrationHelper {
    return {
      getMigrationPlan: (fromVersion: ApiVersion, toVersion: ApiVersion): MigrationPlan => {
        // Generate migration plan based on version changes
        return {
          fromVersion,
          toVersion,
          steps: [], // Would be populated with actual migration steps
          estimatedDuration: '2-4 hours',
          breakingChanges: [],
          testing: {
            required: true,
            testCases: [],
            rollbackPlan: [],
          },
        };
      },
      
      validateMigration: async (plan: MigrationPlan): Promise<boolean> => {
        // Validate migration plan
        return true;
      },
      
      generateMigrationQuery: (
        oldQuery: string,
        fromVersion: ApiVersion,
        toVersion: ApiVersion
      ): string => {
        // Transform query for new version
        let migratedQuery = oldQuery;
        
        // Apply known field migrations
        if (fromVersion === 'v1' && toVersion >= 'v2') {
          migratedQuery = migratedQuery
            .replace(/\bcompleted\b/g, 'status')
            .replace(/\bname\b/g, 'firstName lastName');
        }
        
        return migratedQuery;
      },
    };
  }

  getVersionUsageStats(version: ApiVersion, startDate: Date, endDate: Date): VersionUsageStats {
    // This would typically query a database or analytics service
    // For now, return mock data
    return {
      version,
      requestCount: 1000,
      uniqueClients: 50,
      errorRate: 0.02,
      avgResponseTime: 150,
      topQueries: [
        { query: 'todos', count: 400, errorRate: 0.01 },
        { query: 'user', count: 300, errorRate: 0.02 },
        { query: 'todoLists', count: 200, errorRate: 0.01 },
      ],
      deprecationWarnings: [
        { path: 'Todo.completed', count: 50, lastSeen: new Date().toISOString() },
        { path: 'User.name', count: 25, lastSeen: new Date().toISOString() },
      ],
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }
}

// ================================
// Singleton Instances
// ================================

const defaultConfig: VersioningConfig = {
  supportedVersions: ['v1', 'v2', 'v3'],
  defaultVersion: 'v3',
  deprecationPolicy: {
    warningPeriod: '6 months',
    sunsetPeriod: '12 months',
    notificationChannels: ['api-notifications@example.com'],
  },
  clientTracking: {
    enabled: true,
    identificationHeader: 'x-client-id',
    trackAnonymous: false,
  },
  analytics: {
    enabled: true,
    retentionPeriod: '90 days',
    reportingSchedule: 'weekly',
  },
  migration: {
    autoSuggestMigrations: true,
    provideMigrationQueries: true,
    validateMigrations: true,
  },
};

export const versionRegistry = new VersionRegistry();
export const deprecationManager = new DeprecationManager(defaultConfig);
export const versionManager = new VersionManager(versionRegistry, deprecationManager, defaultConfig);