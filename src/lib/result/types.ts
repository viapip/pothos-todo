/**
 * Result types for comprehensive error handling
 * Based on neverthrow with domain-specific error types
 */

import { Result, Ok, Err, type ResultAsync } from "neverthrow";

// Re-export neverthrow types
export { Result, Ok, Err, type ResultAsync };
export type { Err as ErrType, Ok as OkType } from "neverthrow";

/**
 * Base error types for the application
 */
export enum ErrorCode {
  // Generic errors
  UNKNOWN = "UNKNOWN",
  VALIDATION = "VALIDATION",
  NOT_FOUND = "NOT_FOUND",
  FORBIDDEN = "FORBIDDEN",
  UNAUTHORIZED = "UNAUTHORIZED",
  CONFLICT = "CONFLICT",
  TIMEOUT = "TIMEOUT",

  // Authentication errors
  AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN",
  AUTH_EXPIRED_TOKEN = "AUTH_EXPIRED_TOKEN",
  AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN",
  AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
  AUTH_USER_NOT_FOUND = "AUTH_USER_NOT_FOUND",
  AUTH_SESSION_INVALID = "AUTH_SESSION_INVALID",

  // Database errors
  DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED",
  DB_QUERY_FAILED = "DB_QUERY_FAILED",
  DB_CONSTRAINT_VIOLATION = "DB_CONSTRAINT_VIOLATION",
  DB_RECORD_NOT_FOUND = "DB_RECORD_NOT_FOUND",

  // Cache errors
  CACHE_CONNECTION_FAILED = "CACHE_CONNECTION_FAILED",
  CACHE_OPERATION_FAILED = "CACHE_OPERATION_FAILED",

  // External service errors
  EXTERNAL_SERVICE_UNAVAILABLE = "EXTERNAL_SERVICE_UNAVAILABLE",
  EXTERNAL_SERVICE_TIMEOUT = "EXTERNAL_SERVICE_TIMEOUT",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",

  // Business logic errors
  BUSINESS_RULE_VIOLATION = "BUSINESS_RULE_VIOLATION",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
}

/**
 * Base application error
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;
  public override cause: Error | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context || {};
    this.timestamp = new Date();
    this.cause = cause || undefined;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  public readonly field: string;
  public readonly value: any;
  public readonly constraint: string;

  constructor(
    message: string,
    field?: string,
    value?: any,
    constraint?: string,
    context?: Record<string, any>
  ) {
    super(ErrorCode.VALIDATION, message, context);
    this.name = "ValidationError";
    this.field = field || "";
    this.value = value || undefined;
    this.constraint = constraint || "";
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(code, message, context, cause);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  public readonly requiredPermissions: string[];
  public readonly currentPermissions: string[];

  constructor(
    message: string,
    requiredPermissions?: string[],
    currentPermissions?: string[],
    context?: Record<string, any>
  ) {
    super(ErrorCode.FORBIDDEN, message, context);
    this.name = "AuthorizationError";
    this.requiredPermissions = requiredPermissions || [];
    this.currentPermissions = currentPermissions || [];
  }
}

/**
 * Database error
 */
export class DatabaseError extends AppError {
  public readonly query: string;
  public readonly params: any[];

  constructor(
    code: ErrorCode,
    message: string,
    query?: string,
    params?: any[],
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(code, message, context, cause);
    this.name = "DatabaseError";
    this.query = query || "";
    this.params = params || [];
  }
}

/**
 * Cache error
 */
export class CacheError extends AppError {
  public readonly operation: string;
  public readonly key: string;

  constructor(
    code: ErrorCode,
    message: string,
    operation?: string,
    key?: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(code, message, context, cause);
    this.name = "CacheError";
    this.operation = operation || "";
    this.key = key || "";
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly endpoint: string;
  public readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    service?: string,
    endpoint?: string,
    status?: number,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(code, message, context, cause);
    this.name = "ExternalServiceError";
    this.service = service || "";
    this.endpoint = endpoint || "";
    this.status = status || 0;
  }
}

/**
 * Business logic error
 */
export class BusinessError extends AppError {
  public readonly rule: string;

  constructor(message: string, rule?: string, context?: Record<string, any>) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, message, context);
    this.name = "BusinessError";
    this.rule = rule || "";
  }
}

/**
 * Type aliases for common Result patterns
 */
export type AppResult<T> = Result<T, AppError>;
export type AsyncAppResult<T> = ResultAsync<T, AppError>;
export type ValidationResult<T> = Result<T, ValidationError>;
export type AuthResult<T> = Result<T, AuthenticationError | AuthorizationError>;
export type DatabaseResult<T> = Result<T, DatabaseError>;
export type CacheResult<T> = Result<T, CacheError>;

/**
 * Helper functions to create errors
 */
export const Errors = {
  unknown: (message: string, cause?: Error) =>
    new AppError(ErrorCode.UNKNOWN, message, undefined, cause),

  validation: (
    message: string,
    field?: string,
    value?: any,
    constraint?: string
  ) => new ValidationError(message, field, value, constraint),

  notFound: (resource: string, identifier?: string) =>
    new AppError(
      ErrorCode.NOT_FOUND,
      `${resource} not found${identifier ? `: ${identifier}` : ""}`
    ),

  unauthorized: (message: string = "Authentication required") =>
    new AuthenticationError(ErrorCode.UNAUTHORIZED, message),

  forbidden: (message: string = "Insufficient permissions") =>
    new AuthorizationError(message),

  conflict: (message: string, context?: Record<string, any>) =>
    new AppError(ErrorCode.CONFLICT, message, context),

  timeout: (operation: string, duration?: number) =>
    new AppError(ErrorCode.TIMEOUT, `Operation timed out: ${operation}`, {
      duration,
    }),

  database: (message: string, query?: string, params?: any[], cause?: Error) =>
    new DatabaseError(
      ErrorCode.DB_QUERY_FAILED,
      message,
      query,
      params,
      undefined,
      cause
    ),

  cache: (message: string, operation?: string, key?: string, cause?: Error) =>
    new CacheError(
      ErrorCode.CACHE_OPERATION_FAILED,
      message,
      operation,
      key,
      undefined,
      cause
    ),

  externalService: (
    service: string,
    message: string,
    endpoint?: string,
    status?: number,
    cause?: Error
  ) =>
    new ExternalServiceError(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      message,
      service,
      endpoint,
      status,
      undefined,
      cause
    ),

  business: (message: string, rule?: string, context?: Record<string, any>) =>
    new BusinessError(message, rule, context),
};

/**
 * Type guards for error types
 */
export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError;

export const isValidationError = (error: unknown): error is ValidationError =>
  error instanceof ValidationError;

export const isAuthenticationError = (
  error: unknown
): error is AuthenticationError => error instanceof AuthenticationError;

export const isAuthorizationError = (
  error: unknown
): error is AuthorizationError => error instanceof AuthorizationError;

export const isDatabaseError = (error: unknown): error is DatabaseError =>
  error instanceof DatabaseError;

export const isCacheError = (error: unknown): error is CacheError =>
  error instanceof CacheError;

export const isExternalServiceError = (
  error: unknown
): error is ExternalServiceError => error instanceof ExternalServiceError;

export const isBusinessError = (error: unknown): error is BusinessError =>
  error instanceof BusinessError;

/**
 * Convert unknown error to AppError
 */
export const toAppError = (error: unknown): AppError => {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.UNKNOWN, error.message, undefined, error);
  }

  if (typeof error === "string") {
    return new AppError(ErrorCode.UNKNOWN, error);
  }

  return new AppError(ErrorCode.UNKNOWN, "Unknown error occurred", {
    originalError: error,
  });
};
