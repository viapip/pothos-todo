/**
 * Advanced security utilities and middleware
 */

import type { H3Event } from 'h3';
import { getHeader, setHeader } from 'h3';
import { createHash, randomBytes } from 'node:crypto';
import { type AppResult, Ok, Err, Errors } from '../result/index.js';

/**
 * Content Security Policy builder
 */
export class CSPBuilder {
  private directives: Map<string, string[]> = new Map();

  defaultSrc(sources: string[]): this {
    this.directives.set('default-src', sources);
    return this;
  }

  scriptSrc(sources: string[]): this {
    this.directives.set('script-src', sources);
    return this;
  }

  styleSrc(sources: string[]): this {
    this.directives.set('style-src', sources);
    return this;
  }

  imgSrc(sources: string[]): this {
    this.directives.set('img-src', sources);
    return this;
  }

  connectSrc(sources: string[]): this {
    this.directives.set('connect-src', sources);
    return this;
  }

  fontSrc(sources: string[]): this {
    this.directives.set('font-src', sources);
    return this;
  }

  objectSrc(sources: string[]): this {
    this.directives.set('object-src', sources);
    return this;
  }

  mediaSrc(sources: string[]): this {
    this.directives.set('media-src', sources);
    return this;
  }

  frameSrc(sources: string[]): this {
    this.directives.set('frame-src', sources);
    return this;
  }

  formAction(sources: string[]): this {
    this.directives.set('form-action', sources);
    return this;
  }

  upgradeInsecureRequests(): this {
    this.directives.set('upgrade-insecure-requests', []);
    return this;
  }

  blockAllMixedContent(): this {
    this.directives.set('block-all-mixed-content', []);
    return this;
  }

  build(): string {
    const parts: string[] = [];
    
    for (const [directive, sources] of this.directives) {
      if (sources.length === 0) {
        parts.push(directive);
      } else {
        parts.push(`${directive} ${sources.join(' ')}`);
      }
    }
    
    return parts.join('; ');
  }

  /**
   * Get a secure default CSP for GraphQL APIs
   */
  static graphqlDefault(): CSPBuilder {
    return new CSPBuilder()
      .defaultSrc(["'self'"])
      .scriptSrc(["'self'", "'unsafe-inline'", "'unsafe-eval'"]) // GraphQL Playground needs these
      .styleSrc(["'self'", "'unsafe-inline'"])
      .imgSrc(["'self'", "data:", "https:"])
      .connectSrc(["'self'"])
      .fontSrc(["'self'"])
      .objectSrc(["'none'"])
      .frameSrc(["'none'"])
      .formAction(["'self'"])
      .upgradeInsecureRequests();
  }

  /**
   * Get a strict CSP for production APIs
   */
  static strict(): CSPBuilder {
    return new CSPBuilder()
      .defaultSrc(["'none'"])
      .scriptSrc(["'none'"])
      .styleSrc(["'none'"])
      .imgSrc(["'none'"])
      .connectSrc(["'self'"])
      .fontSrc(["'none'"])
      .objectSrc(["'none'"])
      .frameSrc(["'none'"])
      .formAction(["'none'"]);
  }
}

/**
 * Generate secure random nonce for CSP
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Calculate SHA256 hash for CSP
 */
export function calculateSHA256(content: string): string {
  return createHash('sha256').update(content).digest('base64');
}

/**
 * Enhanced security headers middleware
 */
export interface SecurityOptions {
  csp?: {
    enabled: boolean;
    policy?: string;
    nonce?: boolean;
    reportOnly?: boolean;
    reportUri?: string;
  };
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  nosniff?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM' | false;
  xssProtection?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false;
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false;
}

export const DEFAULT_SECURITY_OPTIONS: SecurityOptions = {
  csp: {
    enabled: true,
    policy: CSPBuilder.graphqlDefault().build(),
    nonce: false,
    reportOnly: false,
  },
  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  nosniff: true,
  frameOptions: 'DENY',
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
  crossOriginEmbedderPolicy: false, // Can break GraphQL introspection
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
};

/**
 * Apply comprehensive security headers
 */
export function applyAdvancedSecurityHeaders(
  event: H3Event,
  options: SecurityOptions = DEFAULT_SECURITY_OPTIONS
): AppResult<void> {
  try {
    const isHttps = getHeader(event, 'x-forwarded-proto') === 'https' || 
                   event.node.req.url?.startsWith('https:');

    // Content Security Policy
    if (options.csp?.enabled && options.csp.policy) {
      let policy = options.csp.policy;
      
      if (options.csp.nonce) {
        const nonce = generateNonce();
        event.context.cspNonce = nonce;
        policy = policy.replace(/'nonce'/g, `'nonce-${nonce}'`);
      }
      
      const headerName = options.csp.reportOnly ? 
        'Content-Security-Policy-Report-Only' : 
        'Content-Security-Policy';
      
      setHeader(event, headerName, policy);
    }

    // HTTP Strict Transport Security (HTTPS only)
    if (options.hsts?.enabled && isHttps) {
      const directives = [`max-age=${options.hsts.maxAge || 31536000}`];
      if (options.hsts.includeSubDomains) directives.push('includeSubDomains');
      if (options.hsts.preload) directives.push('preload');
      
      setHeader(event, 'Strict-Transport-Security', directives.join('; '));
    }

    // X-Content-Type-Options
    if (options.nosniff) {
      setHeader(event, 'X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (options.frameOptions) {
      setHeader(event, 'X-Frame-Options', options.frameOptions);
    }

    // X-XSS-Protection (legacy, but still useful)
    if (options.xssProtection) {
      setHeader(event, 'X-XSS-Protection', '1; mode=block');
    }

    // Referrer Policy
    if (options.referrerPolicy) {
      setHeader(event, 'Referrer-Policy', options.referrerPolicy);
    }

    // Permissions Policy
    if (options.permissionsPolicy) {
      setHeader(event, 'Permissions-Policy', options.permissionsPolicy);
    }

    // Cross-Origin-Embedder-Policy
    if (options.crossOriginEmbedderPolicy) {
      setHeader(event, 'Cross-Origin-Embedder-Policy', options.crossOriginEmbedderPolicy);
    }

    // Cross-Origin-Opener-Policy
    if (options.crossOriginOpenerPolicy) {
      setHeader(event, 'Cross-Origin-Opener-Policy', options.crossOriginOpenerPolicy);
    }

    // Cross-Origin-Resource-Policy
    if (options.crossOriginResourcePolicy) {
      setHeader(event, 'Cross-Origin-Resource-Policy', options.crossOriginResourcePolicy);
    }

    // Remove potentially dangerous headers
    setHeader(event, 'X-Powered-By', ''); // Remove server information
    setHeader(event, 'Server', '');       // Remove server information

    return new Ok(undefined);
  } catch (error) {
    return new Err(Errors.unknown('Failed to apply security headers', error instanceof Error ? error : new Error(String(error))));
  }
}

/**
 * Validate request integrity (size, content-type, etc.)
 */
export function validateRequestIntegrity(event: H3Event): AppResult<void> {
  try {
    const contentLength = getHeader(event, 'content-length');
    const contentType = getHeader(event, 'content-type');
    
    // Check content length
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (isNaN(length) || length < 0) {
        return new Err(Errors.validation('Invalid Content-Length header'));
      }
      
      // Prevent extremely large payloads
      const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB
      if (length > MAX_PAYLOAD_SIZE) {
        return new Err(Errors.validation('Request payload too large'));
      }
    }
    
    // Validate content type for POST/PUT requests
    const method = event.method?.toUpperCase();
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && contentType) {
      const allowedTypes = [
        'application/json',
        'application/graphql',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
      ];
      
      const isAllowed = allowedTypes.some(type => 
        contentType.toLowerCase().includes(type)
      );
      
      if (!isAllowed) {
        return new Err(Errors.validation('Unsupported content type'));
      }
    }
    
    return new Ok(undefined);
  } catch (error) {
    return new Err(Errors.unknown('Request integrity validation failed', error instanceof Error ? error : new Error(String(error))));
  }
}

/**
 * Simple IP-based rate limiter for additional protection
 */
export class IPRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  check(ip: string): AppResult<void> {
    const now = Date.now();
    const requests = this.requests.get(ip) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    // Check if limit exceeded
    if (validRequests.length >= this.maxRequests) {
      return new Err(Errors.forbidden('Rate limit exceeded'));
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(ip, validRequests);
    
    return new Ok(undefined);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, requests] of this.requests) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, validRequests);
      }
    }
  }

  getStatus(ip: string): { requests: number; remaining: number; resetTime: number } {
    const now = Date.now();
    const requests = this.requests.get(ip) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    const oldest = validRequests[0] || now;
    
    return {
      requests: validRequests.length,
      remaining: Math.max(0, this.maxRequests - validRequests.length),
      resetTime: oldest + this.windowMs,
    };
  }
}

/**
 * Input sanitization utilities
 */
export class InputSanitizer {
  /**
   * Sanitize string input to prevent common attacks
   */
  static sanitizeString(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate and sanitize email
   */
  static sanitizeEmail(email: string): AppResult<string> {
    const sanitized = email.toLowerCase().trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(sanitized)) {
      return new Err(Errors.validation('Invalid email format'));
    }
    
    if (sanitized.length > 254) {
      return new Err(Errors.validation('Email too long'));
    }
    
    return new Ok(sanitized);
  }

  /**
   * Sanitize URL input
   */
  static sanitizeUrl(url: string): AppResult<string> {
    try {
      const parsed = new URL(url);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return new Err(Errors.validation('Invalid URL protocol'));
      }
      
      return new Ok(parsed.toString());
    } catch {
      return new Err(Errors.validation('Invalid URL format'));
    }
  }
}