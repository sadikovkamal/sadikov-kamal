import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_DURATION_MS,
} from "./tokens";

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const { token, hashedToken } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: hashedToken,
    userId,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Look up a session by the raw token from a cookie.
 * Returns null if the session is missing, expired, or the user is gone.
 *
 * Side effects:
 * - Deletes the session if it's expired (lazy cleanup)
 * - Renews the session if more than half its lifetime has passed
 */
export async function validateSessionToken(
  token: string
): Promise<{ user: User; expiresAt: Date } | null> {
  const hashedToken = hashSessionToken(token);

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashedToken))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  const { session, user } = row;

  // Expired?
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, hashedToken));
    return null;
  }

  // Renew if past halfway mark
  const halfwayPoint = SESSION_DURATION_MS / 2;
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < halfwayPoint) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry })
      .where(eq(sessions.id, hashedToken));
    return { user, expiresAt: newExpiry };
  }

  return { user, expiresAt: session.expiresAt };
}

export async function invalidateSession(token: string): Promise<void> {
  const hashedToken = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.id, hashedToken));
}

export async function invalidateAllUserSessions(
  userId: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Periodic cleanup — call from a cron later. Safe to skip for MVP. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
