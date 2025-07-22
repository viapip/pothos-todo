import prisma from '@/lib/prisma';
import type { User, Session } from '@prisma/client';

export interface SessionWithUser {
	session: Session;
	user: User;
}

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
	// Generate 24 bytes = 192 bits of entropy
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	
	// Convert to base64url for URL-safe token
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/**
 * Create a new session for a user
 */
export async function createSession(token: string, userId: string): Promise<Session> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_IN_SECONDS * 1000);
	
	const session = await prisma.session.create({
		data: {
			id: token,
			userId,
			expiresAt,
		},
	});
	
	return session;
}

/**
 * Validate a session token and return session with user data
 */
export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
	try {
		const result = await prisma.session.findUnique({
			where: { id: token },
			include: { user: true },
		});

		if (!result) {
			return null;
		}

		const { user, ...session } = result;

		// Check if session is expired
		if (new Date() >= session.expiresAt) {
			await invalidateSession(session.id);
			return null;
		}

		// Extend session if it expires in less than 15 days
		const fifteenDaysFromNow = new Date().getTime() + (15 * 24 * 60 * 60 * 1000);
		if (session.expiresAt.getTime() < fifteenDaysFromNow) {
			const newExpiresAt = new Date(Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000);
			await prisma.session.update({
				where: { id: session.id },
				data: { expiresAt: newExpiresAt },
			});
			session.expiresAt = newExpiresAt;
		}

		return { session, user };
	} catch (error) {
		console.error('Error validating session:', error);
		return null;
	}
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
	try {
		await prisma.session.delete({
			where: { id: sessionId },
		});
	} catch (error) {
		// Session might not exist, which is fine
		console.warn('Session deletion failed:', error);
	}
}

/**
 * Invalidate all sessions for a user
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
	try {
		await prisma.session.deleteMany({
			where: { userId },
		});
	} catch (error) {
		console.error('Error invalidating user sessions:', error);
	}
}

/**
 * Set session token cookie (for server-side response)
 */
export function setSessionTokenCookie(response: any, token: string, expiresAt: Date): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const cookieValue = `session=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiresAt.toUTCString()}${isProduction ? '; Secure' : ''}`;
	
	if (response.headers) {
		response.headers.append('Set-Cookie', cookieValue);
	} else if (response.setHeader) {
		response.setHeader('Set-Cookie', cookieValue);
	}
}

/**
 * Delete session token cookie (for logout)
 */
export function deleteSessionTokenCookie(response: any): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const cookieValue = `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`;
	
	if (response.headers) {
		response.headers.append('Set-Cookie', cookieValue);
	} else if (response.setHeader) {
		response.setHeader('Set-Cookie', cookieValue);
	}
}

/**
 * Parse session token from cookie string
 */
export function parseSessionToken(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	
	const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
	const sessionCookie = cookies.find(cookie => cookie.startsWith('session='));
	
	if (!sessionCookie) return null;
	
	return sessionCookie.split('=')[1] || null;
}

/**
 * Get current session from request (for middleware/context)
 */
export async function getCurrentSession(token: string | null): Promise<SessionWithUser | null> {


	if (!token) return null;
	
	return validateSessionToken(token);
}