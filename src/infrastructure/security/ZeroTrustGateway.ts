import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from '@/logger.js';
import { MetricsSystem } from '../observability/Metrics.js';

export interface ZeroTrustConfig {
  jwtSecret: string;
  jwtExpiry: string;
  enableMTLS?: boolean;
  enableDeviceFingerprinting?: boolean;
  enableBehavioralAnalysis?: boolean;
  riskThreshold?: number;
  sessionTimeout?: number;
}

export interface SecurityContext {
  userId: string;
  sessionId: string;
  deviceId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  riskScore: number;
  permissions: string[];
  attributes: Record<string, any>;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  riskScore: number;
  requiredActions?: string[];
  conditions?: Record<string, any>;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny';
  priority: number;
}

export interface PolicyCondition {
  type: 'attribute' | 'time' | 'location' | 'risk' | 'custom';
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';
  field: string;
  value: any;
}

/**
 * Zero Trust Security Gateway
 * Implements continuous verification and least privilege access
 */
export class ZeroTrustGateway {
  private static instance: ZeroTrustGateway;
  private config: ZeroTrustConfig;
  private policies: Map<string, PolicyRule> = new Map();
  private sessions: Map<string, SecurityContext> = new Map();
  private riskAnalyzer: RiskAnalyzer;
  private metrics: MetricsSystem;

  private constructor(config: ZeroTrustConfig) {
    this.config = {
      riskThreshold: 0.7,
      sessionTimeout: 3600000, // 1 hour
      enableMTLS: true,
      enableDeviceFingerprinting: true,
      enableBehavioralAnalysis: true,
      ...config,
    };
    
    this.riskAnalyzer = new RiskAnalyzer();
    this.metrics = MetricsSystem.getInstance();
    
    this.setupDefaultPolicies();
  }

  static initialize(config: ZeroTrustConfig): ZeroTrustGateway {
    if (!ZeroTrustGateway.instance) {
      ZeroTrustGateway.instance = new ZeroTrustGateway(config);
    }
    return ZeroTrustGateway.instance;
  }

  static getInstance(): ZeroTrustGateway {
    if (!ZeroTrustGateway.instance) {
      throw new Error('ZeroTrustGateway not initialized');
    }
    return ZeroTrustGateway.instance;
  }

  /**
   * Authenticate and create security context
   */
  async authenticate(credentials: {
    userId: string;
    password?: string;
    token?: string;
    deviceId?: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ token: string; context: SecurityContext }> {
    // Verify credentials
    const verified = await this.verifyCredentials(credentials);
    if (!verified) {
      throw new Error('Authentication failed');
    }

    // Create security context
    const context: SecurityContext = {
      userId: credentials.userId,
      sessionId: this.generateSessionId(),
      deviceId: credentials.deviceId,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent,
      timestamp: new Date(),
      riskScore: 0,
      permissions: [],
      attributes: {},
    };

    // Analyze risk
    context.riskScore = await this.riskAnalyzer.analyzeAuthenticationRisk(context);

    // Check if risk is acceptable
    if (context.riskScore > this.config.riskThreshold) {
      this.metrics.record('apiErrors', 1, {
        type: 'high_risk_auth',
        userId: context.userId,
        riskScore: context.riskScore,
      });
      throw new Error('Authentication denied due to high risk');
    }

    // Load user permissions
    context.permissions = await this.loadUserPermissions(context.userId);

    // Generate JWT token
    const token = this.generateToken(context);

    // Store session
    this.sessions.set(context.sessionId, context);

    // Record metrics
    this.metrics.record('todosCreated', 1, {
      type: 'authentication',
      userId: context.userId,
    });

    logger.info('User authenticated', {
      userId: context.userId,
      sessionId: context.sessionId,
      riskScore: context.riskScore,
    });

    return { token, context };
  }

  /**
   * Authorize access to a resource
   */
  async authorize(
    context: SecurityContext,
    resource: string,
    action: string
  ): Promise<AccessDecision> {
    // Update risk score based on current behavior
    context.riskScore = await this.riskAnalyzer.analyzeBehavior(context, { resource, action });

    // Check if session is still valid
    if (!this.isSessionValid(context)) {
      return {
        allowed: false,
        reason: 'Session expired or invalid',
        riskScore: context.riskScore,
        requiredActions: ['reauthenticate'],
      };
    }

    // Evaluate policies
    const decision = await this.evaluatePolicies(context, resource, action);

    // Record access attempt
    this.recordAccessAttempt(context, resource, action, decision);

    // Update session if access was granted
    if (decision.allowed) {
      this.updateSession(context);
    }

    return decision;
  }

  /**
   * Verify user credentials
   */
  private async verifyCredentials(credentials: any): Promise<boolean> {
    // In real implementation, would verify against user store
    // This is simplified for demonstration
    return !!credentials.userId;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate JWT token
   */
  private generateToken(context: SecurityContext): string {
    return jwt.sign(
      {
        userId: context.userId,
        sessionId: context.sessionId,
        permissions: context.permissions,
      },
      this.config.jwtSecret,
      {
        expiresIn: this.config.jwtExpiry,
        issuer: 'zero-trust-gateway',
      }
    );
  }

  /**
   * Load user permissions from store
   */
  private async loadUserPermissions(userId: string): Promise<string[]> {
    // In real implementation, would load from database
    return ['todo:read', 'todo:write', 'todo:delete'];
  }

  /**
   * Check if session is valid
   */
  private isSessionValid(context: SecurityContext): boolean {
    const session = this.sessions.get(context.sessionId);
    if (!session) return false;

    const elapsed = Date.now() - session.timestamp.getTime();
    return elapsed < this.config.sessionTimeout!;
  }

  /**
   * Evaluate policies for access decision
   */
  private async evaluatePolicies(
    context: SecurityContext,
    resource: string,
    action: string
  ): Promise<AccessDecision> {
    const applicablePolicies = Array.from(this.policies.values())
      .filter(policy => 
        this.matchResource(policy.resource, resource) &&
        this.matchAction(policy.action, action)
      )
      .sort((a, b) => b.priority - a.priority);

    for (const policy of applicablePolicies) {
      const matches = await this.evaluateConditions(policy.conditions, context);
      
      if (matches) {
        return {
          allowed: policy.effect === 'allow',
          reason: policy.name,
          riskScore: context.riskScore,
        };
      }
    }

    // Default deny
    return {
      allowed: false,
      reason: 'No matching policy',
      riskScore: context.riskScore,
    };
  }

  /**
   * Match resource pattern
   */
  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    if (pattern === resource) return true;
    
    // Support wildcards
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return regex.test(resource);
  }

  /**
   * Match action pattern
   */
  private matchAction(pattern: string, action: string): boolean {
    return pattern === '*' || pattern === action;
  }

  /**
   * Evaluate policy conditions
   */
  private async evaluateConditions(
    conditions: PolicyCondition[],
    context: SecurityContext
  ): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result) return false;
    }
    return true;
  }

  /**
   * Evaluate single condition
   */
  private async evaluateCondition(
    condition: PolicyCondition,
    context: SecurityContext
  ): Promise<boolean> {
    let value: any;

    switch (condition.type) {
      case 'attribute':
        value = context.attributes[condition.field];
        break;
      case 'risk':
        value = context.riskScore;
        break;
      case 'time':
        value = new Date();
        break;
      default:
        value = null;
    }

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'contains':
        return Array.isArray(value) && value.includes(condition.value);
      default:
        return false;
    }
  }

  /**
   * Record access attempt for audit
   */
  private recordAccessAttempt(
    context: SecurityContext,
    resource: string,
    action: string,
    decision: AccessDecision
  ): void {
    const attempt = {
      timestamp: new Date(),
      userId: context.userId,
      sessionId: context.sessionId,
      resource,
      action,
      allowed: decision.allowed,
      reason: decision.reason,
      riskScore: decision.riskScore,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };

    // Emit for audit logging
    logger.info('Access attempt', attempt);

    // Record metrics
    this.metrics.record('apiErrors', decision.allowed ? 0 : 1, {
      type: 'access_denied',
      resource,
      action,
    });
  }

  /**
   * Update session activity
   */
  private updateSession(context: SecurityContext): void {
    context.timestamp = new Date();
    this.sessions.set(context.sessionId, context);
  }

  /**
   * Setup default security policies
   */
  private setupDefaultPolicies(): void {
    // Allow authenticated users to access their own todos
    this.registerPolicy({
      id: 'own-todos',
      name: 'Access own todos',
      description: 'Users can access their own todos',
      resource: 'todo:*',
      action: '*',
      conditions: [
        {
          type: 'attribute',
          operator: 'eq',
          field: 'ownerId',
          value: '${userId}',
        },
      ],
      effect: 'allow',
      priority: 100,
    });

    // Deny high-risk actions
    this.registerPolicy({
      id: 'high-risk-deny',
      name: 'Deny high risk actions',
      description: 'Deny actions when risk score is too high',
      resource: '*',
      action: '*',
      conditions: [
        {
          type: 'risk',
          operator: 'gt',
          field: 'riskScore',
          value: 0.8,
        },
      ],
      effect: 'deny',
      priority: 1000,
    });

    // Time-based access control
    this.registerPolicy({
      id: 'business-hours',
      name: 'Business hours access',
      description: 'Restrict certain actions to business hours',
      resource: 'admin:*',
      action: '*',
      conditions: [
        {
          type: 'time',
          operator: 'in',
          field: 'hour',
          value: [9, 10, 11, 12, 13, 14, 15, 16, 17],
        },
      ],
      effect: 'allow',
      priority: 50,
    });
  }

  /**
   * Register a security policy
   */
  registerPolicy(policy: PolicyRule): void {
    this.policies.set(policy.id, policy);
    logger.info(`Registered security policy: ${policy.name}`);
  }

  /**
   * Revoke a session
   */
  revokeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`Session revoked: ${sessionId}`);
  }

  /**
   * Get active sessions for a user
   */
  getUserSessions(userId: string): SecurityContext[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId);
  }
}

/**
 * Risk Analysis Engine
 */
class RiskAnalyzer {
  /**
   * Analyze authentication risk
   */
  async analyzeAuthenticationRisk(context: SecurityContext): Promise<number> {
    let riskScore = 0;

    // Check for suspicious IP
    if (await this.isSuspiciousIP(context.ipAddress)) {
      riskScore += 0.3;
    }

    // Check for unusual device
    if (context.deviceId && await this.isNewDevice(context.userId, context.deviceId)) {
      riskScore += 0.2;
    }

    // Check for unusual time
    if (this.isUnusualTime(context.timestamp)) {
      riskScore += 0.1;
    }

    // Check for rapid authentication attempts
    if (await this.hasRapidAuthAttempts(context.userId)) {
      riskScore += 0.2;
    }

    return Math.min(riskScore, 1);
  }

  /**
   * Analyze behavior risk
   */
  async analyzeBehavior(
    context: SecurityContext,
    behavior: { resource: string; action: string }
  ): Promise<number> {
    let riskScore = context.riskScore;

    // Check for unusual access pattern
    if (await this.isUnusualAccess(context.userId, behavior)) {
      riskScore += 0.1;
    }

    // Check for privilege escalation attempt
    if (this.isPrivilegeEscalation(behavior)) {
      riskScore += 0.3;
    }

    // Decay risk over time for good behavior
    const timeSinceAuth = Date.now() - context.timestamp.getTime();
    const decayFactor = Math.max(0, 1 - (timeSinceAuth / 3600000)); // 1 hour decay
    riskScore *= (0.9 + 0.1 * decayFactor);

    return Math.min(riskScore, 1);
  }

  private async isSuspiciousIP(ipAddress: string): Promise<boolean> {
    // In real implementation, would check against threat intelligence
    return false;
  }

  private async isNewDevice(userId: string, deviceId: string): Promise<boolean> {
    // In real implementation, would check device history
    return false;
  }

  private isUnusualTime(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    return hour < 6 || hour > 22; // Outside normal hours
  }

  private async hasRapidAuthAttempts(userId: string): Promise<boolean> {
    // In real implementation, would check auth history
    return false;
  }

  private async isUnusualAccess(
    userId: string,
    behavior: { resource: string; action: string }
  ): Promise<boolean> {
    // In real implementation, would check access patterns
    return false;
  }

  private isPrivilegeEscalation(behavior: { resource: string; action: string }): boolean {
    return behavior.resource.startsWith('admin:') || 
           behavior.action === 'grant_permission';
  }
}