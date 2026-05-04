import "server-only";

import { randomBytes } from "crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min

/**
 * Returns true if the identifier is allowed to attempt a login (i.e. has
 * fewer than MAX_LOGIN_ATTEMPTS rows in the last LOGIN_WINDOW_MS).
 *
 * The identifier should be namespaced — pass `ip:1.2.3.4` or
 * `email:foo@bar.com`, not the raw value, so the same string can be used
 * for either dimension without collisions.
 */
export async function isLoginAllowed(identifier: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_MS);
  const recent = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        gte(loginAttempts.attemptedAt, cutoff)
      )
    );
  return recent.length < MAX_LOGIN_ATTEMPTS;
}

export async function recordLoginAttempt(identifier: string): Promise<void> {
  await db.insert(loginAttempts).values({
    id: randomBytes(8).toString("hex"),
    identifier,
  });
}

/** Cron-friendly: drop rows older than 24h. */
export async function purgeOldLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, cutoff))
    .returning({ id: loginAttempts.id });
  return deleted.length;
}
