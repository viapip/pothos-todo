import { PrismaService, defaultPoolConfig } from '@/infrastructure/database/PrismaService.js';
import { env } from '@/config/env.validation.js';

// Create PrismaService with optimized pooling configuration
const prismaService = PrismaService.getInstance({
  ...defaultPoolConfig,
  connectionLimit: env.DATABASE_POOL_SIZE || 10,
  enableQueryLogging: env.NODE_ENV === 'development',
  enableMetrics: true,
});

// Export the Prisma client instance
const prisma = prismaService.getClient();

export default prisma;
export { prismaService };