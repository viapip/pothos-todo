import { Google, GitHub } from 'arctic';
import { setCookie, getCookie, type H3Event } from 'h3';
import { getOAuthConfig, isProduction } from '@/config/index.js';

// Get configuration values using the centralized config system
const oauthConfig = getOAuthConfig();

// OAuth configuration from centralized config
const GOOGLE_CLIENT_ID = oauthConfig.google.clientId;
const GOOGLE_CLIENT_SECRET = oauthConfig.google.clientSecret;
const GOOGLE_REDIRECT_URI = oauthConfig.google.redirectUri;

const GITHUB_CLIENT_ID = oauthConfig.github.clientId;
const GITHUB_CLIENT_SECRET = oauthConfig.github.clientSecret;
const GITHUB_REDIRECT_URI = oauthConfig.github.redirectUri;

/**
 * Google OAuth provider configuration
 */
export const google = new Google(
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	GOOGLE_REDIRECT_URI
);

/**
 * GitHub OAuth provider configuration  
 */
export const github = new GitHub(
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET,
	GITHUB_REDIRECT_URI
);

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