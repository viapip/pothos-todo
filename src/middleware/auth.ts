import { getCurrentSession, type SessionWithUser } from '@/lib/auth';
import type { Context } from '@/api/schema/builder';

/**
 * Authentication middleware for GraphQL Yoga
 * Validates session and sets user context
 */
export async function authMiddleware(request: Request): Promise<Partial<Context>> {
	try {
		// Get current session from request
		const sessionData: SessionWithUser | null = await getCurrentSession(request);
		
		// If no session found, return empty context
		if (!sessionData) {
			return {
				user: null,
				session: null,
			};
		}
		
		// Map Prisma User to domain User (if needed)
		// For now, we'll use Prisma User directly
		// In a real app, you might want to convert this to your domain User type
		const domainUser = sessionData.user as any; // Type casting for now
		
		return {
			user: domainUser,
			session: sessionData,
		};
	} catch (error) {
		console.error('Error in auth middleware:', error);
		
		// In case of error, return empty context
		return {
			user: null,
			session: null,
		};
	}
}

/**
 * Enhanced context factory that combines auth middleware with other context
 */
export function createGraphQLContext(container: any) {
	return async (request: Request): Promise<Context> => {
		// Get auth context
		const authContext = await authMiddleware(request);
		
		// Combine with other context data
		return {
			...authContext,
			container,
		} as Context;
	};
}

/**
 * CSRF protection middleware
 * Validates origin header for non-GET requests
 */
export function csrfMiddleware(request: Request): boolean {
	const method = request.method;
	const origin = request.headers.get('Origin');
	const host = request.headers.get('Host');
	
	// Allow GET and HEAD requests (they should be safe)
	if (method === 'GET' || method === 'HEAD') {
		return true;
	}
	
	// For other requests, validate origin
	if (!origin || !host) {
		return false;
	}
	
	// Extract hostname from origin
	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		return false;
	}
	
	// Check if origin matches host
	return originHost === host;
}

/**
 * Wrapper for GraphQL Yoga plugins/middleware integration
 */
export const luciaAuthPlugin = {
	/**
	 * Plugin for GraphQL Yoga to handle Lucia authentication
	 */
	onRequest: async (request: Request, context: any) => {
		// CSRF protection
		if (!csrfMiddleware(request)) {
			throw new Error('CSRF validation failed');
		}
		
		// Add auth context
		const authContext = await authMiddleware(request);
		Object.assign(context, authContext);
	},
};