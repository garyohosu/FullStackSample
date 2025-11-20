/**
 * Password hashing and verification utilities
 * Using @oslojs/crypto for Argon2id hashing
 */

import { Argon2id } from '@oslojs/crypto/argon2id';

/**
 * Hash a password using Argon2id
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  const hashedPassword = await new Argon2id().hash(password);
  return hashedPassword;
}

/**
 * Verify a password against a hash
 * @param hash - Stored password hash
 * @param password - Plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await new Argon2id().verify(hash, password);
  } catch {
    return false;
  }
}
