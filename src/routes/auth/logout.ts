import { getCurrentSessionFromEvent, invalidateSession, deleteSessionTokenCookie } from '@/lib/auth';
import type { H3Event } from 'h3';

/**
 * Handle user logout using H3
 * POST /auth/logout
 */
export async function handleLogout(event: H3Event): Promise<Response> {
	try {
		// Get current session from H3 event
		const sessionData = await getCurrentSessionFromEvent(event);
		
		if (!sessionData) {
			// User is not logged in
			return new Response('Unauthorized', { status: 401 });
		}
		
		// Invalidate the session in database
		await invalidateSession(sessionData.session.id);
		
		// Delete session cookie using H3
		deleteSessionTokenCookie(event);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: '/login', // Redirect to login page
			},
		});
		
		return response;
	} catch (error) {
		console.error('Error during logout:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}

/**
 * Handle logout for all sessions using H3 (logout from all devices)
 * POST /auth/logout/all
 */
export async function handleLogoutAll(event: H3Event): Promise<Response> {
	try {
		// Get current session from H3 event
		const sessionData = await getCurrentSessionFromEvent(event);
		
		if (!sessionData) {
			// User is not logged in
			return new Response('Unauthorized', { status: 401 });
		}
		
		// Invalidate all sessions for this user
		const { invalidateAllUserSessions } = await import('@/lib/auth');
		await invalidateAllUserSessions(sessionData.user.id);
		
		// Delete session cookie using H3
		deleteSessionTokenCookie(event);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: '/login', // Redirect to login page
			},
		});
		
		return response;
	} catch (error) {
		console.error('Error during logout all:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}