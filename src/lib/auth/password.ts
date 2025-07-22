import { hash, verify } from '@node-rs/bcrypt';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

const BCRYPT_ROUNDS = 12;

// Argon2 configuration (more secure, slower)
const ARGON2_CONFIG = {
	memoryCost: 65536, // 64 MB
	timeCost: 3,       // 3 iterations
	outputLen: 32,     // 32 bytes output
	parallelism: 1,    // Single thread
};

/**
 * Hash password using bcrypt (fast, compatible)
 */
export async function hashPassword(password: string): Promise<string> {
	return hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against bcrypt hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
	return verify(password, hashedPassword);
}

/**
 * Hash password using Argon2 (more secure, recommended for new applications)
 */
export async function hashPasswordSecure(password: string): Promise<string> {
	return argonHash(password, ARGON2_CONFIG);
}

/**
 * Verify password against Argon2 hash
 */
export async function verifyPasswordSecure(password: string, hashedPassword: string): Promise<boolean> {
	return argonVerify(hashedPassword, password);
}

/**
 * Auto-detect hash type and verify accordingly
 */
export async function verifyPasswordAuto(password: string, hashedPassword: string): Promise<boolean> {
	// Argon2 hashes start with $argon2
	if (hashedPassword.startsWith('$argon2')) {
		return verifyPasswordSecure(password, hashedPassword);
	}
	// Default to bcrypt
	return verifyPassword(password, hashedPassword);
}

export function validatePassword(password: string): { isValid: boolean; error?: string } {
	if (!password) {
		return { isValid: false, error: 'Password is required' };
	}
	
	if (password.length < 6) {
		return { isValid: false, error: 'Password must be at least 6 characters long' };
	}
	
	if (password.length > 128) {
		return { isValid: false, error: 'Password must be less than 128 characters' };
	}
	
	return { isValid: true };
}

export function validateEmail(email: string): { isValid: boolean; error?: string } {
	if (!email) {
		return { isValid: false, error: 'Email is required' };
	}
	
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		return { isValid: false, error: 'Invalid email format' };
	}
	
	if (email.length > 254) {
		return { isValid: false, error: 'Email must be less than 254 characters' };
	}
	
	return { isValid: true };
}