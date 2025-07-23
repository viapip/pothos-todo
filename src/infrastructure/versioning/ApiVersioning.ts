import type { H3Event } from 'h3';
import { logger } from '@/logger.js';

export interface ApiVersionConfig {
  /**
   * Default API version
   */
  defaultVersion: string;
  
  /**
   * Supported API versions
   */
  supportedVersions: string[];
  
  /**
   * Deprecated versions with sunset dates
   */
  deprecatedVersions: {
    version: string;
    sunsetDate: Date;
    message?: string;
  }[];
  
  /**
   * Version header name
   */
  versionHeader: string;
  
  /**
   * Whether to include version in response headers
   */
  includeVersionInResponse: boolean;
}

export interface VersionContext {
  version: string;
  isDeprecated: boolean;
  deprecationInfo?: {
    sunsetDate: Date;
    message?: string;
  };
}

export class ApiVersioning {
  private config: ApiVersionConfig;

  constructor(config: ApiVersionConfig) {
    this.config = config;
  }

  /**
   * Extract and validate API version from request
   */
  public extractVersion(event: H3Event): VersionContext {
    // Try to get version from header
    let requestedVersion = event.node.req.headers[this.config.versionHeader.toLowerCase()] as string;
    
    // Fallback to query parameter
    if (!requestedVersion) {
      const url = new URL(event.node.req.url || '', `http://${event.node.req.headers.host}`);
      requestedVersion = url.searchParams.get('version') || '';
    }

    // Use default version if none specified
    const version = requestedVersion || this.config.defaultVersion;

    // Validate version
    if (!this.config.supportedVersions.includes(version)) {
      throw new Error(`Unsupported API version: ${version}. Supported versions: ${this.config.supportedVersions.join(', ')}`);
    }

    // Check if version is deprecated
    const deprecationInfo = this.config.deprecatedVersions.find(d => d.version === version);
    const isDeprecated = !!deprecationInfo;

    // Add version to response headers
    if (this.config.includeVersionInResponse) {
      event.node.res.setHeader('X-API-Version', version);
    }

    // Add deprecation warning headers if applicable
    if (isDeprecated && deprecationInfo) {
      event.node.res.setHeader('X-API-Deprecated', 'true');
      event.node.res.setHeader('X-API-Sunset-Date', deprecationInfo.sunsetDate.toISOString());
      
      if (deprecationInfo.message) {
        event.node.res.setHeader('X-API-Deprecation-Message', deprecationInfo.message);
      }

      // Log deprecation usage
      logger.warn('Deprecated API version used', {
        version,
        sunsetDate: deprecationInfo.sunsetDate,
        userAgent: event.node.req.headers['user-agent'],
        ip: event.node.req.headers['x-forwarded-for'] || event.node.req.connection?.remoteAddress,
      });
    }

    return {
      version,
      isDeprecated,
      deprecationInfo,
    };
  }

  /**
   * Get schema for specific version
   */
  public getSchemaForVersion(version: string): any {
    // In a real implementation, you might have different schema versions
    // For now, we'll use the same schema but could apply transforms
    
    switch (version) {
      case 'v1':
        return this.transformSchemaForV1();
      case 'v2':
        return this.transformSchemaForV2();
      default:
        throw new Error(`Schema not available for version: ${version}`);
    }
  }

  /**
   * Apply version-specific schema transformations for v1
   */
  private transformSchemaForV1(): any {
    // Example: Remove newer fields, rename fields, etc.
    return {
      version: 'v1',
      deprecatedFields: ['newField', 'renamedField'],
      fieldMappings: {
        'oldFieldName': 'newFieldName'
      }
    };
  }

  /**
   * Apply version-specific schema transformations for v2
   */
  private transformSchemaForV2(): any {
    // Current schema version
    return {
      version: 'v2',
      newFeatures: ['aiFeatures', 'realtimeSubscriptions'],
    };
  }

  /**
   * Check if a feature is available in the given version
   */
  public isFeatureAvailable(feature: string, version: string): boolean {
    const featureVersionMap: Record<string, string[]> = {
      'aiFeatures': ['v2'],
      'realtimeSubscriptions': ['v2'],
      'basicCrud': ['v1', 'v2'],
      'authentication': ['v1', 'v2'],
    };

    return featureVersionMap[feature]?.includes(version) || false;
  }

  /**
   * Get version compatibility matrix
   */
  public getCompatibilityMatrix(): Record<string, any> {
    return {
      v1: {
        features: ['basicCrud', 'authentication'],
        deprecated: this.config.deprecatedVersions.some(d => d.version === 'v1'),
        sunsetDate: this.config.deprecatedVersions.find(d => d.version === 'v1')?.sunsetDate,
      },
      v2: {
        features: ['basicCrud', 'authentication', 'aiFeatures', 'realtimeSubscriptions'],
        deprecated: this.config.deprecatedVersions.some(d => d.version === 'v2'),
        current: this.config.defaultVersion === 'v2',
      },
    };
  }
}

/**
 * Default API versioning configuration
 */
export const defaultVersionConfig: ApiVersionConfig = {
  defaultVersion: 'v2',
  supportedVersions: ['v1', 'v2'],
  deprecatedVersions: [
    {
      version: 'v1',
      sunsetDate: new Date('2025-12-31'),
      message: 'API v1 is deprecated. Please migrate to v2 by December 31, 2025.',
    },
  ],
  versionHeader: 'X-API-Version',
  includeVersionInResponse: true,
};

/**
 * GraphQL directive for version-specific fields
 */
export const versionDirectiveTypeDef = `
  directive @version(
    added: String
    deprecated: String
    removed: String
    reason: String
  ) on FIELD_DEFINITION | ENUM_VALUE | INPUT_FIELD_DEFINITION
`;

/**
 * Version-aware GraphQL schema transformer
 */
export class VersionedSchemaTransformer {
  private version: string;

  constructor(version: string) {
    this.version = version;
  }

  /**
   * Transform GraphQL execution result based on version
   */
  public transformResult(result: any): any {
    if (!result.data) return result;

    return {
      ...result,
      data: this.transformData(result.data),
      extensions: {
        ...result.extensions,
        version: this.version,
      },
    };
  }

  /**
   * Transform data object based on version rules
   */
  private transformData(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.transformData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const transformed: any = {};

      for (const [key, value] of Object.entries(data)) {
        // Apply version-specific field transformations
        const transformedKey = this.transformFieldName(key);
        const transformedValue = this.transformData(value);

        // Only include field if it's available in this version
        if (this.shouldIncludeField(key)) {
          transformed[transformedKey] = transformedValue;
        }
      }

      return transformed;
    }

    return data;
  }

  /**
   * Transform field names for version compatibility
   */
  private transformFieldName(fieldName: string): string {
    const v1FieldMappings: Record<string, string> = {
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'todoList': 'todo_list',
    };

    if (this.version === 'v1' && v1FieldMappings[fieldName]) {
      return v1FieldMappings[fieldName];
    }

    return fieldName;
  }

  /**
   * Check if field should be included in response for this version
   */
  private shouldIncludeField(fieldName: string): boolean {
    const v2OnlyFields = ['aiSuggestions', 'complexity', 'embedding'];
    
    if (this.version === 'v1' && v2OnlyFields.includes(fieldName)) {
      return false;
    }

    return true;
  }
}