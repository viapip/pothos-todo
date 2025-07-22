import prisma from '@/lib/prisma';
import { hashPassword, verifyPassword, validateEmail, validatePassword } from './password';
import { generateSessionToken, createSession } from './session';
import type { User } from '@prisma/client';

export class UserService {
	/**
	 * Register new user with email/password
	 */
	static async registerUser(email: string, password: string, name?: string): Promise<{ user: User }> {
		// Validate input
		const emailValidation = validateEmail(email);
		if (!emailValidation.isValid) {
			throw new Error(emailValidation.error);
		}

		const passwordValidation = validatePassword(password);
		if (!passwordValidation.isValid) {
			throw new Error(passwordValidation.error);
		}

		// Check if user already exists
		const existingUser = await prisma.user.findUnique({
			where: { email }
		});

		if (existingUser) {
			throw new Error('User with this email already exists');
		}

		// Hash password
		const hashedPassword = await hashPassword(password);

		// Create user
		const user = await prisma.user.create({
			data: {
				email,
				password: hashedPassword,
				name: name || null,
			}
		});

		// Note: Session management is now handled by H3 sessions in GraphQL mutations
		return { user };
	}

	/**
	 * Login user with email/password
	 */
	static async loginUser(email: string, password: string): Promise<{ user: User }> {
		// Validate input
		const emailValidation = validateEmail(email);
		if (!emailValidation.isValid) {
			throw new Error(emailValidation.error);
		}

		if (!password) {
			throw new Error('Password is required');
		}

		// Find user
		const user = await prisma.user.findUnique({
			where: { email }
		});

		if (!user) {
			throw new Error('Invalid email or password');
		}

		// Check if user has password set (not OAuth-only)
		if (!user.password) {
			throw new Error('User registered via OAuth. Please use OAuth login.');
		}

		// Verify password
		const isValidPassword = await verifyPassword(password, user.password);
		if (!isValidPassword) {
			throw new Error('Invalid email or password');
		}

		// Note: Session management is now handled by H3 sessions in GraphQL mutations
		return { user };
	}

	/**
	 * Update user profile
	 */
	static async updateProfile(userId: string, data: { name?: string; email?: string }): Promise<User> {
		// Validate email if provided
		if (data.email) {
			const emailValidation = validateEmail(data.email);
			if (!emailValidation.isValid) {
				throw new Error(emailValidation.error);
			}

			// Check if email is already taken by another user
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email }
			});

			if (existingUser && existingUser.id !== userId) {
				throw new Error('Email is already taken');
			}
		}

		return prisma.user.update({
			where: { id: userId },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.email && { email: data.email }),
				updatedAt: new Date(),
			}
		});
	}

	/**
	 * Change user password
	 */
	static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
		// Validate new password
		const passwordValidation = validatePassword(newPassword);
		if (!passwordValidation.isValid) {
			throw new Error(passwordValidation.error);
		}

		// Get user
		const user = await prisma.user.findUnique({
			where: { id: userId }
		});

		if (!user) {
			throw new Error('User not found');
		}

		// Check if user has password set
		if (!user.password) {
			throw new Error('User has no password set. Cannot change password.');
		}

		// Verify current password
		const isValidCurrentPassword = await verifyPassword(currentPassword, user.password);
		if (!isValidCurrentPassword) {
			throw new Error('Current password is incorrect');
		}

		// Hash new password
		const hashedNewPassword = await hashPassword(newPassword);

		// Update password
		await prisma.user.update({
			where: { id: userId },
			data: {
				password: hashedNewPassword,
				updatedAt: new Date(),
			}
		});
	}

	/**
	 * Delete user account
	 */
	static async deleteAccount(userId: string): Promise<void> {
		// Check if user exists
		const user = await prisma.user.findUnique({
			where: { id: userId }
		});

		if (!user) {
			throw new Error('User not found');
		}

		// Delete user (this will cascade and delete sessions, todos, etc.)
		await prisma.user.delete({
			where: { id: userId }
		});
	}
}