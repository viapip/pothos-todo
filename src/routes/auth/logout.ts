import { getCurrentSession, invalidateSession, deleteSessionTokenCookie } from '@/lib/auth';

/**
 * Handle user logout
 * POST /auth/logout
 */
export async function handleLogout(request: Request): Promise<Response> {
	try {
		// Get current session
		const sessionData = await getCurrentSession(request);
		
		if (!sessionData) {
			// User is not logged in
			return new Response('Unauthorized', { status: 401 });
		}
		
		// Invalidate the session in database
		await invalidateSession(sessionData.session.id);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: '/login', // Redirect to login page
			},
		});
		
		// Delete session cookie
		deleteSessionTokenCookie(response);
		
		return response;
	} catch (error) {
		console.error('Error during logout:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}

/**
 * Handle logout for all sessions (logout from all devices)
 * POST /auth/logout/all
 */
export async function handleLogoutAll(request: Request): Promise<Response> {
	try {
		// Get current session
		const sessionData = await getCurrentSession(request);
		
		if (!sessionData) {
			// User is not logged in
			return new Response('Unauthorized', { status: 401 });
		}
		
		// Invalidate all sessions for this user
		const { invalidateAllUserSessions } = await import('@/lib/auth');
		await invalidateAllUserSessions(sessionData.user.id);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: '/login', // Redirect to login page
			},
		});
		
		// Delete session cookie
		deleteSessionTokenCookie(response);
		
		return response;
	} catch (error) {
		console.error('Error during logout all:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}