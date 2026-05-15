/**
 * Build-time migration runner for Vercel deploys.
 *
 * `vercel-build` invokes this before `next build`. If migrations fail,
 * the build fails — Vercel won't publish a broken deploy. If DATABASE_URL
 * is missing (e.g. preview deploys without DB), we skip silently rather
 * than crash so the preview still ships a frontend-only build.
 *
 * Runs against the same migrations folder as `npm run db:migrate` —
 * single source of truth.
 */

import "../src/db/load-env";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined

if (!url) {
  // Hard-fail on production deploys: a missing DATABASE_URL would publish
  // a broken build where every page hits the DB and 500s. Preview deploys
  // without a DB are still allowed (frontend-only smoke).
  if (vercelEnv === "production") {
    console.error(
      "[migrate] DATABASE_URL is required for production builds. " +
        "Set it in Vercel Project Settings → Environment Variables."
    );
    process.exit(1);
  }
  console.warn(
    "[migrate] DATABASE_URL not set — skipping migrations. " +
      `(VERCEL_ENV=${vercelEnv ?? "unset"})`
  );
  process.exit(0);
}

async function run() {
  // `max: 1` keeps the migration sequential; the schema-locking pragmas
  // inside Drizzle's migrator assume a single connection.
  const sql = postgres(url!, { max: 1 });
  const db = drizzle(sql);

  console.log("[migrate] applying migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("[migrate] done.");

  await sql.end();
}

run().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
