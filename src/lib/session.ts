/**
 * Session management utilities
 * Simple session handling with D1 database
 */

import { encodeBase32, encodeHexLowerCase } from '@oslojs/encoding';
import type { Context } from 'hono';

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface User {
  id: string;
  email: string;
}

const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_DURATION = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * Generate a random session ID
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32(bytes).toLowerCase();
}

/**
 * Generate a random user ID
 */
export function generateUserId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(bytes);
}

/**
 * Create a new session for a user
 */
export async function createSession(db: D1Database, userId: string): Promise<Session> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, userId, expiresAt.getTime())
    .run();

  return {
    id: sessionId,
    userId,
    expiresAt,
  };
}

/**
 * Validate a session by ID
 */
export async function validateSession(
  db: D1Database,
  sessionId: string
): Promise<{ session: Session; user: User } | null> {
  const result = await db
    .prepare(
      `
      SELECT sessions.id, sessions.user_id, sessions.expires_at, users.email
      FROM sessions
      INNER JOIN users ON sessions.user_id = users.id
      WHERE sessions.id = ?
    `
    )
    .bind(sessionId)
    .first<{
      id: string;
      user_id: string;
      expires_at: number;
      email: string;
    }>();

  if (!result) {
    return null;
  }

  const expiresAt = new Date(result.expires_at);

  // Check if session is expired
  if (Date.now() >= expiresAt.getTime()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }

  // Extend session if it's close to expiring (within 15 days)
  if (Date.now() >= expiresAt.getTime() - SESSION_DURATION / 2) {
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION);
    await db
      .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(newExpiresAt.getTime(), sessionId)
      .run();
    expiresAt.setTime(newExpiresAt.getTime());
  }

  return {
    session: {
      id: result.id,
      userId: result.user_id,
      expiresAt,
    },
    user: {
      id: result.user_id,
      email: result.email,
    },
  };
}

/**
 * Invalidate (delete) a session
 */
export async function invalidateSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

/**
 * Set session cookie
 */
export function setSessionCookie(c: Context, sessionId: string, expiresAt: Date): void {
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`
  );
}

/**
 * Delete session cookie
 */
export function deleteSessionCookie(c: Context): void {
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

/**
 * Get session ID from cookie
 */
export function getSessionIdFromCookie(c: Context): string | null {
  const cookieHeader = c.req.header('Cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
  );

  if (!sessionCookie) {
    return null;
  }

  return sessionCookie.split('=')[1] || null;
}
