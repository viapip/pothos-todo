/**
 * Branded types for enhanced type safety
 */

declare const __brand: unique symbol;

/**
 * Base branded type
 */
type Brand<T, TBrand> = T & { readonly [__brand]: TBrand };

/**
 * Entity ID types
 */
export type UserId = Brand<string, 'UserId'>;
export type TodoId = Brand<string, 'TodoId'>;
export type TodoListId = Brand<string, 'TodoListId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type DomainEventId = Brand<string, 'DomainEventId'>;

/**
 * URL types
 */
export type DatabaseURL = Brand<string, 'DatabaseURL'>;
export type RedisURL = Brand<string, 'RedisURL'>;
export type HttpURL = Brand<string, 'HttpURL'>;
export type HttpsURL = Brand<string, 'HttpsURL'>;

/**
 * Email type
 */
export type Email = Brand<string, 'Email'>;

/**
 * Password types
 */
export type PlainTextPassword = Brand<string, 'PlainTextPassword'>;
export type HashedPassword = Brand<string, 'HashedPassword'>;

/**
 * Token types
 */
export type SessionToken = Brand<string, 'SessionToken'>;
export type RefreshToken = Brand<string, 'RefreshToken'>;
export type CSRFToken = Brand<string, 'CSRFToken'>;

/**
 * Timestamp types
 */
export type UnixTimestamp = Brand<number, 'UnixTimestamp'>;
export type ISOTimestamp = Brand<string, 'ISOTimestamp'>;

/**
 * Utility functions for creating branded types
 */
export const BrandedTypes = {
  /**
   * Create a UserId from string
   */
  userId: (id: string): UserId => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid user ID');
    }
    return id as UserId;
  },

  /**
   * Create a TodoId from string
   */
  todoId: (id: string): TodoId => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo ID');
    }
    return id as TodoId;
  },

  /**
   * Create a TodoListId from string
   */
  todoListId: (id: string): TodoListId => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid todo list ID');
    }
    return id as TodoListId;
  },

  /**
   * Create a SessionId from string
   */
  sessionId: (id: string): SessionId => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid session ID');
    }
    return id as SessionId;
  },

  /**
   * Create an Email from string with validation
   */
  email: (email: string): Email => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    return email.toLowerCase() as Email;
  },

  /**
   * Create a DatabaseURL with validation
   */
  databaseUrl: (url: string): DatabaseURL => {
    if (!url || !url.startsWith('postgresql://') && !url.startsWith('mysql://')) {
      throw new Error('Invalid database URL format');
    }
    return url as DatabaseURL;
  },

  /**
   * Create a RedisURL with validation
   */
  redisUrl: (url: string): RedisURL => {
    if (!url || !url.startsWith('redis://') && !url.startsWith('rediss://')) {
      throw new Error('Invalid Redis URL format');
    }
    return url as RedisURL;
  },

  /**
   * Create an HttpsURL with validation
   */
  httpsUrl: (url: string): HttpsURL => {
    if (!url || !url.startsWith('https://')) {
      throw new Error('Invalid HTTPS URL format');
    }
    return url as HttpsURL;
  },

  /**
   * Create a PlainTextPassword
   */
  plainPassword: (password: string): PlainTextPassword => {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    return password as PlainTextPassword;
  },

  /**
   * Create a HashedPassword
   */
  hashedPassword: (hash: string): HashedPassword => {
    if (!hash || hash.length < 20) {
      throw new Error('Invalid password hash');
    }
    return hash as HashedPassword;
  },

  /**
   * Create a SessionToken
   */
  sessionToken: (token: string): SessionToken => {
    if (!token || token.length < 32) {
      throw new Error('Invalid session token');
    }
    return token as SessionToken;
  },

  /**
   * Create a CSRFToken
   */
  csrfToken: (token: string): CSRFToken => {
    if (!token || token.length < 16) {
      throw new Error('Invalid CSRF token');
    }
    return token as CSRFToken;
  },

  /**
   * Create a UnixTimestamp
   */
  unixTimestamp: (timestamp: number): UnixTimestamp => {
    if (!Number.isInteger(timestamp) || timestamp < 0) {
      throw new Error('Invalid unix timestamp');
    }
    return timestamp as UnixTimestamp;
  },

  /**
   * Create an ISOTimestamp
   */
  isoTimestamp: (timestamp: string): ISOTimestamp => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid ISO timestamp');
    }
    return timestamp as ISOTimestamp;
  },
};

/**
 * Type guards for branded types
 */
export const TypeGuards = {
  /**
   * Check if a string is a valid email format
   */
  isEmail: (value: unknown): value is Email => {
    if (typeof value !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(value);
  },

  /**
   * Check if a string is a valid UUID format (for IDs)
   */
  isUUID: (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  /**
   * Check if a string is a valid URL
   */
  isUrl: (value: unknown): value is HttpURL | HttpsURL => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  },

  /**
   * Check if a string is a valid HTTPS URL
   */
  isHttpsUrl: (value: unknown): value is HttpsURL => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  },
};

/**
 * Utility type to extract the base type from a branded type
 */
export type UnBrand<T> = T extends Brand<infer U, any> ? U : never;

/**
 * Template literal types for better compile-time validation
 */
export type PostgresURL = `postgresql://${string}:${string}@${string}:${number}/${string}`;
export type RedisConnectionString = `redis://${string}:${number}`;
export type HttpUrlPattern = `http://${string}`;
export type HttpsUrlPattern = `https://${string}`;

/**
 * Environment variable branded types
 */
export type EnvVar<T extends string> = Brand<string, `EnvVar<${T}>`>;
export type DatabaseEnvVar = EnvVar<'DATABASE_URL'>;
export type RedisEnvVar = EnvVar<'REDIS_URL'>;
export type SessionSecretEnvVar = EnvVar<'SESSION_SECRET'>;

/**
 * Configuration helper with branded types
 */
export const Config = {
  /**
   * Get environment variable with type safety
   */
  getEnvVar: <T extends string>(key: T): EnvVar<T> | null => {
    const value = process.env[key];
    return value ? (value as EnvVar<T>) : null;
  },

  /**
   * Get required environment variable with type safety
   */
  requireEnvVar: <T extends string>(key: T): EnvVar<T> => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value as EnvVar<T>;
  },
};

/**
 * Example usage of branded types in function signatures
 */
export interface UserService {
  findById(id: UserId): Promise<any>;
  findByEmail(email: Email): Promise<any>;
  createUser(email: Email, password: PlainTextPassword): Promise<UserId>;
  updatePassword(id: UserId, oldPassword: PlainTextPassword, newPassword: PlainTextPassword): Promise<void>;
}

export interface SessionService {
  create(userId: UserId): Promise<SessionToken>;
  validate(token: SessionToken): Promise<{ userId: UserId; sessionId: SessionId } | null>;
  revoke(sessionId: SessionId): Promise<void>;
  revokeAllForUser(userId: UserId): Promise<void>;
}

/**
 * Runtime validation utilities
 */
export const Validators = {
  /**
   * Validate and create branded type with error handling
   */
  createSafe: <T, B>(
    value: T,
    creator: (value: T) => Brand<T, B>
  ): { success: true; data: Brand<T, B> } | { success: false; error: string } => {
    try {
      const branded = creator(value);
      return { success: true, data: branded };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  },
};

/**
 * JSON serialization helpers for branded types
 */
export const Serialization = {
  /**
   * Serialize branded type to plain value for JSON
   */
  serialize: <T>(value: Brand<T, any>): T => {
    return value as T;
  },

  /**
   * Deserialize plain value to branded type with validation
   */
  deserialize: <T, B>(
    value: T,
    creator: (value: T) => Brand<T, B>
  ): Brand<T, B> => {
    return creator(value);
  },
};