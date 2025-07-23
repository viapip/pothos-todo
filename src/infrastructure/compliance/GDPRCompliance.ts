import { logger } from '@/logger.js';
import { CacheManager } from '../cache/CacheManager.js';
import { auditLogger } from '../security/AuditLogger.js';
import prisma from '@/lib/prisma.js';
import crypto from 'crypto';

export interface DataSubject {
  id: string;
  email: string;
  userId: string;
  consentStatus: {
    functional: boolean;
    analytics: boolean;
    marketing: boolean;
    thirdParty: boolean;
  };
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  dataRetentionPeriod: number; // in days
  consentTimestamp: Date;
  lastUpdated: Date;
}

export interface DataProcessingActivity {
  id: string;
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  recipientCategories: string[];
  retentionPeriod: number;
  internationalTransfers: boolean;
  securityMeasures: string[];
  isActive: boolean;
}

export interface PortabilityRequest {
  id: string;
  userId: string;
  requestType: 'export' | 'transfer';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  format: 'json' | 'xml' | 'csv';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

export interface ErasureRequest {
  id: string;
  userId: string;
  requestType: 'partial' | 'complete';
  dataCategories?: string[];
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestedAt: Date;
  processedAt?: Date;
  verificationRequired: boolean;
  retentionOverride?: {
    reason: string;
    legalBasis: string;
    expiresAt: Date;
  };
}

/**
 * GDPR Compliance Management System
 * 
 * Implements comprehensive GDPR compliance features including
 * consent management, data portability, right to erasure, and audit trails.
 */
export class GDPRCompliance {
  private static instance: GDPRCompliance;
  private cache = CacheManager.getInstance();

  private constructor() { }

  static getInstance(): GDPRCompliance {
    if (!GDPRCompliance.instance) {
      GDPRCompliance.instance = new GDPRCompliance();
    }
    return GDPRCompliance.instance;
  }

  /**
   * Record data subject consent
   */
  async recordConsent(options: {
    userId: string;
    email: string;
    consentStatus: DataSubject['consentStatus'];
    legalBasis: DataSubject['legalBasis'];
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const dataSubject: DataSubject = {
      id: crypto.randomUUID(),
      email: options.email,
      userId: options.userId,
      consentStatus: options.consentStatus,
      legalBasis: options.legalBasis,
      dataRetentionPeriod: this.calculateRetentionPeriod(options.legalBasis),
      consentTimestamp: new Date(),
      lastUpdated: new Date(),
    };

    // Store consent record
    await this.cache.set(`gdpr_consent:${options.userId}`, dataSubject, { ttl: 0 });

    // Audit log
    await auditLogger.logEvent({
      eventType: 'gdpr_consent',
      action: 'consent_recorded',
      resource: 'user_consent',
      resourceId: options.userId,
      userId: options.userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      success: true,
      details: {
        consentStatus: options.consentStatus,
        legalBasis: options.legalBasis,
      },
      complianceFlags: {
        gdpr: true,
        hipaa: false,
        sox: false,
        pci: false,
      },
      retention: {
        category: 'compliance',
        deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
        encrypted: false,
      },
    });

    logger.info('GDPR consent recorded', {
      userId: options.userId,
      legalBasis: options.legalBasis,
      consentId: dataSubject.id,
    });

    return dataSubject.id;
  }

  /**
   * Update consent preferences
   */
  async updateConsent(options: {
    userId: string;
    consentStatus: Partial<DataSubject['consentStatus']>;
    ipAddress?: string;
  }): Promise<boolean> {
    const existingConsent = await this.getConsent(options.userId);
    if (!existingConsent) {
      throw new Error('No existing consent record found');
    }

    const updatedConsent: DataSubject = {
      ...existingConsent,
      consentStatus: {
        ...existingConsent.consentStatus,
        ...options.consentStatus,
      },
      lastUpdated: new Date(),
    };

    await this.cache.set(`gdpr_consent:${options.userId}`, updatedConsent, { ttl: 0 });

    // Audit log
    await auditLogger.logEvent({
      eventType: 'gdpr_consent',
      action: 'consent_updated',
      resource: 'user_consent',
      resourceId: options.userId,
      userId: options.userId,
      ipAddress: options.ipAddress,
      success: true,
      details: {
        previousConsent: existingConsent.consentStatus,
        newConsent: updatedConsent.consentStatus,
        changes: options.consentStatus,
      },
      complianceFlags: {
        gdpr: true,
        hipaa: false,
        sox: false,
        pci: false,
      },
      retention: {
        category: 'compliance',
        deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
        encrypted: false,
      },
    });

    logger.info('GDPR consent updated', {
      userId: options.userId,
      changes: options.consentStatus,
    });

    return true;
  }

  /**
   * Get consent status for a user
   */
  async getConsent(userId: string): Promise<DataSubject | null> {
    return await this.cache.get<DataSubject>(`gdpr_consent:${userId}`);
  }

  /**
   * Request data portability (Right to Data Portability - Article 20)
   */
  async requestDataPortability(options: {
    userId: string;
    format: 'json' | 'xml' | 'csv';
    requestType: 'export' | 'transfer';
    ipAddress?: string;
  }): Promise<string> {
    const requestId = crypto.randomUUID();
    const request: PortabilityRequest = {
      id: requestId,
      userId: options.userId,
      requestType: options.requestType,
      status: 'pending',
      format: options.format,
      requestedAt: new Date(),
    };

    // Store request
    await this.cache.set(`gdpr_portability:${requestId}`, request, { ttl: 0 });

    // Start processing asynchronously
    this.processPortabilityRequest(requestId).catch(error => {
      logger.error('Data portability processing failed', { requestId, error });
    });

    // Audit log
    await auditLogger.logEvent({
      eventType: 'gdpr_portability',
      action: 'portability_requested',
      resource: 'user_data',
      resourceId: options.userId,
      userId: options.userId,
      ipAddress: options.ipAddress,
      success: true,
      details: {
        requestId,
        requestType: options.requestType,
        format: options.format,
      },
      complianceFlags: {
        gdpr: true,
        hipaa: false,
        sox: false,
        pci: false,
      },
      retention: {
        category: 'compliance',
        deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
        encrypted: false,
      },
    });

    logger.info('Data portability requested', {
      userId: options.userId,
      requestId,
      format: options.format,
    });

    return requestId;
  }

  /**
   * Request data erasure (Right to be Forgotten - Article 17)
   */
  async requestDataErasure(options: {
    userId: string;
    requestType: 'partial' | 'complete';
    dataCategories?: string[];
    reason: string;
    ipAddress?: string;
  }): Promise<string> {
    const requestId = crypto.randomUUID();
    const request: ErasureRequest = {
      id: requestId,
      userId: options.userId,
      requestType: options.requestType,
      dataCategories: options.dataCategories,
      reason: options.reason,
      status: 'pending',
      requestedAt: new Date(),
      verificationRequired: true,
    };

    // Check if erasure is legally permitted
    const canErase = await this.canEraseData(options.userId, options.dataCategories);
    if (!canErase.allowed) {
      request.status = 'rejected';
      request.retentionOverride = {
        reason: canErase.reason || 'Legal obligation to retain data',
        legalBasis: 'legal_obligation',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      };
    }

    // Store request
    await this.cache.set(`gdpr_erasure:${requestId}`, request, { ttl: 0 });

    // Process if approved
    if (request.status === 'pending') {
      this.processErasureRequest(requestId).catch(error => {
        logger.error('Data erasure processing failed', { requestId, error });
      });
    }

    // Audit log
    await auditLogger.logEvent({
      eventType: 'gdpr_erasure',
      action: 'erasure_requested',
      resource: 'user_data',
      resourceId: options.userId,
      userId: options.userId,
      ipAddress: options.ipAddress,
      success: true,
      details: {
        requestId,
        requestType: options.requestType,
        reason: options.reason,
        status: request.status,
        dataCategories: options.dataCategories,
      },
      complianceFlags: {
        gdpr: true,
        hipaa: false,
        sox: false,
        pci: false,
      },
      retention: {
        category: 'compliance',
        deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
        encrypted: false,
      },
    });

    logger.info('Data erasure requested', {
      userId: options.userId,
      requestId,
      status: request.status,
    });

    return requestId;
  }

  /**
   * Get data processing activities (Article 30 - Records of Processing)
   */
  async getDataProcessingActivities(): Promise<DataProcessingActivity[]> {
    return [
      {
        id: 'todo-management',
        name: 'Todo Management System',
        purpose: 'Provide task management services to users',
        legalBasis: 'contract',
        dataCategories: ['contact_data', 'task_data', 'usage_data'],
        recipientCategories: ['internal_staff', 'cloud_providers'],
        retentionPeriod: 2555, // 7 years
        internationalTransfers: false,
        securityMeasures: ['encryption', 'access_controls', 'audit_logging'],
        isActive: true,
      },
      {
        id: 'ai-insights',
        name: 'AI-Powered Insights',
        purpose: 'Provide intelligent recommendations and analytics',
        legalBasis: 'legitimate_interests',
        dataCategories: ['task_data', 'usage_patterns', 'behavioral_data'],
        recipientCategories: ['ai_processors', 'analytics_providers'],
        retentionPeriod: 1095, // 3 years
        internationalTransfers: true,
        securityMeasures: ['encryption', 'anonymization', 'access_controls'],
        isActive: true,
      },
      {
        id: 'security-monitoring',
        name: 'Security and Fraud Prevention',
        purpose: 'Protect system integrity and prevent unauthorized access',
        legalBasis: 'legitimate_interests',
        dataCategories: ['access_logs', 'ip_addresses', 'device_info'],
        recipientCategories: ['security_team', 'law_enforcement'],
        retentionPeriod: 2555, // 7 years
        internationalTransfers: false,
        securityMeasures: ['encryption', 'access_controls', 'monitoring'],
        isActive: true,
      },
    ];
  }

  /**
   * Generate privacy notice
   */
  generatePrivacyNotice(): string {
    return `
# Privacy Notice

## Data Controller
Todo Management System

## Data We Collect
- Contact information (email address, name)
- Task and productivity data
- Usage analytics and preferences
- Device and access information

## Legal Basis for Processing
- **Contract**: To provide our todo management services
- **Legitimate Interests**: To improve our services and ensure security
- **Consent**: For marketing communications and analytics (where required)

## Your Rights Under GDPR
- **Right of Access**: Request a copy of your personal data
- **Right to Rectification**: Correct inaccurate or incomplete data
- **Right to Erasure**: Request deletion of your personal data
- **Right to Portability**: Receive your data in a structured format
- **Right to Object**: Object to processing based on legitimate interests
- **Right to Restrict Processing**: Limit how we use your data

## Data Retention
- Account data: 7 years after account closure
- Usage analytics: 3 years
- Security logs: 7 years

## International Transfers
Some data may be transferred outside the EU with appropriate safeguards.

## Contact Information
For privacy-related queries, contact: privacy@todoapp.com
Data Protection Officer: dpo@todoapp.com

Last updated: ${new Date().toISOString().split('T')[0]}
    `;
  }

  private async processPortabilityRequest(requestId: string): Promise<void> {
    const request = await this.cache.get<PortabilityRequest>(`gdpr_portability:${requestId}`);
    if (!request) return;

    try {
      request.status = 'processing';
      await this.cache.set(`gdpr_portability:${requestId}`, request, { ttl: 0 });

      // Collect user data
      const userData = await this.collectUserData(request.userId);

      // Format data according to request
      const formattedData = this.formatDataForExport(userData, request.format);

      // Generate secure download URL (in real implementation, store in secure location)
      const downloadUrl = `https://secure.todoapp.com/gdpr/download/${requestId}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      request.status = 'completed';
      request.completedAt = new Date();
      request.downloadUrl = downloadUrl;
      request.expiresAt = expiresAt;

      await this.cache.set(`gdpr_portability:${requestId}`, request, { ttl: 0 });

      // Audit log
      await auditLogger.logEvent({
        eventType: 'gdpr_portability',
        action: 'portability_completed',
        resource: 'user_data',
        resourceId: request.userId,
        userId: request.userId,
        success: true,
        details: {
          requestId,
          format: request.format,
          downloadUrl,
          expiresAt,
        },
        complianceFlags: {
          gdpr: true,
          hipaa: false,
          sox: false,
          pci: false,
        },
        retention: {
          category: 'compliance',
          deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
          encrypted: false,
        },
      });

      logger.info('Data portability completed', {
        requestId,
        userId: request.userId,
        downloadUrl,
      });

    } catch (error) {
      request.status = 'failed';
      await this.cache.set(`gdpr_portability:${requestId}`, request, { ttl: 0 });

      logger.error('Data portability failed', {
        requestId,
        userId: request.userId,
        error,
      });
    }
  }

  private async processErasureRequest(requestId: string): Promise<void> {
    const request = await this.cache.get<ErasureRequest>(`gdpr_erasure:${requestId}`);
    if (!request) return;

    try {
      request.status = 'processing';
      await this.cache.set(`gdpr_erasure:${requestId}`, request, { ttl: 0 });

      // Perform data erasure
      if (request.requestType === 'complete') {
        await this.eraseUserData(request.userId);
      } else if (request.dataCategories) {
        await this.eraseUserDataCategories(request.userId, request.dataCategories);
      }

      request.status = 'completed';
      request.processedAt = new Date();

      await this.cache.set(`gdpr_erasure:${requestId}`, request, { ttl: 0 });

      // Audit log
      await auditLogger.logEvent({
        eventType: 'gdpr_erasure',
        action: 'erasure_completed',
        resource: 'user_data',
        resourceId: request.userId,
        userId: request.userId,
        success: true,
        details: {
          requestId,
          requestType: request.requestType,
          dataCategories: request.dataCategories,
        },
        complianceFlags: {
          gdpr: true,
          hipaa: false,
          sox: false,
          pci: false,
        },
        retention: {
          category: 'compliance',
          deleteAfter: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
          encrypted: false,
        },
      });

      logger.info('Data erasure completed', {
        requestId,
        userId: request.userId,
      });

    } catch (error) {
      request.status = 'rejected';
      await this.cache.set(`gdpr_erasure:${requestId}`, request, { ttl: 0 });

      logger.error('Data erasure failed', {
        requestId,
        userId: request.userId,
        error,
      });
    }
  }

  private async collectUserData(userId: string): Promise<Record<string, any>> {
    // Collect all user data from various sources
    const [user, todos, lists, sessions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.todo.findMany({ where: { userId } }),
      prisma.todoList.findMany({ where: { userId } }),
      // Simplified - would collect from session store
      [],
    ]);

    return {
      user,
      todos,
      lists,
      sessions,
      consent: await this.getConsent(userId),
      dataCollectedAt: new Date().toISOString(),
    };
  }

  private formatDataForExport(data: Record<string, any>, format: 'json' | 'xml' | 'csv'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'xml':
        // Simplified XML conversion
        return `<?xml version="1.0"?>\n<userData>${JSON.stringify(data)}</userData>`;
      case 'csv':
        // Simplified CSV conversion (flatten data)
        return 'field,value\n' + Object.entries(data)
          .map(([key, value]) => `${key},"${JSON.stringify(value).replace(/"/g, '""')}"`)
          .join('\n');
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private async canEraseData(userId: string, dataCategories?: string[]): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Check if data can be legally erased
    // This is a simplified implementation

    // Check for legal obligations to retain data
    const consent = await this.getConsent(userId);
    if (consent?.legalBasis === 'legal_obligation') {
      return {
        allowed: false,
        reason: 'Data must be retained due to legal obligations',
      };
    }

    // Check for active contracts
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.password !== null) {
      return {
        allowed: false,
        reason: 'Cannot erase data while account is active. Please deactivate account first.',
      };
    }

    return { allowed: true };
  }

  private async eraseUserData(userId: string): Promise<void> {
    // Perform complete data erasure
    await Promise.all([
      prisma.todo.deleteMany({ where: { userId } }),
      prisma.todoList.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // Clear cache entries
    await this.cache.delete(`gdpr_consent:${userId}`);

    logger.info('Complete user data erasure performed', { userId });
  }

  private async eraseUserDataCategories(userId: string, categories: string[]): Promise<void> {
    // Perform selective data erasure
    for (const category of categories) {
      switch (category) {
        case 'todos':
          await prisma.todo.deleteMany({ where: { userId } });
          break;
        case 'lists':
          await prisma.todoList.deleteMany({ where: { userId } });
          break;
        case 'preferences':
          await prisma.user.update({
            where: { id: userId },
            data: { password: null }, // TODO: Add preferences to user
          });
          break;
        // Add more categories as needed
      }
    }

    logger.info('Selective data erasure performed', { userId, categories });
  }

  private calculateRetentionPeriod(legalBasis: DataSubject['legalBasis']): number {
    switch (legalBasis) {
      case 'consent':
        return 2555; // 7 years
      case 'contract':
        return 2555; // 7 years
      case 'legal_obligation':
        return 3650; // 10 years
      case 'vital_interests':
        return 2555; // 7 years
      case 'public_task':
        return 3650; // 10 years
      case 'legitimate_interests':
        return 1095; // 3 years
      default:
        return 2555; // 7 years default
    }
  }
}

export const gdprCompliance = GDPRCompliance.getInstance();