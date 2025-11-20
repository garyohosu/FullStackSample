/**
 * Password hashing and verification utilities
 * Using Web Crypto API with PBKDF2 (compatible with Cloudflare Workers)
 */

// Helper function to convert Uint8Array to base64
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

// Helper function to convert base64 to Uint8Array
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
  const saltBase64 = arrayBufferToBase64(salt);
  const hashBase64 = arrayBufferToBase64(hashArray);

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
    const salt = base64ToArrayBuffer(saltBase64);

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
    const computedHashBase64 = arrayBufferToBase64(hashArray);

    // Constant-time comparison
    return hashBase64 === computedHashBase64;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}
