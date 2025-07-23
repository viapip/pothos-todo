import { getGitHub, generateState, setOAuthStateCookie } from '@/lib/auth';
import { type H3Event } from 'h3';

/**
 * Initiate GitHub OAuth flow using H3
 * GET /auth/github
 */
export async function handleGitHubLogin(event: H3Event): Promise<Response> {
	try {
		const state = generateState();

		// Create authorization URL
		const url = getGitHub().createAuthorizationURL(state, ['user:email']);

		// Set state cookie using H3
		setOAuthStateCookie(event, state, 'github');

		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: url.toString(),
			},
		});

		return response;
	} catch (error) {
		console.error('Error initiating GitHub OAuth:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}