/**
 * Security headers and middleware
 */

import type { H3Event } from 'h3';
import { setHeaders } from 'h3';
import { isProduction, getServerConfig } from '../../config/index.js';

/**
 * Security headers configuration
 */
export interface SecurityConfig {
  contentSecurityPolicy?: {
    directives?: Record<string, string[]>;
    reportOnly?: boolean;
  };
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  cors?: {
    origin?: string | string[] | boolean;
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
  };
  rateLimit?: {
    windowMs?: number;
    max?: number;
    message?: string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
  };
}

/**
 * Default security configuration
 */
const getDefaultSecurityConfig = (): SecurityConfig => {
  const serverConfig = getServerConfig();
  const isProduction_ = isProduction();
  
  return {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // GraphQL Playground needs these
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "https:"],
        'font-src': ["'self'", "https:", "data:"],
        'connect-src': ["'self'", "https:", "wss:", "ws:"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        ...(isProduction_ ? { 'upgrade-insecure-requests': [] } : {}),
      },
      reportOnly: !isProduction_,
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    cors: {
      origin: serverConfig.cors?.origin || false,
      credentials: serverConfig.cors?.credentials || true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-Apollo-Tracing',
        'x-apollo-tracing',
      ],
      exposedHeaders: ['X-RateLimit-Remaining', 'X-RateLimit-Limit', 'X-RateLimit-Reset'],
      maxAge: 86400, // 24 hours
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    },
  };
};

/**
 * Apply security headers to H3 response
 */
export const applySecurityHeaders = (
  event: H3Event,
  config: SecurityConfig = getDefaultSecurityConfig()
): void => {
  const isProduction_ = isProduction();
  
  // Basic security headers
  const headers: Record<string, string> = {
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',
    
    // Prevent embedding in frames
    'X-Frame-Options': 'DENY',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions policy (feature policy)
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    
    // Remove server information
    'X-Powered-By': 'Pothos GraphQL',
  };

  // HSTS (only in production with HTTPS)
  if (isProduction_ && config.hsts) {
    const { maxAge, includeSubDomains, preload } = config.hsts;
    let hstsValue = `max-age=${maxAge || 31536000}`;
    
    if (includeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    
    if (preload) {
      hstsValue += '; preload';
    }
    
    headers['Strict-Transport-Security'] = hstsValue;
  }

  // Content Security Policy
  if (config.contentSecurityPolicy) {
    const { directives, reportOnly } = config.contentSecurityPolicy;
    
    if (directives) {
      const cspValue = Object.entries(directives)
        .filter(([, values]) => values !== undefined)
        .map(([directive, values]) => `${directive} ${values.join(' ')}`)
        .join('; ');
      
      const cspHeader = reportOnly 
        ? 'Content-Security-Policy-Report-Only' 
        : 'Content-Security-Policy';
      
      headers[cspHeader] = cspValue;
    }
  }

  // CORS headers
  if (config.cors) {
    const { origin, credentials, methods, allowedHeaders, exposedHeaders, maxAge } = config.cors;
    const requestOrigin = event.node.req.headers.origin;
    
    // Handle origin
    if (origin === true) {
      headers['Access-Control-Allow-Origin'] = requestOrigin || '*';
      headers['Vary'] = 'Origin';
    } else if (origin === false) {
      // No CORS
    } else if (typeof origin === 'string') {
      headers['Access-Control-Allow-Origin'] = origin;
    } else if (Array.isArray(origin) && requestOrigin) {
      if (origin.includes(requestOrigin)) {
        headers['Access-Control-Allow-Origin'] = requestOrigin;
        headers['Vary'] = 'Origin';
      }
    }
    
    if (credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    
    if (methods) {
      headers['Access-Control-Allow-Methods'] = methods.join(', ');
    }
    
    if (allowedHeaders) {
      headers['Access-Control-Allow-Headers'] = allowedHeaders.join(', ');
    }
    
    if (exposedHeaders) {
      headers['Access-Control-Expose-Headers'] = exposedHeaders.join(', ');
    }
    
    if (maxAge) {
      headers['Access-Control-Max-Age'] = maxAge.toString();
    }
  }

  // Apply headers
  setHeaders(event, headers);
};

/**
 * Create security middleware for H3
 */
export const createSecurityMiddleware = (config?: SecurityConfig) => {
  return (event: H3Event) => {
    applySecurityHeaders(event, config);
  };
};

/**
 * Rate limiting implementation
 */
export class RateLimit {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private config: Required<SecurityConfig['rateLimit']>;

  constructor(config: SecurityConfig['rateLimit'] = {}) {
    this.config = {
      windowMs: config.windowMs || 15 * 60 * 1000,
      max: config.max || 100,
      message: config.message || 'Too many requests from this IP, please try again later.',
      standardHeaders: config.standardHeaders !== false,
      legacyHeaders: config.legacyHeaders !== false,
    };
  }

  /**
   * Check if request should be rate limited
   */
  checkLimit(event: H3Event): { allowed: boolean; remaining: number; resetTime: number } {
    const ip = this.getClientIP(event);
    const now = Date.now();
    const windowStart = now - this.config!.windowMs;

    // Clean old entries
    this.cleanup(windowStart);

    // Get current request data
    const current = this.requests.get(ip);
    
    if (!current || current.resetTime <= now) {
      // New window
      const resetTime = now + this.config!.windowMs;
      this.requests.set(ip, { count: 1, resetTime });
      
      return {
        allowed: true,
        remaining: this.config!.max - 1,
        resetTime,
      };
    }

    // Existing window
    if (current!.count >= this.config!.max) {
      // Rate limited
      return {
        allowed: false,
        remaining: 0,
        resetTime: current!.resetTime,
      };
    }

    // Update count
    current!.count++;
    
    return {
      allowed: true,
      remaining: this.config!.max - current!.count,
      resetTime: current!.resetTime,
    };
  }

  /**
   * Apply rate limiting to request
   */
  apply(event: H3Event): boolean {
    const { allowed, remaining, resetTime } = this.checkLimit(event);

    // Set rate limit headers
    if (this.config!.standardHeaders) {
      setHeaders(event, {
        'RateLimit-Limit': this.config!.max.toString(),
        'RateLimit-Remaining': remaining.toString(),
        'RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
      });
    }

    if (this.config!.legacyHeaders) {
      setHeaders(event, {
        'X-RateLimit-Limit': this.config!.max.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
      });
    }

    return allowed;
  }

  /**
   * Get client IP address
   */
  private getClientIP(event: H3Event): string {
    const forwarded = event.node.req.headers['x-forwarded-for'];
    const realIP = event.node.req.headers['x-real-ip'];
    const remoteAddress = event.node.req.connection?.remoteAddress || 
                         event.node.req.socket?.remoteAddress;

    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    
    if (typeof realIP === 'string' && realIP.length > 0) {
      return realIP;
    }
    
    return remoteAddress || 'unknown';
  }

  /**
   * Clean up old entries
   */
  private cleanup(cutoff: number): void {
    for (const [ip, data] of this.requests.entries()) {
      if (data.resetTime <= cutoff) {
        this.requests.delete(ip);
      }
    }
  }

  /**
   * Get rate limit stats
   */
  getStats(): { totalIPs: number; activeRequests: number } {
    const now = Date.now();
    let activeRequests = 0;
    
    for (const data of this.requests.values()) {
      if (data.resetTime > now) {
        activeRequests += data.count;
      }
    }

    return {
      totalIPs: this.requests.size,
      activeRequests,
    };
  }

  /**
   * Reset all rate limits
   */
  reset(): void {
    this.requests.clear();
  }
}

/**
 * Create rate limiting middleware
 */
export const createRateLimitMiddleware = (config?: SecurityConfig['rateLimit']) => {
  const rateLimit = new RateLimit(config);
  
  return (event: H3Event) => {
    const allowed = rateLimit.apply(event);
    
    if (!allowed) {
      throw new Error('Rate limit exceeded');
    }
  };
};

/**
 * CSRF protection
 */
export class CSRFProtection {
  private tokens = new Map<string, { token: string; expires: number }>();
  private tokenExpiry = 60 * 60 * 1000; // 1 hour

  /**
   * Generate CSRF token
   */
  generateToken(sessionId: string): string {
    const token = this.randomToken();
    const expires = Date.now() + this.tokenExpiry;
    
    this.tokens.set(sessionId, { token, expires });
    
    return token;
  }

  /**
   * Verify CSRF token
   */
  verifyToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    
    if (!stored || stored.expires < Date.now()) {
      this.tokens.delete(sessionId);
      return false;
    }
    
    return stored.token === token;
  }

  /**
   * Get CSRF token for session
   */
  getToken(sessionId: string): string | null {
    const stored = this.tokens.get(sessionId);
    
    if (!stored || stored.expires < Date.now()) {
      this.tokens.delete(sessionId);
      return null;
    }
    
    return stored.token;
  }

  /**
   * Remove CSRF token
   */
  removeToken(sessionId: string): void {
    this.tokens.delete(sessionId);
  }

  /**
   * Generate random token
   */
  private randomToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Global instances
 */
export const globalRateLimit = new RateLimit();
export const globalCSRFProtection = new CSRFProtection();

/**
 * Security middleware factory
 */
export const createFullSecurityMiddleware = (config?: SecurityConfig) => {
  const securityMiddleware = createSecurityMiddleware(config);
  const rateLimitMiddleware = createRateLimitMiddleware(config?.rateLimit);
  
  return (event: H3Event) => {
    // Apply security headers
    securityMiddleware(event);
    
    // Apply rate limiting (skip for OPTIONS requests)
    if (event.node.req.method !== 'OPTIONS') {
      rateLimitMiddleware(event);
    }
  };
};