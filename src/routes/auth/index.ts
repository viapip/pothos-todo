// Import handlers
import { handleGoogleLogin } from './google';
import { handleGoogleCallback } from './google-callback';
import { handleGitHubLogin } from './github';
import { handleGitHubCallback } from './github-callback';
import { handleLogout, handleLogoutAll } from './logout';

// Re-export handlers
export { handleGoogleLogin } from './google';
export { handleGoogleCallback } from './google-callback';
export { handleGitHubLogin } from './github';
export { handleGitHubCallback } from './github-callback';
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