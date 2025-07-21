// Google OAuth routes
export { handleGoogleLogin } from './google';
export { handleGoogleCallback } from './google-callback';

// GitHub OAuth routes
export { handleGitHubLogin } from './github';
export { handleGitHubCallback } from './github-callback';

// Logout routes
export { handleLogout, handleLogoutAll } from './logout';

/**
 * Route handler mapping for auth endpoints
 */
export const authRoutes = {
	'/auth/google': { GET: handleGoogleLogin },
	'/auth/google/callback': { GET: handleGoogleCallback },
	'/auth/github': { GET: handleGitHubLogin },
	'/auth/github/callback': { GET: handleGitHubCallback },
	'/auth/logout': { POST: handleLogout },
	'/auth/logout/all': { POST: handleLogoutAll },
} as const;