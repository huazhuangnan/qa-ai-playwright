import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { CookieOptions } from 'hono/utils/cookie';

import type { AppDatabase } from '../db/client.ts';
import { sessions } from '../db/schema.ts';

export const SESSION_COOKIE = 'qa_ticket_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates an opaque token while only returning its database hash separately. */
export function createSessionToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

/** Hashes a browser token before lookup or storage. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Persists a seven-day server-side session for a user. */
export function storeSession(
  db: AppDatabase,
  userId: number,
): { token: string; expiresAt: Date } {
  const { token, tokenHash } = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  db.delete(sessions).where(eq(sessions.userId, userId)).run();
  db.insert(sessions)
    .values({
      tokenHash,
      userId,
      createdAt: now,
      expiresAt,
    })
    .run();

  return { token, expiresAt };
}

/** Returns cookie attributes shared by login and logout routes. */
export function sessionCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(expires ? { expires } : {}),
  };
}
