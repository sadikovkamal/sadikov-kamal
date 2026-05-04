// One-shot smoke test for the Phase 2 auth pipeline.
// Verifies: bcrypt compare against seeded admin, createSession,
// validateSessionToken, invalidateSession.
//
// Run: npx tsx scripts/auth-smoke.ts

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";
import {
  createSession,
  validateSessionToken,
  invalidateSession,
} from "../src/lib/auth/sessions";

async function main() {
  const email = "admin@example.com";
  const password = "ChangeMe123!";

  // 1. Lookup admin
  const admin = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!admin) throw new Error(`No admin row for ${email}`);
  console.log(`[1] admin row: ${admin.id} (${admin.role})`);

  // 2. Verify bcrypt compare against seed password
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) throw new Error(`bcrypt.compare failed`);
  console.log(`[2] bcrypt.compare ok`);

  // 3. Wrong password must fail
  const wrong = await bcrypt.compare("not-the-right-password", admin.passwordHash);
  if (wrong) throw new Error(`bcrypt accepted wrong password`);
  console.log(`[3] wrong password rejected`);

  // 4. createSession inserts a sessions row
  const { token, expiresAt } = await createSession(admin.id);
  console.log(`[4] created session, token len=${token.length}, expires=${expiresAt.toISOString()}`);

  // 5. validateSessionToken returns the user
  const valid = await validateSessionToken(token);
  if (!valid) throw new Error(`validateSessionToken returned null for fresh token`);
  if (valid.user.id !== admin.id) throw new Error(`mismatched user id from validate`);
  console.log(`[5] validate ok, user.fullName=${valid.user.fullName}`);

  // 6. invalidateSession deletes the row
  await invalidateSession(token);
  const afterInvalidate = await validateSessionToken(token);
  if (afterInvalidate !== null) throw new Error(`session still valid after invalidate`);
  console.log(`[6] invalidate ok`);

  // 7. validate of garbage returns null
  const fakeValidate = await validateSessionToken("definitely-not-a-real-token-aaaa");
  if (fakeValidate !== null) throw new Error(`bogus token validated`);
  console.log(`[7] bogus token rejected`);

  // 8. confirm sessions table is empty for this user
  const remaining = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, admin.id));
  console.log(`[8] sessions for admin: ${remaining.length}`);

  console.log(`\nAuth smoke test: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Auth smoke test FAILED:", e);
  process.exit(1);
});
