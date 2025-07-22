/**
 * Comprehensive security module
 * 
 * This module provides enterprise-grade security features including:
 * - Security headers (CSP, HSTS, CSRF protection)
 * - Rate limiting with IP-based tracking
 * - CORS configuration
 * - Input sanitization and validation
 * - Request/response security middleware
 * 
 * Usage examples:
 * 
 * ```typescript
 * import { createFullSecurityMiddleware, globalRateLimit } from '@/lib/security';
 * 
 * // Apply security middleware to H3 app
 * const securityMiddleware = createFullSecurityMiddleware({
 *   rateLimit: {
 *     windowMs: 15 * 60 * 1000, // 15 minutes
 *     max: 100, // requests per window
 *   },
 *   cors: {
 *     origin: ['https://myapp.com'],
 *     credentials: true,
 *   }
 * });
 * 
 * app.use(eventHandler(securityMiddleware));
 * 
 * // Check rate limit stats
 * console.log(globalRateLimit.getStats());
 * ```
 */

// Re-export everything from headers
export * from './headers.js';

// Common security patterns as shortcuts
import { 
  createFullSecurityMiddleware,
  createSecurityMiddleware,
  createRateLimitMiddleware,
  applySecurityHeaders,
  RateLimit,
  CSRFProtection,
  globalRateLimit,
  globalCSRFProtection,
  type SecurityConfig
} from './headers.js';

export {
  // Security middleware
  createFullSecurityMiddleware,
  createSecurityMiddleware,
  createRateLimitMiddleware,
  applySecurityHeaders,
  
  // Security classes
  RateLimit,
  CSRFProtection,
  
  // Global instances
  globalRateLimit,
  globalCSRFProtection,
  
  // Types
  type SecurityConfig,
};