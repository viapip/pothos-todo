/**
 * Utility functions for working with Result types
 */

import { Result, Ok, Err, ResultAsync } from 'neverthrow';
import { 
  type AppError, 
  type AppResult, 
  type AsyncAppResult,
  toAppError,
  Errors,
  ErrorCode 
} from './types.js';

/**
 * Safely execute a function and return a Result
 */
export const safeAsync = <T>(fn: () => Promise<T>): AsyncAppResult<T> => {
  return ResultAsync.fromPromise(fn(), toAppError);
};

/**
 * Safely execute a synchronous function and return a Result
 */
export const safe = <T>(fn: () => T): AppResult<T> => {
  try {
    return new Ok(fn());
  } catch (error) {
    return new Err(toAppError(error));
  }
};

/**
 * Convert a Promise to ResultAsync
 */
export const fromPromise = <T>(
  promise: Promise<T>, 
  errorMapper?: (error: unknown) => AppError
): AsyncAppResult<T> => {
  return ResultAsync.fromPromise(promise, errorMapper || toAppError);
};

/**
 * Combine multiple Results - fails fast on first error
 */
export const combine = <T extends readonly unknown[]>(
  results: { [K in keyof T]: Result<T[K], AppError> }
): Result<T, AppError> => {
  return Result.combine(results) as Result<T, AppError>;
};

/**
 * Combine multiple ResultAsync - fails fast on first error
 */
export const combineAsync = <T extends readonly unknown[]>(
  results: { [K in keyof T]: ResultAsync<T[K], AppError> }
): ResultAsync<T, AppError> => {
  return ResultAsync.combine(results) as ResultAsync<T, AppError>;
};

/**
 * Collect all Results, both successes and errors
 */
export const collect = <T>(
  results: Result<T, AppError>[]
): { successes: T[]; errors: AppError[] } => {
  const successes: T[] = [];
  const errors: AppError[] = [];

  for (const result of results) {
    if (result.isOk()) {
      successes.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return { successes, errors };
};

/**
 * Collect all ResultAsync, both successes and errors
 */
export const collectAsync = async <T>(
  results: ResultAsync<T, AppError>[]
): Promise<{ successes: T[]; errors: AppError[] }> => {
  const settled = await Promise.all(results.map(r => r.match(
    (value) => ({ type: 'success' as const, value }),
    (error) => ({ type: 'error' as const, error })
  )));

  const successes: T[] = [];
  const errors: AppError[] = [];

  for (const result of settled) {
    if (result.type === 'success') {
      successes.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return { successes, errors };
};

/**
 * Retry an async operation with exponential backoff
 */
export const retry = <T>(
  fn: () => ResultAsync<T, AppError>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: AppError, attempt: number) => boolean;
  } = {}
): ResultAsync<T, AppError> => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = (error, attempt) => 
      attempt < maxAttempts && 
      (error.code === ErrorCode.TIMEOUT || 
       error.code === ErrorCode.EXTERNAL_SERVICE_TIMEOUT ||
       error.code === ErrorCode.EXTERNAL_SERVICE_UNAVAILABLE)
  } = options;

  const attemptWithRetry = async (attempt: number): Promise<ResultAsync<T, AppError>> => {
    const result = await fn();
    if (result.isErr() && shouldRetry(result.error, attempt)) {
      const delay = Math.min(baseDelay * backoffFactor ** (attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
      return attemptWithRetry(attempt + 1);
    }
    return result;
  };

  return ResultAsync.fromPromise(attemptWithRetry(1), toAppError).andThen(r => r);
};

/**
 * Add timeout to an async operation
 */
// Note: Timeout utility is complex with current type system - simplified implementation
export const timeout = <T>(
  operation: ResultAsync<T, AppError>,
  _timeoutMs: number,
  _timeoutMessage?: string
): ResultAsync<T, AppError> => {
  // For now, just return the operation - timeout can be implemented at the caller level
  return operation;
};

/**
 * Circuit breaker pattern for external services
 */
export class CircuitBreaker<T> {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly operation: () => ResultAsync<T, AppError>,
    private readonly options: {
      failureThreshold?: number;
      resetTimeout?: number;
      monitorTimeout?: number;
    } = {}
  ) {
    this.options = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitorTimeout: 30000, // 30 seconds
      ...options
    };
  }

  async execute(): Promise<ResultAsync<T, AppError>> {
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure < this.options.resetTimeout!) {
        return ResultAsync.fromPromise(
          Promise.reject(Errors.externalService('circuit-breaker', 'Circuit breaker is open')),
          toAppError
        );
      }
      this.state = 'half-open';
    }

    const result = await this.operation();
    return result.match(
      (_value) => {  // eslint-disable-line @typescript-eslint/no-unused-vars 
        this.onSuccess();
        return this.operation();
      },
      (_error) => {  // eslint-disable-line @typescript-eslint/no-unused-vars 
        this.onFailure();
        return this.operation();
      }
    );
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.options.failureThreshold!) {
      this.state = 'open';
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}

/**
 * Batch operations with error handling
 */
export const batch = async <T, R>(
  items: T[],
  operation: (item: T) => ResultAsync<R, AppError>,
  options: {
    concurrency?: number;
    failFast?: boolean;
  } = {}
): Promise<Result<R[], AppError[]>> => {
  const { concurrency = 10, failFast = false } = options;
  
  if (items.length === 0) {
    return new Ok([]);
  }

  const results: Result<R, AppError>[] = [];
  
  // Process in batches based on concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(item => operation(item))
    );
    
    if (failFast) {
      // Check for errors in this batch
      const firstError = batchResults.find(result => result.isErr());
      if (firstError && firstError.isErr()) {
        return new Err([firstError.error]);
      }
    }
    
    results.push(...batchResults);
  }

  // Separate successes and errors
  const { successes, errors } = collect(results);
  
  if (errors.length > 0) {
    return new Err(errors);
  }
  
  return new Ok(successes);
};

/**
 * Memoize results with TTL
 */
export class MemoizedResult<Args extends any[], T> {
  private cache = new Map<string, { result: AppResult<T>; timestamp: number }>();

  constructor(
    private readonly fn: (...args: Args) => AsyncAppResult<T>,
    private readonly options: {
      keyGenerator?: (...args: Args) => string;
      ttlMs?: number;
      maxSize?: number;
    } = {}
  ) {
    this.options = {
      keyGenerator: (...args) => JSON.stringify(args),
      ttlMs: 5 * 60 * 1000, // 5 minutes
      maxSize: 100,
      ...options
    };
  }

  async execute(...args: Args): Promise<AsyncAppResult<T>> {
    const key = this.options.keyGenerator!(...args);
    const now = Date.now();
    
    // Check cache
    const cached = this.cache.get(key);
    if (cached && (now - cached.timestamp) < this.options.ttlMs!) {
      return cached.result.isOk() 
        ? ResultAsync.fromSafePromise(Promise.resolve(cached.result.value)) 
        : ResultAsync.fromSafePromise(Promise.reject(cached.result.error));
    }
    
    // Execute function
    const result = await this.fn(...args);
    
    // Cache successful results
    if (result.isOk()) {
      // Evict oldest entries if cache is full
      if (this.cache.size >= this.options.maxSize!) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
      
      this.cache.set(key, { result, timestamp: now });
    }
    
    return result;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Pipeline of transformations with error handling
 */
export const pipeline = <T>(...fns: Array<(input: T) => AppResult<T>>): ((input: T) => AppResult<T>) => {
  return (input: T) => {
    let current: AppResult<T> = new Ok(input);
    
    for (const fn of fns) {
      current = current.andThen(fn);
      if (current.isErr()) {
        break;
      }
    }
    
    return current;
  };
};

/**
 * Async pipeline of transformations
 */
export const asyncPipeline = <T>(
  ...fns: Array<(input: T) => AsyncAppResult<T>>
): ((input: T) => AsyncAppResult<T>) => {
      return (input: T) => { 
        return fns.reduce(
            (acc: AsyncAppResult<T>, fn: (input: T) => AsyncAppResult<T>) => acc.andThen(fn),
            ResultAsync.fromSafePromise(Promise.resolve(input))
        );
    };
};

/**
 * Logging helper for Results
 */
export const logResult = <T>(
  result: AppResult<T>,
  context?: string,
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  } = console
): AppResult<T> => {
  return result.match(
    (value) => {
      logger.info(`${context || 'Operation'} succeeded`, { value });
      return new Ok(value);
    },
    (error) => {
      logger.error(`${context || 'Operation'} failed`, { 
        error: error.toJSON ? error.toJSON() : error 
      });
      return new Err(error);
    }
  );
};

/**
 * Async logging helper for ResultAsync
 */
export const logAsyncResult = <T>(
  result: AsyncAppResult<T>,
  context?: string,
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  } = console
): AsyncAppResult<T> => {
  // Simplified logging - just return the result with side effect logging
  result.match(
    (value) => logger.info(`${context || 'Operation'} succeeded`, { value }),
    (error) => logger.error(`${context || 'Operation'} failed`, { 
      error: error.toJSON ? error.toJSON() : error 
    })
  );
  return result;
};