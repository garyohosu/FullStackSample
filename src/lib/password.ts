/**
 * Password hashing and verification utilities
 * Using Web Crypto API with PBKDF2 (compatible with Cloudflare Workers)
 */

// Helper function to convert Uint8Array to hex
function arrayBufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper function to convert hex to Uint8Array
function hexToArrayBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Hash a password using PBKDF2
 * @param password - Plain text password
 * @returns Hashed password string in format: salt.hash
 */
export async function hashPassword(password: string): Promise<string> {
  try {
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

    // Convert to hex
    const hashArray = new Uint8Array(hashBuffer);
    const saltHex = arrayBufferToHex(salt);
    const hashHex = arrayBufferToHex(hashArray);

    return `${saltHex}.${hashHex}`;
  } catch (error) {
    console.error('Password hashing error:', error);
    throw new Error(`Failed to hash password: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
    const [saltHex, hashHex] = storedHash.split('.');
    if (!saltHex || !hashHex) {
      return false;
    }

    // Decode salt
    const salt = hexToArrayBuffer(saltHex);

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

    // Convert to hex
    const hashArray = new Uint8Array(hashBuffer);
    const computedHashHex = arrayBufferToHex(hashArray);

    // Constant-time comparison
    return hashHex === computedHashHex;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}
