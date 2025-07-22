/**
 * Integration tests for auth middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEvent } from 'h3';
import { authMiddleware } from '@/middleware/auth.js';
import { createTestUser } from '../../helpers/factories.js';
import { cleanupTestDatabase } from '../../helpers/database.js';

// Mock h3 session functions
vi.mock('@/lib/auth/index.js', () => ({
  getCurrentSessionFromEventH3: vi.fn(),
  clearH3Session: vi.fn(),
  updateH3SessionActivity: vi.fn(),
}));

describe('Auth Middleware Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('unauthenticated requests', () => {
    it('should handle request without session', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockReq = {
        method: 'GET',
        url: '/graphql',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isOk()).toBe(true);
      const context = result.unwrap();
      
      expect(context.user).toBeNull();
      expect(context.session).toBeNull();
      expect(context.h3Event).toBe(event);
    });

    it('should apply security headers', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockRes = {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      };

      const mockReq = {
        method: 'GET',
        url: '/graphql',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, mockRes as any);
      await authMiddleware(event);

      // Security headers should be applied (mocked in the middleware)
      expect(mockRes.setHeader).toHaveBeenCalled();
    });
  });

  describe('authenticated requests', () => {
    it('should handle valid session', async () => {
      const testUser = await createTestUser();
      const mockSession = {
        user: testUser,
        session: {
          id: 'session-123',
          userId: testUser.id,
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        }
      };

      const { getCurrentSessionFromEventH3, updateH3SessionActivity } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(mockSession as any);
      vi.mocked(updateH3SessionActivity).mockResolvedValue(undefined);

      const mockReq = {
        method: 'POST',
        url: '/graphql',
        headers: {
          'content-type': 'application/json',
          'host': 'localhost:4000'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isOk()).toBe(true);
      const context = result.unwrap();
      
      expect(context.user).toBeDefined();
      expect(context.user?.id).toBe(testUser.id);
      expect(context.user?.email).toBe(testUser.email);
      expect(context.session).toBe(mockSession);
      expect(updateH3SessionActivity).toHaveBeenCalled();
    });

    it('should handle expired session', async () => {
      const testUser = await createTestUser();
      const mockSession = {
        user: testUser,
        session: {
          id: 'session-123',
          userId: testUser.id,
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago (expired)
          expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        }
      };

      const { getCurrentSessionFromEventH3, clearH3Session } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(mockSession as any);
      vi.mocked(clearH3Session).mockResolvedValue(undefined);

      const mockReq = {
        method: 'POST',
        url: '/graphql',
        headers: {
          'host': 'localhost:4000'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('UNAUTHORIZED');
      expect(result.error.message).toBe('Session has expired');
      expect(clearH3Session).toHaveBeenCalled();
    });
  });

  describe('CSRF protection', () => {
    it('should allow safe HTTP methods without CSRF checks', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const safeMethod = ['GET', 'HEAD', 'OPTIONS'];
      
      for (const method of safeMethod) {
        const mockReq = {
          method,
          url: '/graphql',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' }
        };

        const event = createEvent(mockReq as any, {} as any);
        const result = await authMiddleware(event);

        expect(result.isOk()).toBe(true);
      }
    });

    it('should validate origin header for unsafe methods', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockReq = {
        method: 'POST',
        url: '/graphql',
        headers: {
          'origin': 'https://evil.com',
          'host': 'localhost:4000'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('FORBIDDEN');
    });

    it('should allow same-origin requests', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockReq = {
        method: 'POST',
        url: '/graphql',
        headers: {
          'origin': 'http://localhost:4000',
          'host': 'localhost:4000'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockReq = {
        method: 'GET',
        url: '/graphql',
        headers: {
          'user-agent': 'test-browser'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      // Make multiple requests within limit
      for (let i = 0; i < 3; i++) {
        const event = createEvent(mockReq as any, {} as any);
        const result = await authMiddleware(event);
        expect(result.isOk()).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    it('should handle middleware exceptions', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockRejectedValue(new Error('Database connection failed'));

      const mockReq = {
        method: 'GET',
        url: '/graphql',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('UNKNOWN');
    });

    it('should handle malformed requests gracefully', async () => {
      const { getCurrentSessionFromEventH3 } = await import('@/lib/auth/index.js');
      vi.mocked(getCurrentSessionFromEventH3).mockResolvedValue(null);

      const mockReq = {
        method: 'POST',
        url: '/graphql',
        headers: {
          'origin': 'not-a-valid-url',
          'host': 'localhost:4000'
        },
        socket: { remoteAddress: '127.0.0.1' }
      };

      const event = createEvent(mockReq as any, {} as any);
      const result = await authMiddleware(event);

      expect(result.isErr()).toBe(true);
      expect(result.error.code).toBe('FORBIDDEN');
    });
  });
});