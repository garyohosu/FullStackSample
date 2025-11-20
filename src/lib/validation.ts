/**
 * Input validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate password strength
 * Requirements:
 * - At least 8 characters
 * - At most 255 characters
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 255;
}

/**
 * Validate registration input
 */
export function validateRegistration(email: string, password: string): {
  valid: boolean;
  error?: string;
} {
  if (!email || !password) {
    return { valid: false, error: 'Email and password are required' };
  }

  if (!isValidEmail(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (!isValidPassword(password)) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  return { valid: true };
}
