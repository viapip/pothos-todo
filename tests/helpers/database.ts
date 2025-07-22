/**
 * Database test helpers
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let testPrisma: PrismaClient | null = null;

/**
 * Get test database client
 */
export function getTestDatabase(): PrismaClient {
  if (!testPrisma) {
    testPrisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pothos_todo_test'
    });
  }
  return testPrisma;
}

/**
 * Clean up test database
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (testPrisma) {
    // Delete in reverse dependency order
    await testPrisma.session.deleteMany();
    await testPrisma.todo.deleteMany();
    await testPrisma.todoList.deleteMany();
    await testPrisma.user.deleteMany();
    await testPrisma.domainEvent.deleteMany();
  }
}

/**
 * Setup test database schema
 */
export async function setupTestDatabase(): Promise<void> {
  try {
    // Run migrations on test database
    await execAsync('bunx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

/**
 * Disconnect from test database
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}