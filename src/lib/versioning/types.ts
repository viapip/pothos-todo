/**
 * API Versioning and Deprecation Framework Types
 * Comprehensive type definitions for managing GraphQL schema evolution
 */

// ================================
// Version Management Types
// ================================

export type ApiVersion = 'v1' | 'v2' | 'v3';

export interface VersionInfo {
  version: ApiVersion;
  releaseDate: string;
  deprecationDate?: string;
  sunsetDate?: string;
  status: 'stable' | 'deprecated' | 'sunset';
  description: string;
  breakingChanges?: string[];
  migrationGuide?: string;
}

export interface VersionedEndpoint {
  path: string;
  versions: ApiVersion[];
  defaultVersion: ApiVersion;
  deprecated?: {
    version: ApiVersion;
    reason: string;
    replacement?: string;
    sunsetDate: string;
  };
}

// ================================
// Deprecation Management Types
// ================================

export interface DeprecationInfo {
  reason: string;
  deprecatedAt: string;
  removedAt?: string;
  replacement?: {
    field?: string;
    type?: string;
    query?: string;
    mutation?: string;
  };
  migrationSteps?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DeprecatedField {
  typeName: string;
  fieldName: string;
  deprecation: DeprecationInfo;
  usage?: {
    count: number;
    lastUsed: string;
    clients: string[];
  };
}

export interface DeprecatedArgument {
  typeName: string;
  fieldName: string;
  argumentName: string;
  deprecation: DeprecationInfo;
}

export interface DeprecatedType {
  typeName: string;
  deprecation: DeprecationInfo;
  replacement?: string;
}

export interface DeprecatedDirective {
  directiveName: string;
  deprecation: DeprecationInfo;
}

// ================================
// Client Version Management
// ================================

export interface ClientVersionInfo {
  clientId: string;
  clientName?: string;
  version: ApiVersion;
  requestedAt: string;
  userAgent?: string;
  deprecationWarnings: DeprecationWarning[];
  migrationRecommendations: MigrationRecommendation[];
}

export interface DeprecationWarning {
  type: 'field' | 'argument' | 'type' | 'directive' | 'query' | 'mutation';
  path: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  deprecatedAt: string;
  removedAt?: string;
  replacement?: string;
  count: number;
}

export interface MigrationRecommendation {
  type: 'field_migration' | 'type_migration' | 'query_restructure' | 'version_upgrade';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  steps: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  deadline?: string;
}

// ================================
// Schema Evolution Types
// ================================

export interface SchemaChange {
  id: string;
  version: ApiVersion;
  changeType: 'addition' | 'modification' | 'deprecation' | 'removal';
  category: 'field' | 'type' | 'argument' | 'directive' | 'enum_value';
  target: string;
  description: string;
  breakingChange: boolean;
  deprecationInfo?: DeprecationInfo;
  implementedAt: string;
  affectedClients?: string[];
}

export interface FieldEvolution {
  typeName: string;
  fieldName: string;
  versions: {
    [K in ApiVersion]?: {
      type: string;
      args?: Record<string, any>;
      deprecation?: DeprecationInfo;
      resolver?: string;
    };
  };
}

export interface TypeEvolution {
  typeName: string;
  versions: {
    [K in ApiVersion]?: {
      fields: Record<string, any>;
      deprecation?: DeprecationInfo;
      replacement?: string;
    };
  };
}

// ================================
// Version Resolution Types
// ================================

export interface VersionContext {
  requestedVersion: ApiVersion;
  clientId?: string;
  userAgent?: string;
  acceptsDeprecation: boolean;
  migrationMode: boolean;
}

export interface VersionedResolver<TArgs = any, TReturn = any> {
  versions: {
    [K in ApiVersion]?: (
      parent: any,
      args: TArgs,
      context: any,
      info: any
    ) => Promise<TReturn> | TReturn;
  };
  deprecationHandler?: (
    version: ApiVersion,
    context: VersionContext
  ) => void;
}

export interface VersionedFieldConfig {
  type: string | any;
  args?: Record<string, any>;
  resolve?: VersionedResolver['versions'][ApiVersion];
  deprecation?: DeprecationInfo;
  subscribe?: VersionedResolver['versions'][ApiVersion];
}

// ================================
// Migration Types
// ================================

export interface MigrationPlan {
  fromVersion: ApiVersion;
  toVersion: ApiVersion;
  steps: MigrationStep[];
  estimatedDuration: string;
  breakingChanges: string[];
  testing: {
    required: boolean;
    testCases: string[];
    rollbackPlan: string[];
  };
}

export interface MigrationStep {
  id: string;
  title: string;
  description: string;
  category: 'schema_change' | 'client_update' | 'data_migration' | 'testing';
  required: boolean;
  automatable: boolean;
  documentation: string;
  validation: {
    query?: string;
    expectedResult?: any;
  };
}

// ================================
// Analytics and Reporting Types
// ================================

export interface VersionUsageStats {
  version: ApiVersion;
  requestCount: number;
  uniqueClients: number;
  errorRate: number;
  avgResponseTime: number;
  topQueries: Array<{
    query: string;
    count: number;
    errorRate: number;
  }>;
  deprecationWarnings: Array<{
    path: string;
    count: number;
    lastSeen: string;
  }>;
  period: {
    start: string;
    end: string;
  };
}

export interface DeprecationReport {
  generatedAt: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalDeprecatedFields: number;
    totalWarningsIssued: number;
    clientsAffected: number;
    criticalDeprecations: number;
  };
  deprecatedItems: Array<{
    path: string;
    type: string;
    severity: string;
    usageCount: number;
    affectedClients: string[];
    sunsetDate?: string;
  }>;
  recommendations: MigrationRecommendation[];
}

// ================================
// Configuration Types
// ================================

export interface VersioningConfig {
  supportedVersions: ApiVersion[];
  defaultVersion: ApiVersion;
  deprecationPolicy: {
    warningPeriod: string; // e.g., "6 months"
    sunsetPeriod: string; // e.g., "12 months"
    notificationChannels: string[];
  };
  clientTracking: {
    enabled: boolean;
    identificationHeader: string;
    trackAnonymous: boolean;
  };
  analytics: {
    enabled: boolean;
    retentionPeriod: string;
    reportingSchedule: string;
  };
  migration: {
    autoSuggestMigrations: boolean;
    provideMigrationQueries: boolean;
    validateMigrations: boolean;
  };
}

// ================================
// Runtime Types
// ================================

import type { Context } from '../../api/schema/builder.js';

export interface VersionedGraphQLContext extends Context {
  version: ApiVersion;
  clientInfo?: {
    id: string;
    name?: string;
    userAgent?: string;
  };
  deprecationTracker: DeprecationTracker;
  migrationHelper: MigrationHelper;
}

export interface DeprecationTracker {
  trackUsage(path: string, severity: DeprecationWarning['severity']): void;
  getWarnings(): DeprecationWarning[];
  shouldWarnClient(path: string): boolean;
}

export interface MigrationHelper {
  getMigrationPlan(fromVersion: ApiVersion, toVersion: ApiVersion): MigrationPlan;
  validateMigration(plan: MigrationPlan): Promise<boolean>;
  generateMigrationQuery(oldQuery: string, fromVersion: ApiVersion, toVersion: ApiVersion): string;
}

// ================================
// Error Types
// ================================

export class VersioningError extends Error {
  constructor(
    message: string,
    public code: string,
    public version?: ApiVersion,
    public path?: string
  ) {
    super(message);
    this.name = 'VersioningError';
  }
}

export class DeprecationError extends VersioningError {
  constructor(
    message: string,
    public deprecationInfo: DeprecationInfo,
    public path: string,
    public version: ApiVersion
  ) {
    super(message, 'DEPRECATED_USAGE', version, path);
    this.name = 'DeprecationError';
  }
}

export class UnsupportedVersionError extends VersioningError {
  constructor(
    requestedVersion: ApiVersion,
    supportedVersions: ApiVersion[]
  ) {
    super(
      `Unsupported API version: ${requestedVersion}. Supported versions: ${supportedVersions.join(', ')}`,
      'UNSUPPORTED_VERSION',
      requestedVersion
    );
    this.name = 'UnsupportedVersionError';
  }
}