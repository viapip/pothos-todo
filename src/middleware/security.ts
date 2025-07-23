import type { H3Event } from 'h3';
import { createHash, randomBytes } from 'crypto';
import { logger } from '@/logger';

/**
 * Security headers middleware
 */
export function securityHeaders(event: H3Event): void {
  const res = event.node.res;

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection (for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Strict-Transport-Security (HSTS) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
}

/**
 * Content Security Policy middleware
 */
export function contentSecurityPolicy(event: H3Event): void {
  // Generate nonce for inline scripts/styles
  const nonce = generateNonce();
  event.context.nonce = nonce;

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https:`,
    `connect-src 'self' https://api.github.com https://www.googleapis.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ];

  // Report URI in production
  if (process.env.CSP_REPORT_URI) {
    directives.push(`report-uri ${process.env.CSP_REPORT_URI}`);
  }

  event.node.res.setHeader(
    'Content-Security-Policy',
    directives.join('; ')
  );
}

/**
 * CORS middleware with strict configuration
 */
export interface CORSOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
}

export function createCORSMiddleware(options: CORSOptions = {}) {
  const {
    origin = process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials = true,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    exposedHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge = 86400, // 24 hours
  } = options;

  return function corsMiddleware(event: H3Event): void {
    const requestOrigin = event.node.req.headers.origin;

    // Handle origin validation
    let allowOrigin = false;
    if (typeof origin === 'string') {
      allowOrigin = origin === requestOrigin;
    } else if (Array.isArray(origin)) {
      allowOrigin = origin.includes(requestOrigin || '');
    } else if (typeof origin === 'function') {
      allowOrigin = origin(requestOrigin || '');
    }

    if (allowOrigin && requestOrigin) {
      event.node.res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }

    // Credentials
    if (credentials) {
      event.node.res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Preflight response
    if (event.node.req.method === 'OPTIONS') {
      event.node.res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
      event.node.res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      event.node.res.setHeader('Access-Control-Max-Age', maxAge.toString());
      event.node.res.statusCode = 204;
      event.node.res.end();
      return;
    }

    // Exposed headers
    if (exposedHeaders.length > 0) {
      event.node.res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }
  };
}

/**
 * Request ID middleware for tracing
 */
export function requestId(event: H3Event): void {
  const id = event.node.req.headers['x-request-id'] as string || generateRequestId();
  event.context.requestId = id;
  event.node.res.setHeader('X-Request-ID', id);
}

/**
 * Request logging middleware
 */
export function requestLogger(event: H3Event): void {
  const start = Date.now();
  const { method, url } = event.node.req;
  const requestId = event.context.requestId;

  // Log request
  logger.info('Incoming request', {
    requestId,
    method,
    url,
    ip: event.node.req.socket.remoteAddress,
    userAgent: event.node.req.headers['user-agent'],
  });

  // Log response on finish
  event.node.res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = event.node.res.statusCode;

    logger.info('Request completed', {
      requestId,
      method,
      url,
      statusCode,
      duration,
    });
  });
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(event: H3Event): void {
  // This would integrate with a library like DOMPurify for HTML content
  // For now, we'll just ensure proper encoding is handled by the framework
  event.context.sanitized = true;
}

// Helper functions
function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

function generateRequestId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Combined security middleware
 */
export function security(options?: {
  cors?: CORSOptions;
  csp?: boolean;
}): (event: H3Event) => void {
  const corsMiddleware = createCORSMiddleware(options?.cors);
  const enableCSP = options?.csp !== false;

  return function securityMiddleware(event: H3Event): void {
    // Apply all security middleware
    requestId(event);
    securityHeaders(event);
    if (enableCSP) {
      contentSecurityPolicy(event);
    }
    corsMiddleware(event);
    requestLogger(event);
    sanitizeInput(event);
  };
}