/**
 * Comprehensive input validation with Zod schemas
 * 
 * This module provides a robust validation system using Zod schemas
 * with comprehensive error handling and type safety.
 * 
 * Features:
 * - Type-safe validation schemas
 * - Custom validation rules and transformers
 * - File upload validation
 * - Request validation middleware for H3
 * - Batch and conditional validation
 * - Integration with Result types for error handling
 * 
 * Usage examples:
 * 
 * ```typescript
 * import { validate, validateBody, CreateTodoSchema } from '@/lib/validation';
 * 
 * // Validate plain data
 * const todoResult = validate(CreateTodoSchema, requestData);
 * todoResult.match(
 *   (validTodo) => console.log('Valid todo:', validTodo),
 *   (error) => console.error('Validation error:', error.message)
 * );
 * 
 * // Validate H3 request body
 * const bodyResult = await validateBody(event, CreateTodoSchema);
 * if (bodyResult.isErr()) {
 *   throw bodyResult.error;
 * }
 * const validatedTodo = bodyResult.value;
 * 
 * // Use validation middleware
 * const middleware = createValidationMiddleware({
 *   body: CreateTodoSchema,
 *   query: TodoQuerySchema,
 * });
 * 
 * // In your H3 handler
 * const validated = await middleware(event);
 * const { body: todoData, query: queryParams } = validated;
 * ```
 */

// Re-export everything from schemas and validator
export * from './schemas.js';
export * from './validator.js';

// Common validation patterns as shortcuts
import { 
  validate, 
  validateBody, 
  validateQuery, 
  validateParams,
  createValidationMiddleware,
  validateBatch,
  validateFile,
  formatValidationError 
} from './validator.js';

import {
  CreateTodoSchema,
  UpdateTodoSchema,
  CreateTodoListSchema,
  UpdateTodoListSchema,
  CreateUserSchema,
  UpdateUserSchema,
  LoginSchema,
  RegisterSchema,
  TodoQuerySchema,
  TodoListQuerySchema,
  PaginationSchema
} from './schemas.js';

export {
  // Core validation functions
  validate,
  validateBody,
  validateQuery,
  validateParams,
  createValidationMiddleware,
  validateBatch,
  validateFile,
  formatValidationError,
  
  // Commonly used schemas
  CreateTodoSchema,
  UpdateTodoSchema,
  CreateTodoListSchema,
  UpdateTodoListSchema,
  CreateUserSchema,
  UpdateUserSchema,
  LoginSchema,
  RegisterSchema,
  TodoQuerySchema,
  TodoListQuerySchema,
  PaginationSchema,
};