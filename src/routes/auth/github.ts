import { github, generateState, setOAuthStateCookie } from '@/lib/auth';

/**
 * Initiate GitHub OAuth flow
 * GET /auth/github
 */
export async function handleGitHubLogin(request: Request): Promise<Response> {
	try {
		const state = generateState();
		
		// Create authorization URL
		const url = github.createAuthorizationURL(state, ['user:email']);
		
		// Create response with redirect
		const response = new Response(null, {
			status: 302,
			headers: {
				Location: url.toString(),
			},
		});
		
		// Set state cookie for security
		setOAuthStateCookie(response, state, 'github');
		
		return response;
	} catch (error) {
		console.error('Error initiating GitHub OAuth:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}