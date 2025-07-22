import { builder } from '../builder.js';
import prisma from '@/lib/prisma';

// Input types for authentication
export const RegisterUserInput = builder.inputType('RegisterUserInput', {
	fields: (t) => ({
		email: t.string({
			required: true,
			validate: {
				email: true,
				maxLength: 254,
			}
		}),
		password: t.string({
			required: true,
			validate: {
				minLength: 6,
				maxLength: 128,
			}
		}),
		name: t.string({
			required: false,
			validate: {
				maxLength: 100,
			}
		}),
	}),
});

export const LoginUserInput = builder.inputType('LoginUserInput', {
	fields: (t) => ({
		email: t.string({
			required: true,
			validate: {
				email: true,
			}
		}),
		password: t.string({
			required: true,
		}),
	}),
});

export const UpdateProfileInput = builder.inputType('UpdateProfileInput', {
	fields: (t) => ({
		name: t.string({
			required: false,
			validate: {
				maxLength: 100,
			}
		}),
		email: t.string({
			required: false,
			validate: {
				email: true,
				maxLength: 254,
			}
		}),
	}),
});

export const ChangePasswordInput = builder.inputType('ChangePasswordInput', {
	fields: (t) => ({
		currentPassword: t.string({
			required: true,
		}),
		newPassword: t.string({
			required: true,
			validate: {
				minLength: 6,
				maxLength: 128,
			}
		}),
	}),
});

// Output types
interface AuthPayloadRoot {
	userId?: string;
	message?: string;
}

export const AuthPayload = builder.objectType('AuthPayload' as any, {
	fields: (t) => ({
		user: t.prismaField({
			type: 'User',
			nullable: true,
			resolve: async (query, root: AuthPayloadRoot) => {
				if (!root.userId) return null;
				return prisma.user.findUnique({ where: { id: root.userId }, ...query });
			},
		}),
		success: t.boolean({
			resolve: () => true,
		}),
		message: t.string({
			nullable: true,
			resolve: (root: AuthPayloadRoot) => root.message || null,
		}),
	}),
});

// Error handling
export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

// Register error types with Pothos
builder.objectType(AuthenticationError, {
	name: 'AuthenticationError',
	fields: (t) => ({
		message: t.exposeString('message'),
		name: t.exposeString('name'),
	}),
});

builder.objectType(ValidationError, {
	name: 'ValidationError', 
	fields: (t) => ({
		message: t.exposeString('message'),
		name: t.exposeString('name'),
	}),
});