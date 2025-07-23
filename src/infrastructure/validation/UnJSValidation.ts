/**
 * Enhanced validation system using UnJS utilities with Zod integration
 * Provides comprehensive validation with automatic schema generation
 */

import { z, ZodSchema, ZodType, ZodError } from 'zod';
import { stringUtils, objectUtils, logger, pathUtils } from '@/lib/unjs-utils.js';
import { untyped } from 'untyped';
import type { H3Event } from 'h3';

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  meta?: {
    duration: number;
    schema: string;
    fieldCount: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
  path: string[];
}

export interface SchemaDefinition {
  type: string;
  required?: boolean;
  default?: any;
  description?: string;
  examples?: any[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    format?: string;
    enum?: any[];
  };
}

/**
 * Enhanced validation service with automatic schema generation
 */
export class UnJSValidationService {
  private schemas: Map<string, ZodSchema> = new Map();
  private schemaDefinitions: Map<string, Record<string, SchemaDefinition>> = new Map();

  /**
   * Register a Zod schema with metadata
   */
  registerSchema<T>(name: string, schema: ZodSchema<T>, definition?: Record<string, SchemaDefinition>): void {
    this.schemas.set(name, schema);
    if (definition) {
      this.schemaDefinitions.set(name, definition);
    }
    logger.debug('Schema registered', { name, hasDefinition: !!definition });
  }

  /**
   * Create schema from type definition using untyped
   */
  async createSchemaFromType<T = any>(
    name: string,
    typeDefinition: Record<string, SchemaDefinition>
  ): Promise<ZodSchema<T>> {
    const zodFields: Record<string, ZodType> = {};

    for (const [fieldName, definition] of Object.entries(typeDefinition)) {
      let zodType: ZodType;

      // Create base type
      switch (definition.type) {
        case 'string':
          zodType = z.string();
          if (definition.validation?.min) {
            zodType = (zodType as z.ZodString).min(definition.validation.min);
          }
          if (definition.validation?.max) {
            zodType = (zodType as z.ZodString).max(definition.validation.max);
          }
          if (definition.validation?.pattern) {
            zodType = (zodType as z.ZodString).regex(new RegExp(definition.validation.pattern));
          }
          if (definition.validation?.format === 'email') {
            zodType = (zodType as z.ZodString).email();
          }
          if (definition.validation?.format === 'url') {
            zodType = (zodType as z.ZodString).url();
          }
          if (definition.validation?.format === 'uuid') {
            zodType = (zodType as z.ZodString).uuid();
          }
          if (definition.validation?.enum) {
            zodType = z.enum(definition.validation.enum as [string, ...string[]]);
          }
          break;

        case 'number':
          zodType = z.number();
          if (definition.validation?.min !== undefined) {
            zodType = (zodType as z.ZodNumber).min(definition.validation.min);
          }
          if (definition.validation?.max !== undefined) {
            zodType = (zodType as z.ZodNumber).max(definition.validation.max);
          }
          break;

        case 'integer':
          zodType = z.number().int();
          if (definition.validation?.min !== undefined) {
            zodType = (zodType as z.ZodNumber).min(definition.validation.min);
          }
          if (definition.validation?.max !== undefined) {
            zodType = (zodType as z.ZodNumber).max(definition.validation.max);
          }
          break;

        case 'boolean':
          zodType = z.boolean();
          break;

        case 'date':
          zodType = z.date();
          break;

        case 'array':
          zodType = z.array(z.any());
          if (definition.validation?.min !== undefined) {
            zodType = (zodType as z.ZodArray<any>).min(definition.validation.min);
          }
          if (definition.validation?.max !== undefined) {
            zodType = (zodType as z.ZodArray<any>).max(definition.validation.max);
          }
          break;

        case 'object':
          zodType = z.object({});
          break;

        default:
          zodType = z.any();
      }

      // Handle optional/required and defaults
      if (!definition.required) {
        zodType = zodType.optional();
      }

      if (definition.default !== undefined) {
        zodType = zodType.default(definition.default);
      }

      zodFields[fieldName] = zodType;
    }

    const schema = z.object(zodFields) as ZodSchema<T>;
    this.registerSchema(name, schema, typeDefinition);
    return schema;
  }

  /**
   * Validate data against a registered schema
   */
  async validate<T = any>(schemaName: string, data: unknown): Promise<ValidationResult<T>> {
    const startTime = Date.now();
    const schema = this.schemas.get(schemaName);
    
    if (!schema) {
      return {
        success: false,
        errors: [{
          field: 'schema',
          message: `Schema '${schemaName}' not found`,
          code: 'SCHEMA_NOT_FOUND',
          path: []
        }],
        meta: {
          duration: Date.now() - startTime,
          schema: schemaName,
          fieldCount: 0
        }
      };
    }

    try {
      const result = await schema.parseAsync(data);
      
      return {
        success: true,
        data: result as T,
        meta: {
          duration: Date.now() - startTime,
          schema: schemaName,
          fieldCount: Object.keys(result as object || {}).length
        }
      };
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: ValidationError[] = error.issues.map(issue => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
          code: issue.code,
          value: (data as any)?.[issue.path[0]],
          path: issue.path.map(String)
        }));

        return {
          success: false,
          errors: validationErrors,
          meta: {
            duration: Date.now() - startTime,
            schema: schemaName,
            fieldCount: Object.keys(data as object || {}).length
          }
        };
      }

      return {
        success: false,
        errors: [{
          field: 'unknown',
          message: String(error),
          code: 'VALIDATION_ERROR',
          path: []
        }],
        meta: {
          duration: Date.now() - startTime,
          schema: schemaName,
          fieldCount: 0
        }
      };
    }
  }

  /**
   * Validate H3 request body
   */
  async validateRequestBody<T = any>(
    event: H3Event,
    schemaName: string
  ): Promise<ValidationResult<T>> {
    try {
      const body = await readBody(event);
      return this.validate<T>(schemaName, body);
    } catch (error) {
      return {
        success: false,
        errors: [{
          field: 'body',
          message: 'Failed to parse request body',
          code: 'BODY_PARSE_ERROR',
          path: []
        }]
      };
    }
  }

  /**
   * Validate H3 query parameters
   */
  async validateQuery<T = any>(
    event: H3Event,
    schemaName: string
  ): Promise<ValidationResult<T>> {
    const query = getQuery(event);
    return this.validate<T>(schemaName, query);
  }

  /**
   * Generate JSON Schema from Zod schema
   */
  generateJsonSchema(schemaName: string): any {
    const definition = this.schemaDefinitions.get(schemaName);
    if (!definition) {
      return null;
    }

    const jsonSchema: any = {
      type: 'object',
      properties: {},
      required: []
    };

    for (const [fieldName, fieldDef] of Object.entries(definition)) {
      jsonSchema.properties[fieldName] = {
        type: fieldDef.type,
        description: fieldDef.description,
        examples: fieldDef.examples
      };

      if (fieldDef.validation) {
        Object.assign(jsonSchema.properties[fieldName], fieldDef.validation);
      }

      if (fieldDef.required) {
        jsonSchema.required.push(fieldName);
      }

      if (fieldDef.default !== undefined) {
        jsonSchema.properties[fieldName].default = fieldDef.default;
      }
    }

    return jsonSchema;
  }

  /**
   * Generate TypeScript interface from schema definition
   */
  generateTypeScriptInterface(schemaName: string): string {
    const definition = this.schemaDefinitions.get(schemaName);
    if (!definition) {
      return '';
    }

    const interfaceName = stringUtils.pascalCase(schemaName);
    let tsInterface = `export interface ${interfaceName} {\n`;

    for (const [fieldName, fieldDef] of Object.entries(definition)) {
      const optional = fieldDef.required ? '' : '?';
      let tsType: string;

      switch (fieldDef.type) {
        case 'string':
          if (fieldDef.validation?.enum) {
            tsType = fieldDef.validation.enum.map(v => `'${v}'`).join(' | ');
          } else {
            tsType = 'string';
          }
          break;
        case 'number':
        case 'integer':
          tsType = 'number';
          break;
        case 'boolean':
          tsType = 'boolean';
          break;
        case 'date':
          tsType = 'Date';
          break;
        case 'array':
          tsType = 'any[]';
          break;
        case 'object':
          tsType = 'Record<string, any>';
          break;
        default:
          tsType = 'any';
      }

      const comment = fieldDef.description ? `  /** ${fieldDef.description} */\n` : '';
      tsInterface += `${comment}  ${fieldName}${optional}: ${tsType};\n`;
    }

    tsInterface += '}';
    return tsInterface;
  }

  /**
   * Create validation middleware for H3
   */
  createValidationMiddleware(schemaName: string, validateBody = true, validateQuery = false) {
    return async (event: H3Event, next: Function) => {
      const results: ValidationResult[] = [];

      if (validateBody) {
        const bodyResult = await this.validateRequestBody(event, schemaName);
        if (!bodyResult.success) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Validation Error',
            data: {
              type: 'VALIDATION_ERROR',
              errors: bodyResult.errors,
              meta: bodyResult.meta
            }
          });
        }
        results.push(bodyResult);
      }

      if (validateQuery) {
        const queryResult = await this.validateQuery(event, schemaName);
        if (!queryResult.success) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Query Validation Error',
            data: {
              type: 'QUERY_VALIDATION_ERROR',
              errors: queryResult.errors,
              meta: queryResult.meta
            }
          });
        }
        results.push(queryResult);
      }

      // Store validation results in event context
      event.context.validationResults = results;
      
      return next();
    };
  }

  /**
   * Batch validate multiple schemas
   */
  async validateBatch(
    validations: Array<{ schema: string; data: unknown; label?: string }>
  ): Promise<{
    success: boolean;
    results: Array<ValidationResult & { label?: string }>;
    summary: {
      total: number;
      passed: number;
      failed: number;
      totalDuration: number;
    };
  }> {
    const startTime = Date.now();
    const results: Array<ValidationResult & { label?: string }> = [];

    for (const validation of validations) {
      const result = await this.validate(validation.schema, validation.data);
      results.push({
        ...result,
        label: validation.label
      });
    }

    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    return {
      success: failed === 0,
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        totalDuration: Date.now() - startTime
      }
    };
  }

  /**
   * Get all registered schemas
   */
  getRegisteredSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get schema definition
   */
  getSchemaDefinition(schemaName: string): Record<string, SchemaDefinition> | undefined {
    return this.schemaDefinitions.get(schemaName);
  }

  /**
   * Remove a registered schema
   */
  unregisterSchema(schemaName: string): boolean {
    const hadSchema = this.schemas.has(schemaName);
    this.schemas.delete(schemaName);
    this.schemaDefinitions.delete(schemaName);
    return hadSchema;
  }

  /**
   * Clear all schemas
   */
  clearSchemas(): void {
    this.schemas.clear();
    this.schemaDefinitions.clear();
    logger.debug('All validation schemas cleared');
  }
}

// Common validation schemas
const commonSchemas = {
  email: z.string().email(),
  uuid: z.string().uuid(),
  url: z.string().url(),
  positiveNumber: z.number().positive(),
  nonEmptyString: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  iso8601: z.string().datetime(),
  semver: z.string().regex(/^\d+\.\d+\.\d+$/),
};

// Export singleton instance
export const validationService = new UnJSValidationService();

// Pre-register common schemas
Object.entries(commonSchemas).forEach(([name, schema]) => {
  validationService.registerSchema(name, schema);
});

// Re-export for convenience
export { z, ZodSchema, ZodError };

// Helper functions
import { readBody, getQuery, createError } from 'h3';

export { commonSchemas };