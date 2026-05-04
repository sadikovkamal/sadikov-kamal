// Phase 10 rate-limiting smoke. Exercises the DB-backed limiter directly
// (we can't drive the server action from CLI cleanly; that's covered by
// browser testing). Also exercises the cleanup-cron purge logic.

import "../src/db/load-env";

import { eq, lt } from "drizzle-orm";
import { db } from "../src/db";
import { loginAttempts } from "../src/db/schema";
import {
  isLoginAllowed,
  recordLoginAttempt,
  purgeOldLoginAttempts,
  MAX_LOGIN_ATTEMPTS,
} from "../src/lib/auth/rate-limit";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  // Use a sentinel identifier so we don't interfere with real attempts.
  const ID = `smoke:${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    // Fresh identifier should be allowed.
    assert(await isLoginAllowed(ID), "fresh id should be allowed");
    console.log(`[1] fresh identifier allowed`);

    // Record MAX-1 attempts; still allowed.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      await recordLoginAttempt(ID);
    }
    assert(
      await isLoginAllowed(ID),
      `after ${MAX_LOGIN_ATTEMPTS - 1} attempts should still be allowed`
    );
    console.log(`[2] ${MAX_LOGIN_ATTEMPTS - 1} attempts -> still allowed`);

    // Record one more; now blocked.
    await recordLoginAttempt(ID);
    assert(
      !(await isLoginAllowed(ID)),
      `after ${MAX_LOGIN_ATTEMPTS} attempts should be blocked`
    );
    console.log(`[3] ${MAX_LOGIN_ATTEMPTS} attempts -> blocked`);

    // Adding more keeps it blocked.
    await recordLoginAttempt(ID);
    assert(!(await isLoginAllowed(ID)), "still blocked");
    console.log(`[4] over-limit -> still blocked`);

    // Verify rows are visible in the table.
    const present = await db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, ID));
    assert(
      present.length === MAX_LOGIN_ATTEMPTS + 1,
      `rows=${present.length}, want ${MAX_LOGIN_ATTEMPTS + 1}`
    );
    console.log(`[5] ${present.length} rows recorded for sentinel`);

    // Manually backdate one row to >24h ago, then run the purge cron.
    const oldId = present[0].id;
    await db
      .update(loginAttempts)
      .set({ attemptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(loginAttempts.id, oldId));

    const before = (
      await db
        .select()
        .from(loginAttempts)
        .where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
    ).length;
    assert(before >= 1, "expected at least 1 stale row before purge");

    const deleted = await purgeOldLoginAttempts();
    assert(deleted >= 1, `purge deleted ${deleted}, expected >= 1`);
    console.log(`[6] cleanup-login-attempts purges stale rows (deleted ${deleted})`);

    // Stale rows gone
    const remainingStale = await db
      .select()
      .from(loginAttempts)
      .where(lt(loginAttempts.attemptedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
    assert(remainingStale.length === 0, `stale rows still present: ${remainingStale.length}`);
    console.log(`[7] no rows older than 24h after purge`);
  } finally {
    // Cleanup: remove all rows with our sentinel identifier
    await db.delete(loginAttempts).where(eq(loginAttempts.identifier, ID));
  }

  console.log(`\nRate-limit smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Rate-limit smoke FAILED:", e);
  process.exit(1);
});
