import { Google, GitHub } from 'arctic';
import { setCookie, getCookie, type H3Event } from 'h3';
import { getServerConfig, getOAuthConfig, isProduction } from '@/config/index.js';

// Lazy initialization to avoid accessing config before it's loaded
let _google: Google | null = null;
let _github: GitHub | null = null;

function getOAuthClients() {
	if (!_google || !_github) {
		const serverConfig = getServerConfig();
		const oauthConfig = getOAuthConfig();

		_google = new Google(
			oauthConfig.google.clientId,
			oauthConfig.google.clientSecret,
			oauthConfig.google.redirectUri
		);

		_github = new GitHub(
			oauthConfig.github.clientId,
			oauthConfig.github.clientSecret,
			oauthConfig.github.redirectUri
		);
	}

	return { google: _google, github: _github };
}

/**
 * Google OAuth provider configuration
 */
export function getGoogle(): Google {
	return getOAuthClients().google;
}

/**
 * GitHub OAuth provider configuration  
 */
export function getGitHub(): GitHub {
	return getOAuthClients().github;
}

/**
 * Generate state parameter for OAuth (CSRF protection)
 */
export function generateState(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/**
 * Generate code verifier for PKCE (Google OAuth)
 */
export function generateCodeVerifier(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/**
 * Set OAuth state cookie using H3
 */
export function setOAuthStateCookie(event: H3Event, state: string, provider: 'google' | 'github'): void {
	const cookieName = `${provider}_oauth_state`;

	setCookie(event, cookieName, state, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 600, // 10 minutes
		secure: isProduction(),
	});
}

/**
 * Set code verifier cookie using H3 (for Google PKCE)
 */
export function setCodeVerifierCookie(event: H3Event, codeVerifier: string, provider: 'google'): void {
	const cookieName = `${provider}_code_verifier`;

	setCookie(event, cookieName, codeVerifier, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 600, // 10 minutes
		secure: isProduction(),
	});
}

/**
 * Get OAuth state from H3 event cookies
 */
export function getOAuthState(event: H3Event, provider: 'google' | 'github'): string | null {
	const cookieName = `${provider}_oauth_state`;
	return getCookie(event, cookieName) || null;
}

/**
 * Get code verifier from H3 event cookies (for Google PKCE)
 */
export function getCodeVerifier(event: H3Event, provider: 'google' = 'google'): string | null {
	const cookieName = `${provider}_code_verifier`;
	return getCookie(event, cookieName) || null;
}

/**
 * Validate OAuth state (CSRF protection)
 */
export function validateOAuthState(providedState: string | null, storedState: string | null): boolean {
	if (!providedState || !storedState) return false;
	return providedState === storedState;
}