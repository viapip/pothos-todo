/**
 * Global test setup for Vitest
 */

import { vi, afterEach } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.SESSION_SECRET = 'test-session-secret-key-for-testing-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';

// Mock console methods in tests to reduce noise
if (process.env.VITEST_QUIET) {
  vi.stubGlobal('console', {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  });
}

// Global test timeout
vi.setConfig({ testTimeout: 10000 });

// Clean up after tests
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});