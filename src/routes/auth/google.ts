import { google, generateState, generateCodeVerifier, setOAuthStateCookie, setCodeVerifierCookie } from '@/lib/auth';

/**
 * Initiate Google OAuth flow
 * GET /auth/google
 */
export async function handleGoogleLogin(request: Request): Promise<Response> {
	try {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		
		// Create authorization URL with PKCE
		const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: url.toString(),
			},
		});
		
		// Set state and code verifier cookies for security
		setOAuthStateCookie(response, state, 'google');
		setCodeVerifierCookie(response, codeVerifier, 'google');
		
		return response;
	} catch (error) {
		console.error('Error initiating Google OAuth:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}