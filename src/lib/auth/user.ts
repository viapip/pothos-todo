import prisma from '@/lib/prisma';
import type { User } from '@prisma/client';

export interface GoogleUserInfo {
	sub: string; // Google user ID
	name: string;
	email: string;
	picture?: string;
}

export interface GitHubUserInfo {
	id: number; // GitHub user ID
	login: string; // GitHub username
	email: string;
	name: string;
	avatar_url?: string;
}

/**
 * Find user by Google ID
 */
export async function getUserByGoogleId(googleId: string): Promise<User | null> {
	try {
		return await prisma.user.findUnique({
			where: { googleId },
		});
	} catch (error) {
		console.error('Error finding user by Google ID:', error);
		return null;
	}
}

/**
 * Find user by GitHub ID
 */
export async function getUserByGitHubId(githubId: string): Promise<User | null> {
	try {
		return await prisma.user.findUnique({
			where: { githubId },
		});
	} catch (error) {
		console.error('Error finding user by GitHub ID:', error);
		return null;
	}
}

/**
 * Find user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
	try {
		return await prisma.user.findUnique({
			where: { email },
		});
	} catch (error) {
		console.error('Error finding user by email:', error);
		return null;
	}
}

/**
 * Create a new user with Google OAuth
 */
export async function createUserWithGoogle(userInfo: GoogleUserInfo): Promise<User> {
	try {
		return await prisma.user.create({
			data: {
				email: userInfo.email,
				name: userInfo.name,
				googleId: userInfo.sub,
			},
		});
	} catch (error) {
		console.error('Error creating user with Google:', error);
		throw new Error('Failed to create user');
	}
}

/**
 * Create a new user with GitHub OAuth
 */
export async function createUserWithGitHub(userInfo: GitHubUserInfo): Promise<User> {
	try {
		return await prisma.user.create({
			data: {
				email: userInfo.email,
				name: userInfo.name || userInfo.login,
				githubId: userInfo.id.toString(),
			},
		});
	} catch (error) {
		console.error('Error creating user with GitHub:', error);
		throw new Error('Failed to create user');
	}
}

/**
 * Link Google account to existing user
 */
export async function linkGoogleToUser(userId: string, googleId: string): Promise<User> {
	try {
		return await prisma.user.update({
			where: { id: userId },
			data: { googleId },
		});
	} catch (error) {
		console.error('Error linking Google account:', error);
		throw new Error('Failed to link Google account');
	}
}

/**
 * Link GitHub account to existing user
 */
export async function linkGitHubToUser(userId: string, githubId: string): Promise<User> {
	try {
		return await prisma.user.update({
			where: { id: userId },
			data: { githubId },
		});
	} catch (error) {
		console.error('Error linking GitHub account:', error);
		throw new Error('Failed to link GitHub account');
	}
}

/**
 * Handle Google OAuth user creation/authentication
 */
export async function handleGoogleOAuth(userInfo: GoogleUserInfo): Promise<User> {
	// First, check if user exists by Google ID
	let user = await getUserByGoogleId(userInfo.sub);
	if (user) {
		return user;
	}

	// Check if user exists by email
	user = await getUserByEmail(userInfo.email);
	if (user) {
		// Link Google account to existing user
		return await linkGoogleToUser(user.id, userInfo.sub);
	}

	// Create new user
	return await createUserWithGoogle(userInfo);
}

/**
 * Handle GitHub OAuth user creation/authentication
 */
export async function handleGitHubOAuth(userInfo: GitHubUserInfo): Promise<User> {
	// First, check if user exists by GitHub ID
	let user = await getUserByGitHubId(userInfo.id.toString());
	if (user) {
		return user;
	}

	// Check if user exists by email (if email is provided)
	if (userInfo.email) {
		user = await getUserByEmail(userInfo.email);
		if (user) {
			// Link GitHub account to existing user
			return await linkGitHubToUser(user.id, userInfo.id.toString());
		}
	}

	// Create new user
	return await createUserWithGitHub(userInfo);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
	try {
		return await prisma.user.findUnique({
			where: { id },
		});
	} catch (error) {
		console.error('Error finding user by ID:', error);
		return null;
	}
}