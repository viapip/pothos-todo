import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
	return bcrypt.compare(password, hashedPassword);
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