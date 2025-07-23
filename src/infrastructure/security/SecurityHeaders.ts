import { defineEventHandler, setHeaders, getHeaders } from 'h3';
import { logger } from '@/logger.js';
import type { H3Event } from 'h3';

export interface SecurityConfig {
  csp: {
    enabled: boolean;
    directives: Record<string, string[]>;
    reportUri?: string;
    reportOnly?: boolean;
  };
  cors: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
    preflightContinue: boolean;
  };
  headers: {
    hsts: {
      enabled: boolean;
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    xFrameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    xContentTypeOptions: boolean;
    xXSSProtection: {
      enabled: boolean;
      mode: 'block' | 'filter';
    };
    referrerPolicy: string;
    permissionsPolicy: Record<string, string[]>;
    expectCT: {
      enabled: boolean;
      maxAge: number;
      enforce: boolean;
      reportUri?: string;
    };
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
}

/**
 * Comprehensive Security Headers and CORS Management
 * 
 * Implements security best practices including CSP, CORS, HSTS,
 * and other security headers to protect against common web vulnerabilities.
 */
export class SecurityHeaders {
  private static instance: SecurityHeaders;
  private config: SecurityConfig;

  private constructor(config: SecurityConfig) {
    this.config = config;
  }

  static getInstance(config?: SecurityConfig): SecurityHeaders {
    if (!SecurityHeaders.instance && config) {
      SecurityHeaders.instance = new SecurityHeaders(config);
    }
    return SecurityHeaders.instance;
  }

  /**
   * Create security middleware
   */
  createSecurityMiddleware() {
    return defineEventHandler(async (event) => {
      // Apply security headers
      this.applySecurityHeaders(event);

      // Handle CORS
      if (this.config.cors.enabled) {
        const corsResult = this.handleCORS(event);
        if (corsResult.isPreflightRequest) {
          return null; // End request for preflight
        }
      }

      // Rate limiting would be handled by separate middleware
      // This is just for header application
    });
  }

  /**
   * Apply all configured security headers
   */
  private applySecurityHeaders(event: H3Event): void {
    const headers: Record<string, string> = {};

    // Content Security Policy
    if (this.config.csp.enabled) {
      const cspHeader = this.config.csp.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';

      headers[cspHeader] = this.buildCSPHeader();
    }

    // HTTP Strict Transport Security
    if (this.config.headers.hsts.enabled) {
      let hstsValue = `max-age=${this.config.headers.hsts.maxAge}`;
      if (this.config.headers.hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (this.config.headers.hsts.preload) {
        hstsValue += '; preload';
      }
      headers['Strict-Transport-Security'] = hstsValue;
    }

    // X-Frame-Options
    headers['X-Frame-Options'] = this.config.headers.xFrameOptions;

    // X-Content-Type-Options
    if (this.config.headers.xContentTypeOptions) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    // X-XSS-Protection
    if (this.config.headers.xXSSProtection.enabled) {
      headers['X-XSS-Protection'] = this.config.headers.xXSSProtection.mode === 'block'
        ? '1; mode=block'
        : '1';
    }

    // Referrer-Policy
    headers['Referrer-Policy'] = this.config.headers.referrerPolicy;

    // Permissions-Policy
    if (Object.keys(this.config.headers.permissionsPolicy).length > 0) {
      headers['Permissions-Policy'] = this.buildPermissionsPolicyHeader();
    }

    // Expect-CT
    if (this.config.headers.expectCT.enabled) {
      let expectCTValue = `max-age=${this.config.headers.expectCT.maxAge}`;
      if (this.config.headers.expectCT.enforce) {
        expectCTValue += ', enforce';
      }
      if (this.config.headers.expectCT.reportUri) {
        expectCTValue += `, report-uri="${this.config.headers.expectCT.reportUri}"`;
      }
      headers['Expect-CT'] = expectCTValue;
    }

    // Additional security headers
    headers['X-Permitted-Cross-Domain-Policies'] = 'none';
    headers['X-Download-Options'] = 'noopen';
    headers['X-DNS-Prefetch-Control'] = 'off';

    // Apply all headers
    setHeaders(event, headers);

    logger.debug('Security headers applied', {
      headersCount: Object.keys(headers).length,
      url: event.node.req.url,
    });
  }

  /**
   * Handle CORS requests
   */
  private handleCORS(event: H3Event): { isPreflightRequest: boolean } {
    const requestHeaders = getHeaders(event);
    const origin = requestHeaders.origin as string;
    const method = event.node.req.method;

    // Check if origin is allowed
    const isOriginAllowed = this.isOriginAllowed(origin);

    if (!isOriginAllowed) {
      logger.warn('CORS: Origin not allowed', { origin, url: event.node.req.url });
      return { isPreflightRequest: false };
    }

    const corsHeaders: Record<string, string> = {};

    // Set allowed origin
    if (this.config.cors.allowedOrigins.includes('*')) {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    } else {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Vary'] = 'Origin';
    }

    // Set credentials
    if (this.config.cors.credentials) {
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    }

    // Handle preflight request
    if (method === 'OPTIONS') {
      const requestMethod = requestHeaders['access-control-request-method'] as string;
      const requestHeadersStr = requestHeaders['access-control-request-headers'] as string;

      // Check if method is allowed
      if (requestMethod && !this.config.cors.allowedMethods.includes(requestMethod)) {
        logger.warn('CORS: Method not allowed', { method: requestMethod, origin });
        return { isPreflightRequest: true };
      }

      // Check if headers are allowed
      if (requestHeadersStr) {
        const requestedHeaders = requestHeadersStr.split(',').map(h => h.trim().toLowerCase());
        const allowedHeaders = this.config.cors.allowedHeaders.map(h => h.toLowerCase());

        const hasDisallowedHeaders = requestedHeaders.some(h => !allowedHeaders.includes(h));
        if (hasDisallowedHeaders) {
          logger.warn('CORS: Headers not allowed', {
            requestedHeaders,
            allowedHeaders: this.config.cors.allowedHeaders,
            origin
          });
          return { isPreflightRequest: true };
        }
      }

      // Set preflight response headers
      corsHeaders['Access-Control-Allow-Methods'] = this.config.cors.allowedMethods.join(', ');
      corsHeaders['Access-Control-Allow-Headers'] = this.config.cors.allowedHeaders.join(', ');
      corsHeaders['Access-Control-Max-Age'] = this.config.cors.maxAge.toString();

      setHeaders(event, corsHeaders);

      logger.debug('CORS: Preflight request handled', { origin, method: requestMethod });
      return { isPreflightRequest: true };
    }

    // Set exposed headers for actual requests
    if (this.config.cors.exposedHeaders.length > 0) {
      corsHeaders['Access-Control-Expose-Headers'] = this.config.cors.exposedHeaders.join(', ');
    }

    setHeaders(event, corsHeaders);

    logger.debug('CORS: Headers applied for actual request', { origin, method });
    return { isPreflightRequest: false };
  }

  /**
   * Build Content Security Policy header value
   */
  private buildCSPHeader(): string {
    const directives = Object.entries(this.config.csp.directives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');

    let csp = directives;

    if (this.config.csp.reportUri) {
      csp += `; report-uri ${this.config.csp.reportUri}`;
    }

    return csp;
  }

  /**
   * Build Permissions Policy header value
   */
  private buildPermissionsPolicyHeader(): string {
    return Object.entries(this.config.headers.permissionsPolicy)
      .map(([directive, allowlist]) => {
        if (allowlist.length === 0) {
          return `${directive}=()`;
        }
        return `${directive}=(${allowlist.join(' ')})`;
      })
      .join(', ');
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    if (!origin) return false;

    const allowedOrigins = this.config.cors.allowedOrigins;

    // Allow all origins
    if (allowedOrigins.includes('*')) {
      return true;
    }

    // Exact match
    if (allowedOrigins.includes(origin)) {
      return true;
    }

    // Pattern matching (simplified)
    for (const allowed of allowedOrigins) {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(origin)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate CSP report
   */
  static validateCSPReport(report: any): boolean {
    const requiredFields = ['document-uri', 'violated-directive'];
    return requiredFields.every(field => field in report);
  }

  /**
   * Log CSP violation
   */
  static logCSPViolation(report: any, clientIP?: string): void {
    logger.warn('CSP Violation reported', {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      clientIP,
    });
  }
}

// Default production security configuration
export const productionSecurityConfig: SecurityConfig = {
  csp: {
    enabled: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // GraphQL Playground needs eval
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "https:"],
      "connect-src": ["'self'", "https:"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "object-src": ["'none'"],
      "media-src": ["'none'"],
      "worker-src": ["'self'"],
      "manifest-src": ["'self'"],
    },
    reportOnly: false,
  },
  cors: {
    enabled: true,
    allowedOrigins: ['https://app.todoapp.com', 'https://admin.todoapp.com'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Requested-With',
      'X-Signature',
      'X-Timestamp',
      'X-Nonce',
      'X-Key-Id',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
  },
  headers: {
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: true,
    xXSSProtection: {
      enabled: true,
      mode: 'block',
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
      magnetometer: [],
      gyroscope: [],
      accelerometer: [],
      ambient_light_sensor: [],
      autoplay: ['self'],
      encrypted_media: ['self'],
      fullscreen: ['self'],
      picture_in_picture: [],
    },
    expectCT: {
      enabled: true,
      maxAge: 86400, // 24 hours
      enforce: true,
    },
  },
  rateLimit: {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // requests per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
};

// Development security configuration (more permissive)
export const developmentSecurityConfig: SecurityConfig = {
  ...productionSecurityConfig,
  cors: {
    ...productionSecurityConfig.cors,
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:5173',
      'https://studio.apollographql.com', // Apollo Studio
    ],
  },
  csp: {
    ...productionSecurityConfig.csp,
    reportOnly: true, // Don't block in development
    directives: {
      ...productionSecurityConfig.csp.directives,
      "connect-src": ["'self'", "http:", "https:", "ws:", "wss:"], // Allow all for development
    },
  },
  headers: {
    ...productionSecurityConfig.headers,
    hsts: {
      ...productionSecurityConfig.headers.hsts,
      enabled: false, // Disable HSTS in development
    },
  },
};