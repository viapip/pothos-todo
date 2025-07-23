export * from './schemas/todo.js';
export * from './schemas/user.js';

// Re-export zod for convenience
export { z } from 'zod';
export type { ZodError, ZodIssue } from 'zod';

// Custom error formatter
export function formatZodError(error: import('zod').ZodError): string {
  return error.issues
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}

// Create a validation error class
export class ValidationError extends Error {
  public readonly errors: import('zod').ZodIssue[];
  
  constructor(error: import('zod').ZodError) {
    super(formatZodError(error));
    this.name = 'ValidationError';
    this.errors = error.issues;
  }
}