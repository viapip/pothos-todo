import { builder } from '../builder.js';
import { UserService } from '@/lib/auth/user-service';
import { invalidateAllUserSessions, createH3Session, clearH3Session } from '@/lib/auth';
import type { H3Event } from 'h3';

// Helper to get H3 event from context
function getH3EventFromContext(context: any): H3Event | null {
	// The H3 event should be available directly in the GraphQL context
	if (context && context.h3Event) {
		return context.h3Event as H3Event;
	}
	return null;
}

builder.mutationFields((t) => ({
	registerUser: t.field({
		type: 'Boolean',
		args: {
			email: t.arg.string({ required: true }),
			password: t.arg.string({ required: true }),
			name: t.arg.string({ required: false }),
		},
		resolve: async (_parent, args, context) => {
			try {
				const { user } = await UserService.registerUser(
					args.email,
					args.password,
					args.name || undefined
				);

				// Create H3 session
				const event = getH3EventFromContext(context);
				if (event) {
					await createH3Session(event, user.id);
				}

				return true;
			} catch (error) {
				console.error('Registration failed:', error);
				throw new Error(error instanceof Error ? error.message : 'Registration failed');
			}
		},
	}),

	loginUser: t.field({
		type: 'Boolean',
		args: {
			email: t.arg.string({ required: true }),
			password: t.arg.string({ required: true }),
		},
		resolve: async (_parent, args, context) => {
			try {
				const { user } = await UserService.loginUser(
					args.email,
					args.password
				);

				// Create H3 session
				const event = getH3EventFromContext(context);
				if (event) {
					await createH3Session(event, user.id);
				}

				return true;
			} catch (error) {
				console.error('Login failed:', error);
				throw new Error(error instanceof Error ? error.message : 'Login failed');
			}
		},
	}),

	logoutUser: t.field({
		type: 'Boolean',
		authScopes: {
			authenticated: true,
		},
		resolve: async (_parent, _args, context) => {
			try {
				// Clear H3 session
				const event = getH3EventFromContext(context);
				if (event) {
					await clearH3Session(event);
				}

				return true;
			} catch (error) {
				console.error('Logout failed:', error);
				return false;
			}
		},
	}),

	updateProfile: t.field({
		type: 'Boolean',
		args: {
			name: t.arg.string({ required: false }),
			email: t.arg.string({ required: false }),
		},
		authScopes: {
			authenticated: true,
		},
		resolve: async (_parent, args, context) => {
			if (!context.session?.user) {
				throw new Error('Not authenticated');
			}

			try {
				const updateData: { name?: string; email?: string } = {};
				if (args.name) updateData.name = args.name;
				if (args.email) updateData.email = args.email;
				
				await UserService.updateProfile(context.session.user.id, updateData);

				return true;
			} catch (error) {
				console.error('Profile update failed:', error);
				throw new Error(error instanceof Error ? error.message : 'Profile update failed');
			}
		},
	}),

	changePassword: t.field({
		type: 'Boolean',
		args: {
			currentPassword: t.arg.string({ required: true }),
			newPassword: t.arg.string({ required: true }),
		},
		authScopes: {
			authenticated: true,
		},
		resolve: async (_parent, args, context) => {
			if (!context.session?.user) {
				throw new Error('Not authenticated');
			}

			try {
				await UserService.changePassword(
					context.session.user.id,
					args.currentPassword,
					args.newPassword
				);

				return true;
			} catch (error) {
				console.error('Password change failed:', error);
				throw new Error(error instanceof Error ? error.message : 'Password change failed');
			}
		},
	}),

	deleteAccount: t.field({
		type: 'Boolean',
		authScopes: {
			authenticated: true,
		},
		resolve: async (_parent, _args, context) => {
			if (!context.session?.user) {
				throw new Error('Not authenticated');
			}

			try {
				// Invalidate all user sessions first
				await invalidateAllUserSessions(context.session.user.id);

				// Delete account
				await UserService.deleteAccount(context.session.user.id);

				// Clear H3 session
				const event = getH3EventFromContext(context);
				if (event) {
					await clearH3Session(event);
				}

				return true;
			} catch (error) {
				console.error('Account deletion failed:', error);
				throw new Error(error instanceof Error ? error.message : 'Account deletion failed');
			}
		},
	}),
}));