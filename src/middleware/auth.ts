/**
 * Modern Authentication Middleware with Result Types
 * 
 * Features:
 * - Result-based error handling for type safety
 * - Comprehensive CSRF protection
 * - Rate limiting for authentication attempts  
 * - Secure session management with H3
 * - Input validation and sanitization
 * - Request origin validation
 * - Security headers enforcement
 * - Audit logging for security events
 */

import type { H3Event } from 'h3';
import { getHeader, setHeader } from 'h3';
import type { Context } from '../api/schema/builder.js';
import type { Container } from '../infrastructure/container/Container.js';
import { User } from '../domain/aggregates/User.js';
import type { User as PrismaUser } from '@prisma/client';
import { 
  getCurrentSessionFromEventH3, 
  type SessionWithUser, 
  clearH3Session,
  updateH3SessionActivity
} from '../lib/auth/index.js';
import { 
  type AppResult, 
  Ok, 
  Err, 
  Errors,
  toAppError 
} from '../lib/result/index.js';

// Simple security configuration
interface SecurityConfig {
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Convert Prisma User to Domain User
 */
function toDomainUser(prismaUser: PrismaUser): User {
  return new User(
    prismaUser.id,
    prismaUser.email,
    prismaUser.name,
    prismaUser.createdAt,
    prismaUser.updatedAt
  );
}

/**
 * Enhanced authentication context with security metadata
 */
export interface AuthContext {
  user: User | null;
  session: SessionWithUser | null;
  isAuthenticated: boolean;
  sessionAge: number;
  lastActivity: Date;
  securityFlags: {
    isSecureConnection: boolean;
    hasValidOrigin: boolean;
    passedCSRF: boolean;
    isWithinRateLimit: boolean;
  };
}

/**
 * Simple rate limiting store for authentication attempts
 */
class AuthRateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  
  private getClientKey(event: H3Event): string {
    const ip = getClientIP(event);
    const userAgent = getHeader(event, 'user-agent') || '';
    return `${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  }
  
  checkRateLimit(event: H3Event): AppResult<boolean> {
    try {
      const key = this.getClientKey(event);
      const now = Date.now();
      const attempt = this.attempts.get(key);
      
      if (!attempt) {
        this.attempts.set(key, { count: 1, resetTime: now + DEFAULT_SECURITY_CONFIG.lockoutDuration });
        return new Ok(true);
      }
      
      if (now > attempt.resetTime) {
        this.attempts.set(key, { count: 1, resetTime: now + DEFAULT_SECURITY_CONFIG.lockoutDuration });
        return new Ok(true);
      }
      
      if (attempt.count >= DEFAULT_SECURITY_CONFIG.maxLoginAttempts) {
        return new Err(Errors.forbidden('Too many authentication attempts'));
      }
      
      attempt.count++;
      return new Ok(true);
    } catch (error) {
      return new Err(toAppError(error));
    }
  }
  
  recordFailedAttempt(event: H3Event): void {
    const key = this.getClientKey(event);
    const attempt = this.attempts.get(key);
    if (attempt) {
      attempt.count++;
    }
  }
  
  clearAttempts(event: H3Event): void {
    const key = this.getClientKey(event);
    this.attempts.delete(key);
  }
}

const authRateLimiter = new AuthRateLimiter();

/**
 * Extract client IP address with proxy support
 */
function getClientIP(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-for');
  const realIP = getHeader(event, 'x-real-ip');
  const remoteAddress = event.node.req.socket?.remoteAddress;
  
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  
  return (typeof realIP === 'string' ? realIP : '') || 
         (typeof remoteAddress === 'string' ? remoteAddress : '') || 
         'unknown';
}

/**
 * Advanced CSRF protection with multiple validation layers
 */
export function validateCSRF(event: H3Event): AppResult<boolean> {
  try {
    const method = event.method?.toUpperCase();
    const origin = getHeader(event, 'origin');
    const host = getHeader(event, 'host');
    const referer = getHeader(event, 'referer');
    
    // Allow safe methods
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return new Ok(true);
    }
    
    // For state-changing methods, validate origin
    if (!origin && !referer) {
      console.warn('CSRF validation failed: Missing origin and referer headers', { method });
      return new Err(Errors.forbidden('Missing origin validation headers'));
    }
    
    // Validate origin against host
    if (origin && host) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        console.warn('CSRF validation failed: Invalid origin URL', { origin });
        return new Err(Errors.forbidden('Invalid origin URL format'));
      }
      
      if (originHost !== host) {
        console.warn('CSRF validation failed: Origin mismatch', { 
          originHost, 
          host,
          method,
        });
        return new Err(Errors.forbidden('Origin header does not match host'));
      }
    }
    
    // Validate referer as fallback
    if (!origin && referer) {
      let refererHost: string;
      try {
        refererHost = new URL(referer).host;
      } catch {
        console.warn('CSRF validation failed: Invalid referer URL', { referer });
        return new Err(Errors.forbidden('Invalid referer URL format'));
      }
      
      if (refererHost !== host) {
        console.warn('CSRF validation failed: Referer mismatch', { 
          refererHost, 
          host,
          method,
        });
        return new Err(Errors.forbidden('Referer header does not match host'));
      }
    }
    
    console.debug('CSRF validation passed', { method, origin, host });
    return new Ok(true);
  } catch (error) {
    console.error('CSRF validation error', { error });
    return new Err(toAppError(error));
  }
}

/**
 * Validate request origin (simplified version)
 */
export function validateOrigin(event: H3Event): AppResult<boolean> {
  try {
    const origin = getHeader(event, 'origin');
    
    // No origin validation needed for same-origin requests
    if (!origin) {
      return new Ok(true);
    }
    
    // Parse origin URL
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return new Err(Errors.forbidden('Invalid origin URL format'));
    }
    
    // Allow localhost in development
    const isLocalhost = originUrl.hostname === 'localhost' || 
                        originUrl.hostname === '127.0.0.1' ||
                        originUrl.hostname === '0.0.0.0';
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isLocalhost && isDev) {
      return new Ok(true);
    }
    
    // In production, require HTTPS
    if (process.env.NODE_ENV === 'production' && originUrl.protocol !== 'https:') {
      return new Err(Errors.forbidden('HTTPS required in production'));
    }
    
    return new Ok(true);
  } catch (error) {
    return new Err(toAppError(error));
  }
}

/**
 * Enhanced session validation with security checks
 */
export async function validateSession(event: H3Event): Promise<AppResult<AuthContext>> {
  try {
    // Check rate limiting
    const rateLimitResult = authRateLimiter.checkRateLimit(event);
    if (rateLimitResult.isErr()) {
      return new Err(rateLimitResult.error);
    }
    
    // Get session data
    const sessionData: SessionWithUser | null = await getCurrentSessionFromEventH3(event);
    
    const securityFlags = {
      isSecureConnection: event.node.req.headers['x-forwarded-proto'] === 'https' || 
                          (event.node.req.connection as any)?.encrypted === true,
      hasValidOrigin: validateOrigin(event).isOk(),
      passedCSRF: validateCSRF(event).isOk(),
      isWithinRateLimit: rateLimitResult.isOk(),
    };
    
    if (!sessionData) {
      return new Ok({
        user: null,
        session: null,
        isAuthenticated: false,
        sessionAge: 0,
        lastActivity: new Date(),
        securityFlags,
      });
    }
    
    // Validate session age
    const sessionAge = Date.now() - (sessionData.session.createdAt?.getTime() || 0);
    const maxAge = DEFAULT_SECURITY_CONFIG.sessionTimeout;
    
    if (sessionAge > maxAge) {
      console.info('Session expired due to age', {
        userId: sessionData.user.id,
        sessionAge: sessionAge / 1000 / 60, // minutes
        maxAge: maxAge / 1000 / 60, // minutes
      });
      
      // Clear expired session
      await clearH3Session(event);
      
      return new Err(Errors.unauthorized('Session has expired'));
    }
    
    // Update session activity
    await updateH3SessionActivity(event);
    
    // Clear failed attempts on successful authentication
    authRateLimiter.clearAttempts(event);
    
    return new Ok({
      user: toDomainUser(sessionData.user),
      session: sessionData,
      isAuthenticated: true,
      sessionAge,
      lastActivity: new Date(sessionData.session.createdAt),
      securityFlags,
    });
  } catch (error) {
    console.error('Unexpected error in session validation', { error });
    return new Err(toAppError(error));
  }
}

/**
 * Apply essential security headers to response
 */
export function applySecurityHeaders(event: H3Event): void {
  // Content Security Policy
  setHeader(event, 'Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  
  // Security headers
  setHeader(event, 'X-Frame-Options', 'DENY');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  setHeader(event, 'X-XSS-Protection', '1; mode=block');
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HSTS in production
  if (process.env.NODE_ENV === 'production') {
    setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  // Permissions Policy
  setHeader(event, 'Permissions-Policy', 
    'geolocation=(), microphone=(), camera=()');
}

/**
 * Modern authentication middleware with Result types
 */
export async function authMiddleware(event: H3Event): Promise<AppResult<Partial<Context>>> {
  const startTime = Date.now();
  
  try {
    // Apply security headers
    applySecurityHeaders(event);
    
    // Validate CSRF
    const csrfResult = validateCSRF(event);
    if (csrfResult.isErr()) {
      console.warn('CSRF validation failed in auth middleware', {
        error: csrfResult.error,
        ip: getClientIP(event),
        userAgent: getHeader(event, 'user-agent'),
      });
      return new Err(csrfResult.error);
    }
    
    // Validate origin
    const originResult = validateOrigin(event);
    if (originResult.isErr()) {
      return new Err(originResult.error);
    }
    
    // Validate session
    const authResult = await validateSession(event);
    if (authResult.isErr()) {
      // Record failed attempt for rate limiting
      authRateLimiter.recordFailedAttempt(event);
      return new Err(authResult.error);
    }
    
    const authContext = authResult.value;
    
    // Log authentication event
    console.info('Authentication middleware processed request', {
      authenticated: authContext.isAuthenticated,
      userId: authContext.user?.id,
      sessionAge: authContext.sessionAge,
      processingTime: Date.now() - startTime,
      securityFlags: authContext.securityFlags,
      ip: getClientIP(event),
    });
    
    return new Ok({
      user: authContext.user,
      session: authContext.session,
      h3Event: event,
    });
  } catch (error) {
    console.error('Unexpected error in auth middleware', { 
      error,
      processingTime: Date.now() - startTime,
      ip: getClientIP(event),
    });
    
    return new Err(toAppError(error));
  }
}

/**
 * Enhanced H3-compatible context factory for GraphQL Yoga
 */
export function createH3GraphQLContext(container: Container) {
  return async (event: H3Event): Promise<Context> => {
    const authResult = await authMiddleware(event);
    
    if (authResult.isErr()) {
      console.warn('Authentication failed, providing empty context', {
        error: authResult.error,
        ip: getClientIP(event),
      });
      
      // Return empty auth context but don't block the request
      // This allows public queries to work while protecting authenticated ones
      return {
        user: null,
        session: null,
        container,
        h3Event: event,
      };
    }
    
    const authContext = authResult.value;
    
    return {
      ...authContext,
      container,
    } as Context;
  };
}

/**
 * Modern GraphQL Yoga plugin for H3 authentication with Result types
 */
export const h3AuthPlugin = {
  onRequest: async (event: H3Event, context: Context) => {
    const authResult = await authMiddleware(event);
    
    if (authResult.isErr()) {
      // For critical security errors, block the request
      if (authResult.error.code === 'FORBIDDEN' || 
          authResult.error.code === 'UNAUTHORIZED') {
        throw new Error(authResult.error.message);
      }
      
      // For auth errors, allow request but log warning
      console.warn('Auth plugin: Authentication failed', {
        error: authResult.error,
        ip: getClientIP(event),
      });
      
      Object.assign(context, {
        user: null,
        session: null,
        h3Event: event,
      });
      return;
    }
    
    // Success - merge auth context
    Object.assign(context, authResult.value);
  },
};

/**
 * Utility function to check if user has specific permissions
 */
export function hasPermission(context: Context, permission: string): boolean {
  if (!context.user) return false;
  
  // Basic role-based check - extend as needed
  switch (permission) {
    case 'admin':
      // Add admin check logic here based on user roles/permissions
      return false; // Placeholder - implement based on your user model
    case 'authenticated':
      return !!context.user;
    default:
      return false;
  }
}

/**
 * Enhanced CSRF middleware that can be used independently
 */
export function csrfMiddleware(event: H3Event): boolean {
  const result = validateCSRF(event);
  return result.isOk();
}

/**
 * Deprecated legacy functions for backwards compatibility
 */

/** @deprecated Use authMiddleware with Result types instead */
export function createGraphQLContext(container: Container) {
  console.warn('createGraphQLContext is deprecated, use createH3GraphQLContext instead');
  
  return async ({ request: _request }: { request: Request }): Promise<Context> => {
    return {
      user: null,
      session: null,
      container,
    };
  };
}

/** @deprecated Use h3AuthPlugin instead */
export const luciaAuthPlugin = {
  onRequest: async (_request: Request, context: Context) => {
    console.warn('luciaAuthPlugin is deprecated, use h3AuthPlugin instead');
    
    Object.assign(context, {
      user: null,
      session: null,
    });
  },
};