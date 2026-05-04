// HTTP-level e2e: creates a real session row, then hits /admin with the
// cookie set to the raw token and expects "Welcome, Admin" in the HTML.
//
// Requires: `npm run dev` already running on $PORT (default 3001).
//
// Run: npx tsx scripts/auth-http-smoke.ts

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import {
  createSession,
  invalidateSession,
} from "../src/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/tokens";

const PORT = Number(process.env.PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

async function main() {
  const admin = await db.query.users.findFirst({
    where: eq(users.email, "admin@example.com"),
  });
  if (!admin) throw new Error("seeded admin missing");

  const { token } = await createSession(admin.id);
  console.log(`[1] created session for ${admin.email}`);

  let failed: Error | null = null;
  try {
    // Without cookie -> /admin must redirect (proxy.ts).
    {
      const r = await fetch(`${BASE}/admin`, { redirect: "manual" });
      if (r.status !== 307 && r.status !== 302) {
        throw new Error(`/admin without cookie: expected 307/302, got ${r.status}`);
      }
      const loc = r.headers.get("location") ?? "";
      if (!loc.includes("/login")) {
        throw new Error(`expected redirect to /login, got ${loc}`);
      }
      console.log(`[2] /admin no-cookie -> ${r.status} ${loc}`);
    }

    // With cookie -> /admin must render the admin layout.
    {
      const r = await fetch(`${BASE}/admin`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`/admin with cookie: expected 200, got ${r.status}\n${body.slice(0, 800)}`);
      }
      // Phase 9 replaced the placeholder dashboard with a real one. The
      // heading is "Boshqaruv paneli" (Uzbek for "Dashboard").
      if (!/Boshqaruv paneli/.test(body)) {
        throw new Error(`/admin response missing dashboard heading\n--- BEGIN BODY (${body.length} chars) ---\n${body.slice(0, 1000)}\n--- END BODY ---`);
      }
      if (!body.includes("Sign out")) {
        throw new Error(`/admin response does not contain Sign out button`);
      }
      console.log(`[3] /admin with cookie -> 200 OK, contains dashboard heading + Sign out`);
    }

    // /login with cookie -> redirect to /admin (already logged in)
    {
      const r = await fetch(`${BASE}/login`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
        redirect: "manual",
      });
      if (r.status !== 307 && r.status !== 302) {
        throw new Error(`/login with cookie: expected 307/302, got ${r.status}`);
      }
      const loc = r.headers.get("location") ?? "";
      if (!loc.endsWith("/admin")) {
        throw new Error(`/login w/cookie expected redirect to /admin, got ${loc}`);
      }
      console.log(`[4] /login with cookie -> ${r.status} ${loc}`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    await invalidateSession(token);
    console.log(`[cleanup] session invalidated`);
  }

  if (failed) {
    console.error("HTTP auth smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nHTTP auth smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("HTTP auth smoke FAILED:", e);
  process.exit(1);
});
