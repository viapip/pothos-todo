import { getGoogle, generateState, generateCodeVerifier, setOAuthStateCookie, setCodeVerifierCookie } from '@/lib/auth';
import { type H3Event } from 'h3';

/**
 * Initiate Google OAuth flow using H3
 * GET /auth/google
 */
export async function handleGoogleLogin(event: H3Event): Promise<Response> {
	try {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();

		// Create authorization URL with PKCE
		const url = getGoogle().createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

		// Set state and code verifier cookies using H3
		setOAuthStateCookie(event, state, 'google');
		setCodeVerifierCookie(event, codeVerifier, 'google');

		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: url.toString(),
			},
		});

		return response;
	} catch (error) {
		console.error('Error initiating Google OAuth:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}