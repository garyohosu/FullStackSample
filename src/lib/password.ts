/**
 * Password hashing and verification utilities
 * Using Web Crypto API with PBKDF2 (compatible with Cloudflare Workers)
 */

/**
 * Hash a password using PBKDF2
 * @param password - Plain text password
 * @returns Hashed password string in format: salt.hash
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate a random salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // Encode password as bytes
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  // Import the password as a key
  const key = await crypto.subtle.importKey(
    'raw',
    passwordData,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Derive hash using PBKDF2
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256
  );

  // Convert to base64
  const hashArray = new Uint8Array(hashBuffer);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  return `${saltBase64}.${hashBase64}`;
}

/**
 * Verify a password against a hash
 * @param storedHash - Stored password hash in format: salt.hash
 * @param password - Plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    // Parse stored hash
    const [saltBase64, hashBase64] = storedHash.split('.');
    if (!saltBase64 || !hashBase64) {
      return false;
    }

    // Decode salt
    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    // Encode password as bytes
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    // Import the password as a key
    const key = await crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Derive hash using PBKDF2
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    // Convert to base64
    const hashArray = new Uint8Array(hashBuffer);
    const computedHashBase64 = btoa(String.fromCharCode(...hashArray));

    // Constant-time comparison
    return hashBase64 === computedHashBase64;
  } catch {
    return false;
  }
}
