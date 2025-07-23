import { getGoogle, getOAuthState, getCodeVerifier, validateOAuthState, handleGoogleOAuth, generateSessionToken, createSession, setSessionTokenCookie, type GoogleUserInfo } from '@/lib/auth';
import { decodeIdToken } from 'arctic';
import type { OAuth2Tokens } from 'arctic';
import { type H3Event } from 'h3';

/**
 * Handle Google OAuth callback using H3
 * GET /auth/google/callback
 */
export async function handleGoogleCallback(event: H3Event): Promise<Response> {
	try {
		const url = new URL(event.node.req.url!, `http://${event.node.req.headers.host}`);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');

		// Validate required parameters
		if (!code || !state) {
			console.error('Missing code or state parameters');
			return new Response('Bad Request: Missing parameters', { status: 400 });
		}

		// Get stored state and code verifier from H3 cookies
		const storedState = getOAuthState(event, 'google');
		const codeVerifier = getCodeVerifier(event, 'google');

		// Validate state (CSRF protection)
		if (!validateOAuthState(state, storedState) || !codeVerifier) {
			console.error('Invalid state or missing code verifier');
			return new Response('Bad Request: Invalid state', { status: 400 });
		}

		// Exchange authorization code for tokens
		let tokens: OAuth2Tokens;
		try {
			tokens = await getGoogle().validateAuthorizationCode(code, codeVerifier);
		} catch (error) {
			console.error('Error validating authorization code:', error);
			return new Response('Bad Request: Invalid authorization code', { status: 400 });
		}

		// Decode the ID token to get user information
		const claims = decodeIdToken(tokens.idToken()) as any;
		const googleUserInfo: GoogleUserInfo = {
			sub: claims.sub,
			name: claims.name,
			email: claims.email,
			picture: claims.picture,
		};

		// Handle user creation/authentication
		let user;
		try {
			user = await handleGoogleOAuth(googleUserInfo);
		} catch (error) {
			console.error('Error handling Google OAuth:', error);
			return new Response('Internal Server Error: User creation failed', { status: 500 });
		}

		// Create new session
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, user.id);

		// Set session cookie using H3
		setSessionTokenCookie(event, sessionToken, session.expiresAt);

		// Create success response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: '/', // Redirect to app homepage
			},
		});

		return response;
	} catch (error) {
		console.error('Unexpected error in Google callback:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}