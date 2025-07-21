import { Google, GitHub } from 'arctic';

// Environment variables (these should be set in your .env file)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// Base URL for your application
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Google OAuth provider configuration
 */
export const google = new Google(
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	`${BASE_URL}/auth/google/callback`
);

/**
 * GitHub OAuth provider configuration  
 */
export const github = new GitHub(
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET,
	`${BASE_URL}/auth/github/callback`
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
 * Set OAuth state cookie
 */
export function setOAuthStateCookie(response: any, state: string, provider: 'google' | 'github'): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const cookieName = `${provider}_oauth_state`;
	const cookieValue = `${cookieName}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isProduction ? '; Secure' : ''}`;
	
	if (response.headers) {
		response.headers.append('Set-Cookie', cookieValue);
	} else if (response.setHeader) {
		response.setHeader('Set-Cookie', cookieValue);
	}
}

/**
 * Set code verifier cookie (for Google PKCE)
 */
export function setCodeVerifierCookie(response: any, codeVerifier: string, provider: 'google'): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const cookieName = `${provider}_code_verifier`;
	const cookieValue = `${cookieName}=${codeVerifier}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isProduction ? '; Secure' : ''}`;
	
	if (response.headers) {
		response.headers.append('Set-Cookie', cookieValue);
	} else if (response.setHeader) {
		response.setHeader('Set-Cookie', cookieValue);
	}
}

/**
 * Parse OAuth state from cookies
 */
export function parseOAuthState(cookieHeader: string | null, provider: 'google' | 'github'): string | null {
	if (!cookieHeader) return null;
	
	const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
	const stateCookie = cookies.find(cookie => cookie.startsWith(`${provider}_oauth_state=`));
	
	if (!stateCookie) return null;
	
	return stateCookie.split('=')[1] || null;
}

/**
 * Parse code verifier from cookies (for Google PKCE)
 */
export function parseCodeVerifier(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	
	const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
	const verifierCookie = cookies.find(cookie => cookie.startsWith('google_code_verifier='));
	
	if (!verifierCookie) return null;
	
	return verifierCookie.split('=')[1] || null;
}

/**
 * Validate OAuth state (CSRF protection)
 */
export function validateOAuthState(providedState: string | null, storedState: string | null): boolean {
	if (!providedState || !storedState) return false;
	return providedState === storedState;
}