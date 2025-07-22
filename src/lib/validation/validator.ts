/**
 * Validation utilities and middleware
 */

import { z } from 'zod';
import type { H3Event } from 'h3';
import { readBody, getQuery } from 'h3';
import { ValidationError, Errors, type AppResult, type AppError, Ok, Err } from '../result/index.js';

/**
 * Validation result type
 */
export type ValidationResult<T> = AppResult<T>;

/**
 * Validate data against a Zod schema
 */
export const validate = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult<T> => {
  try {
    const result = schema.parse(data);
    return new Ok(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Convert Zod errors to our ValidationError format
      const firstIssue = error.issues[0];
      if (firstIssue) {
        const fieldPath = firstIssue.path.join('.');
        return new Err(new ValidationError(
          firstIssue.message,
          fieldPath || 'unknown',
          (firstIssue as any).received || data,
          firstIssue.code,
          {
            context,
            allIssues: error.issues,
            zodError: error.flatten(),
          }
        ));
      }
    }
    
    return new Err(Errors.validation(
      `Validation failed${context ? ` for ${context}` : ''}`,
      'unknown',
      data,
      'parse_error'
    ));
  }
};

/**
 * Validate data safely (catches all errors)
 */
export const validateSafe = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult<T> => {
  try {
    return validate(schema, data, context);
  } catch (error) {
    return new Err(Errors.validation(
      `Validation failed unexpectedly${context ? ` for ${context}` : ''}`,
      'unknown',
      data,
      'unexpected_error'
    ));
  }
};

/**
 * Validate request body
 */
export const validateBody = async <T>(
  event: H3Event,
  schema: z.ZodSchema<T>,
  context?: string
): Promise<ValidationResult<T>> => {
  try {
    const body = await readBody(event);
    return validate(schema, body, context || 'request body');
  } catch (error) {
    return new Err(Errors.validation(
      'Failed to parse request body',
      'body',
      undefined,
      'parse_error'
    ));
  }
};

/**
 * Validate query parameters
 */
export const validateQuery = <T>(
  event: H3Event,
  schema: z.ZodSchema<T>,
  context?: string
): ValidationResult<T> => {
  try {
    const query = getQuery(event);
    return validate(schema, query, context || 'query parameters');
  } catch (error) {
    return new Err(Errors.validation(
      'Failed to parse query parameters',
      'query',
      undefined,
      'parse_error'
    ));
  }
};

/**
 * Validate route parameters
 */
export const validateParams = <T>(
  event: H3Event,
  schema: z.ZodSchema<T>,
  context?: string
): ValidationResult<T> => {
  try {
    const params = event.context.params || {};
    return validate(schema, params, context || 'route parameters');
  } catch (error) {
    return new Err(Errors.validation(
      'Failed to parse route parameters',
      'params',
      undefined,
      'parse_error'
    ));
  }
};

/**
 * Create a validation middleware for H3
 */
export const createValidationMiddleware = <TBody, TQuery, TParams>(
  options: {
    body?: z.ZodSchema<TBody>;
    query?: z.ZodSchema<TQuery>;
    params?: z.ZodSchema<TParams>;
  }
) => {
  return async (event: H3Event) => {
    const results: {
      body?: TBody;
      query?: TQuery;
      params?: TParams;
    } = {};

    // Validate body if schema provided
    if (options.body) {
      const bodyResult = await validateBody(event, options.body);
      if (bodyResult.isErr()) {
        throw bodyResult.error;
      }
      results.body = bodyResult.value;
    }

    // Validate query if schema provided
    if (options.query) {
      const queryResult = validateQuery(event, options.query);
      if (queryResult.isErr()) {
        throw queryResult.error;
      }
      results.query = queryResult.value;
    }

    // Validate params if schema provided
    if (options.params) {
      const paramsResult = validateParams(event, options.params);
      if (paramsResult.isErr()) {
        throw paramsResult.error;
      }
      results.params = paramsResult.value;
    }

    // Store validated data in context
    event.context.validated = results;
    
    return results;
  };
};

/**
 * Get validated data from event context
 */
export const getValidatedData = <T = any>(event: H3Event): T => {
  return event.context.validated as T;
};

/**
 * Partial validation - validates only provided fields
 */
export const validatePartial = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult<Partial<T>> => {
  if (schema instanceof z.ZodObject) {
    // For ZodObject, make all fields optional
    const partialSchema = schema.partial();
    return validate(partialSchema, data, context) as ValidationResult<Partial<T>>;
  } else {
    // For non-object schemas, validate as-is
    return validate(schema, data, context) as ValidationResult<Partial<T>>;
  }
};

/**
 * Deep validation for nested objects
 */
export const validateNested = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  path: string[] = [],
  context?: string
): ValidationResult<T> => {
  try {
    const result = schema.parse(data);
    return new Ok(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Add path context to error
      const firstIssue = error.issues[0];
      if (firstIssue) {
        const fullPath = [...path, ...firstIssue.path.map(String)];
        const fieldPath = fullPath.join('.');
        
        return new Err(new ValidationError(
          firstIssue.message,
          fieldPath,
          (firstIssue as any).received || data,
          firstIssue.code,
          {
            context,
            path: fullPath,
            allIssues: error.issues,
            zodError: error.flatten(),
          }
        ));
      }
    }
    
    const pathStr = path.length > 0 ? path.join('.') : 'root';
    return new Err(Errors.validation(
      `Validation failed at ${pathStr}${context ? ` for ${context}` : ''}`,
      pathStr,
      data,
      'parse_error'
    ));
  }
};

/**
 * Batch validation for arrays of data
 */
export const validateBatch = <T>(
  schema: z.ZodSchema<T>,
  items: unknown[],
  context?: string
): ValidationResult<T[]> => {
  const results: T[] = [];
  const errors: AppError[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = validate(schema, item, `${context || 'item'}[${i}]`);
    
    if (result.isOk()) {
      results.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    // Return first error for simplicity
    const firstError = errors[0];
    return new Err(firstError || Errors.validation('Validation failed but no error details available'));
  }

  return new Ok(results);
};

/**
 * Conditional validation based on other field values
 */
export const createConditionalValidator = <T>(
  baseSchema: z.ZodSchema<T>,
  conditions: Array<{
    condition: (data: any) => boolean;
    schema: z.ZodSchema<T>;
    errorMessage?: string;
  }>
) => {
  return (data: unknown, context?: string): ValidationResult<T> => {
    // First validate with base schema
    const baseResult = validate(baseSchema, data, context);
    if (baseResult.isErr()) {
      return baseResult;
    }

    const validatedData = baseResult.value;

    // Check conditions
    for (const { condition, schema, errorMessage } of conditions) {
      if (condition(validatedData)) {
        const condResult = validate(schema, data, context);
        if (condResult.isErr()) {
          // Override error message if provided
          if (errorMessage) {
            const error = condResult.error as ValidationError;
            return new Err(new ValidationError(
              errorMessage,
              error.field,
              error.value,
              error.constraint,
              error.context
            ));
          }
          return condResult;
        }
        return condResult;
      }
    }

    return baseResult;
  };
};

/**
 * File validation utilities
 */
export const validateFile = (
  file: File,
  options: {
    maxSize?: number;
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
  } = {}
): ValidationResult<File> => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedMimeTypes = [],
    allowedExtensions = []
  } = options;

  // Check file size
  if (file.size > maxSize) {
    return new Err(Errors.validation(
      `File size exceeds maximum allowed size of ${maxSize} bytes`,
      'size',
      file.size,
      'max_size'
    ));
  }

  // Check MIME type
  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.type)) {
    return new Err(Errors.validation(
      `File type ${file.type} is not allowed`,
      'mimeType',
      file.type,
      'mime_type'
    ));
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(extension)) {
      return new Err(Errors.validation(
        `File extension ${extension} is not allowed`,
        'extension',
        extension,
        'file_extension'
      ));
    }
  }

  return new Ok(file);
};

/**
 * Transform validation errors for API responses
 */
export const formatValidationError = (error: ValidationError): {
  code: string;
  message: string;
  field?: string | undefined;
  value?: any;
  constraint?: string | undefined;
  details?: any;
} => {
  return {
    code: error.code,
    message: error.message,
    ...(error.field ? { field: error.field } : {}),
    ...(error.value !== undefined ? { value: error.value } : {}),
    ...(error.constraint ? { constraint: error.constraint } : {}),
    ...(error.context?.zodError ? { details: error.context.zodError } : {}),
  };
};

/**
 * Create a custom Zod transformer
 */
export const createTransformer = <TInput, TOutput>(
  transform: (input: TInput) => TOutput | Promise<TOutput>,
  schema?: z.ZodSchema<TInput>
) => {
  const baseSchema = schema || z.any();
  
  return baseSchema.transform(async (input) => {
    try {
      return await transform(input);
    } catch (error) {
      throw new z.ZodError([{
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Transform failed',
        path: [],
      }]);
    }
  });
};