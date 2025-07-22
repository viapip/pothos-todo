/**
 * JWT Token Manager
 * Advanced JWT token management with refresh tokens, blacklisting, and security features
 */

import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { logger } from '../../logger.js';
import { authTracer } from '../tracing/custom-spans.js';
import { Role } from './rbac.js';

// ================================
// Types and Interfaces
// ================================

export interface JWTPayload {
  sub: string; // Subject (user ID)
  iat: number; // Issued at
  exp: number; // Expiry
  jti: string; // JWT ID (unique identifier)
  aud: string; // Audience
  iss: string; // Issuer
  type: 'access' | 'refresh';
  roles: Role[];
  permissions: string[];
  sessionId?: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  expired?: boolean;
  blacklisted?: boolean;
}

export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string; // e.g., '15m'
  refreshTokenExpiry: string; // e.g., '7d'
  issuer: string;
  audience: string;
  algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  enableBlacklist: boolean;
  enableRotation: boolean;
  maxConcurrentSessions: number;
}

// ================================
// JWT Token Manager
// ================================

export class JWTTokenManager {
  private config: JWTConfig;
  private tokenBlacklist = new Map<string, Date>(); // jti -> expiry
  private userSessions = new Map<string, Set<string>>(); // userId -> Set<jti>
  private refreshTokens = new Map<string, {
    userId: string;
    deviceId?: string;
    createdAt: Date;
    lastUsed: Date;
  }>();

  constructor(config: JWTConfig) {
    this.config = config;
    this.startCleanupTasks();
  }

  // ================================
  // Token Generation
  // ================================

  async generateTokenPair(
    userId: string,
    roles: Role[],
    permissions: string[],
    options: {
      sessionId?: string;
      deviceId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<TokenPair> {
    const span = authTracer.traceSessionCreation(userId, 'jwt');
    
    try {
      const now = Math.floor(Date.now() / 1000);
      const accessJti = this.generateJTI();
      const refreshJti = this.generateJTI();

      // Calculate expiry times
      const accessExpiry = this.parseExpiry(this.config.accessTokenExpiry);
      const refreshExpiry = this.parseExpiry(this.config.refreshTokenExpiry);

      // Create access token payload
      const accessPayload: JWTPayload = {
        sub: userId,
        iat: now,
        exp: now + accessExpiry,
        jti: accessJti,
        aud: this.config.audience,
        iss: this.config.issuer,
        type: 'access',
        roles,
        permissions,
        sessionId: options.sessionId,
        deviceId: options.deviceId,
        metadata: options.metadata,
      };

      // Create refresh token payload
      const refreshPayload: JWTPayload = {
        sub: userId,
        iat: now,
        exp: now + refreshExpiry,
        jti: refreshJti,
        aud: this.config.audience,
        iss: this.config.issuer,
        type: 'refresh',
        roles: [],
        permissions: [],
        sessionId: options.sessionId,
        deviceId: options.deviceId,
      };

      // Sign tokens
      const accessToken = jwt.sign(accessPayload, this.config.accessTokenSecret, {
        algorithm: this.config.algorithm,
      });

      const refreshToken = jwt.sign(refreshPayload, this.config.refreshTokenSecret, {
        algorithm: this.config.algorithm,
      });

      // Store refresh token info
      this.refreshTokens.set(refreshJti, {
        userId,
        deviceId: options.deviceId,
        createdAt: new Date(),
        lastUsed: new Date(),
      });

      // Track user sessions
      if (this.config.maxConcurrentSessions > 0) {
        this.trackUserSession(userId, accessJti);
      }

      const tokenPair: TokenPair = {
        accessToken,
        refreshToken,
        accessTokenExpiry: new Date((now + accessExpiry) * 1000),
        refreshTokenExpiry: new Date((now + refreshExpiry) * 1000),
      };

      span.setAttributes({
        'token.access_expiry': accessExpiry,
        'token.refresh_expiry': refreshExpiry,
        'token.device_id': options.deviceId || 'unknown',
      });
      span.setStatus({ code: 1 });
      span.end();

      logger.info('Token pair generated', {
        userId,
        deviceId: options.deviceId,
        sessionId: options.sessionId,
        accessExpiry: tokenPair.accessTokenExpiry,
        refreshExpiry: tokenPair.refreshTokenExpiry,
      });

      return tokenPair;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message });
      span.end();
      throw error;
    }
  }

  // ================================
  // Token Validation
  // ================================

  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    const span = authTracer.traceTokenValidation('jwt');
    
    try {
      const payload = jwt.verify(token, this.config.accessTokenSecret, {
        audience: this.config.audience,
        issuer: this.config.issuer,
        algorithms: [this.config.algorithm],
      }) as JWTPayload;

      // Check if token is blacklisted
      if (this.config.enableBlacklist && this.isBlacklisted(payload.jti)) {
        span.setAttributes({
          'token.validation_result': 'blacklisted',
        });
        span.setStatus({ code: 1 });
        span.end();
        
        return {
          valid: false,
          error: 'Token is blacklisted',
          blacklisted: true,
        };
      }

      // Verify token type
      if (payload.type !== 'access') {
        span.setAttributes({
          'token.validation_result': 'invalid_type',
        });
        span.setStatus({ code: 1 });
        span.end();
        
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }

      span.setAttributes({
        'token.validation_result': 'valid',
        'user.id': payload.sub,
        'token.roles': payload.roles.join(','),
      });
      span.setStatus({ code: 1 });
      span.end();

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const expired = errorMessage.includes('expired');

      span.setAttributes({
        'token.validation_result': expired ? 'expired' : 'invalid',
        'token.error': errorMessage,
      });
      span.setStatus({ code: 1 });
      span.end();

      return {
        valid: false,
        error: errorMessage,
        expired,
      };
    }
  }

  async validateRefreshToken(token: string): Promise<TokenValidationResult> {
    const span = authTracer.traceTokenValidation('jwt');
    
    try {
      const payload = jwt.verify(token, this.config.refreshTokenSecret, {
        audience: this.config.audience,
        issuer: this.config.issuer,
        algorithms: [this.config.algorithm],
      }) as JWTPayload;

      // Check if refresh token exists and is valid
      const tokenInfo = this.refreshTokens.get(payload.jti);
      if (!tokenInfo) {
        span.setAttributes({
          'token.validation_result': 'not_found',
        });
        span.setStatus({ code: 1 });
        span.end();
        
        return {
          valid: false,
          error: 'Refresh token not found',
        };
      }

      // Verify token type
      if (payload.type !== 'refresh') {
        span.setAttributes({
          'token.validation_result': 'invalid_type',
        });
        span.setStatus({ code: 1 });
        span.end();
        
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }

      // Update last used timestamp
      tokenInfo.lastUsed = new Date();

      span.setAttributes({
        'token.validation_result': 'valid',
        'user.id': payload.sub,
      });
      span.setStatus({ code: 1 });
      span.end();

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      const expired = errorMessage.includes('expired');

      span.setAttributes({
        'token.validation_result': expired ? 'expired' : 'invalid',
        'token.error': errorMessage,
      });
      span.setStatus({ code: 1 });
      span.end();

      return {
        valid: false,
        error: errorMessage,
        expired,
      };
    }
  }

  // ================================
  // Token Refresh
  // ================================

  async refreshTokenPair(
    refreshToken: string,
    roles: Role[],
    permissions: string[]
  ): Promise<TokenPair> {
    const validation = await this.validateRefreshToken(refreshToken);
    
    if (!validation.valid || !validation.payload) {
      throw new Error(`Invalid refresh token: ${validation.error || 'Unknown error'}`);
    }

    const { payload } = validation;

    // Generate new token pair
    const newTokenPair = await this.generateTokenPair(
      payload.sub,
      roles,
      permissions,
      {
        sessionId: payload.sessionId ?? undefined,
        deviceId: payload.deviceId ?? undefined,
        metadata: payload.metadata ?? undefined,
      }
    );

    // If rotation is enabled, invalidate old refresh token
    if (this.config.enableRotation) {
      this.invalidateRefreshToken(payload.jti);
    }

    logger.info('Token pair refreshed', {
      userId: payload.sub,
      deviceId: payload.deviceId ?? 'unknown',
      oldJti: payload.jti,
    });

    return newTokenPair;
  }

  // ================================
  // Token Invalidation
  // ================================

  blacklistToken(jti: string, expiry?: Date): void {
    if (!this.config.enableBlacklist) {
      return;
    }

    const expiryDate = expiry || new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
    this.tokenBlacklist.set(jti, expiryDate);
    
    logger.debug('Token blacklisted', { jti, expiry: expiryDate });
  }

  invalidateRefreshToken(jti: string): void {
    const removed = this.refreshTokens.delete(jti);
    
    if (removed) {
      logger.debug('Refresh token invalidated', { jti });
    }
  }

  invalidateUserSessions(userId: string): void {
    const userTokens = this.userSessions.get(userId);
    
    if (userTokens) {
      userTokens.forEach(jti => {
        this.blacklistToken(jti);
      });
      
      this.userSessions.delete(userId);
      
      logger.info('All user sessions invalidated', { userId, count: userTokens.size });
    }
  }

  invalidateDeviceSessions(userId: string, deviceId: string): void {
    // Find and invalidate all refresh tokens for this device
    for (const [jti, tokenInfo] of this.refreshTokens.entries()) {
      if (tokenInfo.userId === userId && tokenInfo.deviceId === deviceId) {
        this.invalidateRefreshToken(jti);
      }
    }

    logger.info('Device sessions invalidated', { userId, deviceId });
  }

  // ================================
  // Token Inspection
  // ================================

  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.error('Failed to decode token', { error });
      return null;
    }
  }

  getTokenExpiry(token: string): Date | null {
    const payload = this.decodeToken(token);
    return payload ? new Date(payload.exp * 1000) : null;
  }

  isTokenExpired(token: string): boolean {
    const expiry = this.getTokenExpiry(token);
    return expiry ? expiry < new Date() : true;
  }

  private isBlacklisted(jti: string): boolean {
    const expiry = this.tokenBlacklist.get(jti);
    
    if (!expiry) {
      return false;
    }

    // Check if blacklist entry is expired
    if (expiry < new Date()) {
      this.tokenBlacklist.delete(jti);
      return false;
    }

    return true;
  }

  // ================================
  // Session Management
  // ================================

  private trackUserSession(userId: string, jti: string): void {
    let userTokens = this.userSessions.get(userId);
    
    if (!userTokens) {
      userTokens = new Set();
      this.userSessions.set(userId, userTokens);
    }

    userTokens.add(jti);

    // Enforce max concurrent sessions
    if (userTokens.size > this.config.maxConcurrentSessions) {
      const tokensArray = Array.from(userTokens);
      const oldestToken = tokensArray[0];
      
      this.blacklistToken(oldestToken);
      userTokens.delete(oldestToken);
      
      logger.info('Session limit enforced', {
        userId,
        limit: this.config.maxConcurrentSessions,
        blacklistedToken: oldestToken,
      });
    }
  }

  getUserSessionCount(userId: string): number {
    return this.userSessions.get(userId)?.size || 0;
  }

  getUserRefreshTokens(userId: string): Array<{
    jti: string;
    deviceId?: string;
    createdAt: Date;
    lastUsed: Date;
  }> {
    const tokens = [];
    
    for (const [jti, tokenInfo] of this.refreshTokens.entries()) {
      if (tokenInfo.userId === userId) {
        tokens.push({ jti, ...tokenInfo });
      }
    }
    
    return tokens.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
  }

  // ================================
  // Utility Methods
  // ================================

  private generateJTI(): string {
    return randomBytes(16).toString('hex');
  }

  private parseExpiry(expiry: string): number {
    // Parse expiry strings like '15m', '7d', '1h'
    const match = expiry.match(/^(\d+)([smhd])$/);
    
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 60 * 60 * 24,
    };

    return value * multipliers[unit as keyof typeof multipliers];
  }

  // ================================
  // Cleanup and Maintenance
  // ================================

  private startCleanupTasks(): void {
    // Clean up expired blacklist entries every hour
    setInterval(() => {
      this.cleanupBlacklist();
    }, 60 * 60 * 1000);

    // Clean up expired refresh tokens every 6 hours
    setInterval(() => {
      this.cleanupRefreshTokens();
    }, 6 * 60 * 60 * 1000);
  }

  private cleanupBlacklist(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [jti, expiry] of this.tokenBlacklist.entries()) {
      if (expiry < now) {
        this.tokenBlacklist.delete(jti);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Blacklist cleanup completed', { cleaned });
    }
  }

  private cleanupRefreshTokens(): void {
    const now = new Date();
    const maxAge = this.parseExpiry(this.config.refreshTokenExpiry) * 1000;
    let cleaned = 0;

    for (const [jti, tokenInfo] of this.refreshTokens.entries()) {
      const age = now.getTime() - tokenInfo.createdAt.getTime();
      
      if (age > maxAge) {
        this.refreshTokens.delete(jti);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Refresh token cleanup completed', { cleaned });
    }
  }

  // ================================
  // Statistics and Monitoring
  // ================================

  getTokenStatistics() {
    return {
      blacklistedTokens: this.tokenBlacklist.size,
      activeRefreshTokens: this.refreshTokens.size,
      activeSessions: this.userSessions.size,
      totalUserSessions: Array.from(this.userSessions.values()).reduce(
        (sum, sessions) => sum + sessions.size, 0
      ),
    };
  }
}

// ================================
// Default Configuration
// ================================

export function createDefaultJWTConfig(): JWTConfig {
  return {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-change-me',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-me',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'pothos-graphql-api',
    audience: process.env.JWT_AUDIENCE || 'pothos-graphql-client',
    algorithm: (process.env.JWT_ALGORITHM as 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512') || 'HS256',
    enableBlacklist: process.env.JWT_ENABLE_BLACKLIST !== 'false',
    enableRotation: process.env.JWT_ENABLE_ROTATION !== 'false',
    maxConcurrentSessions: parseInt(process.env.JWT_MAX_SESSIONS || '5'),
  };
}

// ================================
// Singleton Instance
// ================================

let jwtManager: JWTTokenManager | null = null;

export function getJWTTokenManager(): JWTTokenManager {
  if (!jwtManager) {
    jwtManager = new JWTTokenManager(createDefaultJWTConfig());
  }
  return jwtManager;
}