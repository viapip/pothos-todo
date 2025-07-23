import { defineEventHandler, readBody, createError, getRequestIP } from 'h3';
import { SecurityHeaders } from '@/infrastructure/security/SecurityHeaders.js';
import { auditLogger } from '@/infrastructure/security/AuditLogger.js';
import { logger } from '@/logger.js';

/**
 * CSP Violation Report Endpoint
 * 
 * Receives and processes Content Security Policy violation reports
 * to help identify potential security issues and policy misconfigurations.
 */
export default defineEventHandler(async (event) => {
  if (event.node.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed',
    });
  }

  try {
    const body = await readBody(event);
    const clientIP = getRequestIP(event);

    // Extract CSP report
    const cspReport = body['csp-report'] || body;

    // Validate report structure
    if (!SecurityHeaders.validateCSPReport(cspReport)) {
      logger.warn('Invalid CSP report received', { body, clientIP });
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid CSP report format',
      });
    }

    // Log the CSP violation
    SecurityHeaders.logCSPViolation(cspReport, clientIP);

    // Audit log the security event
    await auditLogger.logSecurityEvent({
      eventType: 'security_violation',
      description: `CSP violation: ${cspReport['violated-directive']}`,
      severity: 'medium',
      ipAddress: clientIP,
      details: {
        documentUri: cspReport['document-uri'],
        violatedDirective: cspReport['violated-directive'],
        blockedUri: cspReport['blocked-uri'],
        sourceFile: cspReport['source-file'],
        lineNumber: cspReport['line-number'],
        columnNumber: cspReport['column-number'],
        originalPolicy: cspReport['original-policy'],
        userAgent: event.node.req.headers['user-agent'],
        referrer: cspReport['referrer'],
      },
    });

    // Analyze violation patterns for potential attacks
    await analyzeCSPViolation(cspReport, clientIP || 'unknown ip');

    return { status: 'received' };

  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }

    logger.error('Error processing CSP report', { error });
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});

/**
 * Analyze CSP violations for patterns that might indicate attacks
 */
async function analyzeCSPViolation(report: any, clientIP: string): Promise<void> {
  const blockedUri = report['blocked-uri'];
  const violatedDirective = report['violated-directive'];

  // Check for common XSS attempt patterns
  const xssPatterns = [
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /<script/i,
  ];

  const isXSSAttempt = xssPatterns.some(pattern =>
    pattern.test(blockedUri) || pattern.test(report['source-file'] || '')
  );

  if (isXSSAttempt) {
    await auditLogger.logSecurityEvent({
      eventType: 'suspicious_activity',
      description: 'Potential XSS attempt detected via CSP violation',
      severity: 'high',
      ipAddress: clientIP,
      details: {
        violationType: 'potential_xss',
        blockedUri,
        violatedDirective,
        documentUri: report['document-uri'],
        detectionPatterns: xssPatterns
          .filter(pattern => pattern.test(blockedUri))
          .map(p => p.toString()),
      },
    });
  }

  // Check for clickjacking attempts
  if (violatedDirective.includes('frame-ancestors')) {
    await auditLogger.logSecurityEvent({
      eventType: 'suspicious_activity',
      description: 'Potential clickjacking attempt detected',
      severity: 'high',
      ipAddress: clientIP,
      details: {
        violationType: 'potential_clickjacking',
        blockedUri,
        violatedDirective,
        documentUri: report['document-uri'],
      },
    });
  }

  // Check for data exfiltration attempts
  if (violatedDirective.includes('connect-src') && blockedUri) {
    const suspiciousDomains = [
      /attacker\.com/i,
      /evil\.example/i,
      /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/,  // Direct IP addresses
      /[a-f0-9]{32,}/,  // Long hex strings (potential exfil domains)
    ];

    const isSuspiciousDomain = suspiciousDomains.some(pattern =>
      pattern.test(blockedUri)
    );

    if (isSuspiciousDomain) {
      await auditLogger.logSecurityEvent({
        eventType: 'suspicious_activity',
        description: 'Potential data exfiltration attempt detected',
        severity: 'critical',
        ipAddress: clientIP,
        details: {
          violationType: 'potential_exfiltration',
          blockedUri,
          violatedDirective,
          documentUri: report['document-uri'],
          suspiciousPatterns: suspiciousDomains
            .filter(pattern => pattern.test(blockedUri))
            .map(p => p.toString()),
        },
      });
    }
  }
}