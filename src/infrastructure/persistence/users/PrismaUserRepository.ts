import { PrismaClient, type User as PrismaUser } from '@prisma/client';
import type { UserRepository } from '../../../domain/users/repositories/UserRepository.js';
import { User } from '../../../domain/users/aggregates/User.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const userData = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!userData) return null;

    return this.mapToDomainEntity(userData);
  }

  async findByEmail(email: string): Promise<User | null> {
    const userData = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!userData) return null;

    return this.mapToDomainEntity(userData);
  }

  async save(user: User): Promise<void> {
    const data = {
      email: user.email,
      name: user.name,
    };

    await this.prisma.user.upsert({
      where: { id: user.id },
      update: data,
      create: {
        id: user.id,
        ...data,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  private mapToDomainEntity(userData: PrismaUser): User {
    return new User(
      userData.id,
      userData.email,
      userData.name,
      userData.createdAt,
      userData.updatedAt
    );
  }
}