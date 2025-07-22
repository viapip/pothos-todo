// Session management
export {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession,
	invalidateAllUserSessions,
	setSessionTokenCookie,
	deleteSessionTokenCookie,
	getSessionToken,
	getCurrentSession,
	getCurrentSessionFromEvent,
	type SessionWithUser,
} from './session';

// OAuth providers
export {
	google,
	github,
	generateState,
	generateCodeVerifier,
	setOAuthStateCookie,
	setCodeVerifierCookie,
	getOAuthState,
	getCodeVerifier,
	validateOAuthState,
} from './oauth';

// Password management
export {
	hashPassword,
	verifyPassword,
	validatePassword,
	validateEmail,
} from './password';

// User service
export { UserService } from './user-service';

// User management
export {
	getUserByGoogleId,
	getUserByGitHubId,
	getUserByEmail,
	getUserById,
	createUserWithGoogle,
	createUserWithGitHub,
	linkGoogleToUser,
	linkGitHubToUser,
	handleGoogleOAuth,
	handleGitHubOAuth,
	type GoogleUserInfo,
	type GitHubUserInfo,
} from './user';