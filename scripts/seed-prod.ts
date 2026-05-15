/**
 * Production seed — one-time bootstrap.
 *
 * Difference from `src/db/seed.ts` (dev seed):
 *  - Refuses to run unless SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are
 *    explicitly set (no built-in fallbacks → no "ChangeMe123!" admin in
 *    production by accident).
 *  - Refuses to overwrite an existing admin: if any user exists, you
 *    must delete them via the DB console first. This guards against
 *    re-running the seed and silently doing nothing while the operator
 *    thinks they reset the password.
 *  - Logs nothing sensitive (no password in stdout).
 *
 * Usage (run from a trusted machine — local laptop, NOT in CI):
 *   SEED_ADMIN_EMAIL=admin@yourdomain.com \
 *   SEED_ADMIN_PASSWORD='strong-random-password' \
 *   SEED_ADMIN_NAME='Admin' \
 *   DATABASE_URL='postgres://...neon.tech/...' \
 *   npm run db:seed:prod
 */

import "../src/db/load-env";

import bcrypt from "bcryptjs";
import { db } from "../src/db";
import {
  users,
  topics,
  sources,
  ageCategories,
} from "../src/db/schema";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set in the environment. " +
        "These are deliberately not defaulted in production to prevent accidental " +
        "weak-credential admins."
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  // Refuse if any user already exists. Operators must manage the admin
  // via the app or via SQL after the initial bootstrap.
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    console.error(
      "Users already exist in this database. Refusing to seed. " +
        "If you need to reset the admin, do it from the DB console."
    );
    process.exit(1);
  }

  console.log("[seed-prod] creating super_admin user...");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    passwordHash,
    fullName: name,
    role: "super_admin",
  });
  console.log(`[seed-prod] admin user created: ${email}`);

  // Default age categories — needed for the form to be usable on day 1.
  // Skipped if any rows exist (idempotent on re-runs after manual DB ops).
  const ageRows = await db
    .select({ id: ageCategories.id })
    .from(ageCategories)
    .limit(1);
  if (ageRows.length === 0) {
    console.log("[seed-prod] seeding age categories...");
    await db.insert(ageCategories).values([
      { code: "A000001", name: "1-sinf" },
      { code: "A000002", name: "2-sinf" },
      { code: "A000003", name: "3-sinf" },
      { code: "A000004", name: "4-sinf" },
      { code: "A000005", name: "5-sinf" },
      { code: "A000006", name: "6-sinf" },
      { code: "A000007", name: "7-sinf" },
      { code: "A000008", name: "8-sinf" },
      { code: "A000009", name: "9-sinf" },
      { code: "A000010", name: "10-sinf" },
      { code: "A000011", name: "11-sinf" },
      { code: "A000012", name: "Talaba" },
    ]);
  }

  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .limit(1);
  if (sourceRows.length === 0) {
    console.log("[seed-prod] seeding default sources...");
    const roots = await db
      .insert(sources)
      .values([
        { code: "S000001", name: "Olimpiadalar" },
        { code: "S000002", name: "Kitoblar" },
        { code: "S000003", name: "Kurslar" },
        { code: "S000004", name: "Boshqa" },
      ])
      .returning({ id: sources.id, name: sources.name });

    const olimpiadalarId = roots.find((r) => r.name === "Olimpiadalar")!.id;
    await db.insert(sources).values([
      { code: "S000005", name: "IMO", parentId: olimpiadalarId },
      { code: "S000006", name: "IMO Shortlist", parentId: olimpiadalarId },
      {
        code: "S000007",
        name: "Respublika olimpiadasi",
        parentId: olimpiadalarId,
      },
      {
        code: "S000008",
        name: "Hudud olimpiadasi",
        parentId: olimpiadalarId,
      },
    ]);
  }

  const topicRows = await db.select({ id: topics.id }).from(topics).limit(1);
  if (topicRows.length === 0) {
    console.log("[seed-prod] seeding default top-level topics...");
    const topicData = [
      { code: "T000001", name: "Algebra" },
      { code: "T000002", name: "Geometriya" },
      { code: "T000003", name: "Tengsizliklar" },
      { code: "T000004", name: "Funksional tenglamalar" },
      { code: "T000005", name: "Sonlar nazariyasi" },
      { code: "T000006", name: "Diskret matematika" },
    ];
    await db.insert(topics).values(topicData);
  }

  console.log("[seed-prod] done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-prod] FAILED:", e);
  process.exit(1);
});
