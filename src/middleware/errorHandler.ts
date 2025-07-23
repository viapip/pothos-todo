import type { H3Event, H3Error } from 'h3';
import { logger } from '@/logger';
import { isAppError, isOperationalError, type AppError } from '@/errors';
import { ZodError } from 'zod';
import { ValidationError } from '@/errors';

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    metadata?: Record<string, any>;
    stack?: string;
  };
}

/**
 * Global error handler middleware for H3
 */
export function errorHandler(error: H3Error | Error | unknown, event: H3Event): ErrorResponse | void {
  // Log the error
  logger.error('Error occurred:', error);

  // Handle AppError instances
  if (isAppError(error)) {
    return handleAppError(error as AppError, event);
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = new ValidationError(error);
    return handleAppError(validationError, event);
  }

  // Handle H3 errors
  if (isH3Error(error)) {
    return handleH3Error(error as H3Error, event);
  }

  // Handle generic errors
  if (error instanceof Error) {
    return handleGenericError(error, event);
  }

  // Handle unknown errors
  return handleUnknownError(error, event);
}

function handleAppError(error: AppError, event: H3Event): ErrorResponse {
  // Set status code
  event.node.res.statusCode = error.statusCode;

  // Log operational vs non-operational errors differently
  if (error.isOperational) {
    logger.warn('Operational error:', {
      code: error.code,
      message: error.message,
      metadata: error.metadata,
    });
  } else {
    logger.error('Non-operational error:', error);
  }

  return {
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      metadata: error.metadata,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  };
}

function handleH3Error(error: H3Error, event: H3Event): ErrorResponse {
  const statusCode = error.statusCode || 500;
  event.node.res.statusCode = statusCode;

  return {
    error: {
      message: error.statusMessage || 'An error occurred',
      code: 'H3_ERROR',
      statusCode,
      metadata: error.data,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  };
}

function handleGenericError(error: Error, event: H3Event): ErrorResponse {
  event.node.res.statusCode = 500;

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : error.message;

  return {
    error: {
      message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
  };
}

function handleUnknownError(error: unknown, event: H3Event): ErrorResponse {
  event.node.res.statusCode = 500;

  logger.error('Unknown error type:', error);

  return {
    error: {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    },
  };
}

function isH3Error(error: unknown): error is H3Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'statusMessage' in error
  );
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T = any>(
  handler: (event: H3Event) => Promise<T>
): (event: H3Event) => Promise<T> {
  return async (event: H3Event) => {
    try {
      return await handler(event);
    } catch (error) {
      const response = errorHandler(error, event);
      if (response) {
        return response as T;
      }
      throw error;
    }
  };
}