import type { ZodError } from 'zod';

// Base error class for all application errors
export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    metadata?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.metadata = metadata;
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      metadata: this.metadata,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }
}

// Authentication errors
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', metadata?: Record<string, any>) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, metadata);
    this.name = 'AuthenticationError';
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class SessionExpiredError extends AuthenticationError {
  constructor() {
    super('Session has expired');
    this.name = 'SessionExpiredError';
  }
}

// Authorization errors
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', metadata?: Record<string, any>) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, metadata);
    this.name = 'AuthorizationError';
  }
}

export class InsufficientPermissionsError extends AuthorizationError {
  constructor(resource: string, action: string) {
    super(`Insufficient permissions to ${action} ${resource}`, {
      resource,
      action,
    });
    this.name = 'InsufficientPermissionsError';
  }
}

// Validation errors
export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(errors: Array<{ field: string; message: string }> | ZodError) {
    const errorList = Array.isArray(errors)
      ? errors
      : errors.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));

    const message = `Validation failed: ${errorList
      .map(e => `${e.field}: ${e.message}`)
      .join(', ')}`;

    super(message, 400, 'VALIDATION_ERROR', true, { errors: errorList });
    this.name = 'ValidationError';
    this.errors = errorList;
  }
}

// Resource errors
export class ResourceNotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'RESOURCE_NOT_FOUND', true, { resource, id });
    this.name = 'ResourceNotFoundError';
  }
}

export class ResourceConflictError extends AppError {
  constructor(resource: string, message?: string) {
    super(
      message || `${resource} already exists`,
      409,
      'RESOURCE_CONFLICT',
      true,
      { resource }
    );
    this.name = 'ResourceConflictError';
  }
}

// Business logic errors
export class BusinessLogicError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 400, 'BUSINESS_LOGIC_ERROR', true, metadata);
    this.name = 'BusinessLogicError';
  }
}

export class InvalidStateError extends BusinessLogicError {
  constructor(entity: string, currentState: string, action: string) {
    super(
      `Cannot ${action} ${entity} in ${currentState} state`,
      {
        entity,
        currentState,
        action,
      }
    );
    this.name = 'InvalidStateError';
  }
}

// External service errors
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message?: string,
    originalError?: Error
  ) {
    super(
      message || `External service '${service}' is unavailable`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      true,
      {
        service,
        originalError: originalError?.message,
      }
    );
    this.name = 'ExternalServiceError';
  }
}

// Rate limiting error
export class RateLimitError extends AppError {
  constructor(
    limit: number,
    window: number,
    retryAfter?: number
  ) {
    super(
      `Rate limit exceeded. Max ${limit} requests per ${window} seconds`,
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      {
        limit,
        window,
        retryAfter,
      }
    );
    this.name = 'RateLimitError';
  }
}

// Database errors
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      message,
      500,
      'DATABASE_ERROR',
      false, // Database errors are not operational
      {
        originalError: originalError?.message,
      }
    );
    this.name = 'DatabaseError';
  }
}

// Generic server error
export class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred', originalError?: Error) {
    super(
      message,
      500,
      'INTERNAL_SERVER_ERROR',
      false,
      {
        originalError: originalError?.message,
      }
    );
    this.name = 'InternalServerError';
  }
}

// Error type guards
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

// Error factory
export class ErrorFactory {
  static validation(errors: Array<{ field: string; message: string }> | ZodError) {
    return new ValidationError(errors);
  }

  static authentication(message?: string) {
    return new AuthenticationError(message);
  }

  static authorization(message?: string) {
    return new AuthorizationError(message);
  }

  static notFound(resource: string, id?: string) {
    return new ResourceNotFoundError(resource, id);
  }

  static conflict(resource: string, message?: string) {
    return new ResourceConflictError(resource, message);
  }

  static businessLogic(message: string, metadata?: Record<string, any>) {
    return new BusinessLogicError(message, metadata);
  }

  static rateLimit(limit: number, window: number, retryAfter?: number) {
    return new RateLimitError(limit, window, retryAfter);
  }

  static database(message: string, originalError?: Error) {
    return new DatabaseError(message, originalError);
  }

  static internal(message?: string, originalError?: Error) {
    return new InternalServerError(message, originalError);
  }
}