// HTTP smoke for the new admin pages (dashboard, topics, sources).

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
  if (!admin) throw new Error("admin missing");
  const { token } = await createSession(admin.id);
  const cookie = `${SESSION_COOKIE_NAME}=${token}`;

  type Check = { path: string; mustInclude: string[] };
  const checks: Check[] = [
    {
      path: "/admin",
      mustInclude: ["Boshqaruv paneli", "Masalalar", "Mavzular", "Manbalar"],
    },
    {
      path: "/admin/topics",
      mustInclude: ["Mavzular", "+ Yangi mavzu"],
    },
    {
      path: "/admin/sources",
      mustInclude: ["Manbalar", "+ Yangi manba"],
    },
  ];

  let failed: Error | null = null;
  try {
    let i = 0;
    for (const c of checks) {
      i++;
      // Proxy guard
      const noCookie = await fetch(`${BASE}${c.path}`, { redirect: "manual" });
      if (noCookie.status !== 307 && noCookie.status !== 302) {
        throw new Error(`${c.path} no-cookie: expected 307, got ${noCookie.status}`);
      }
      // Authenticated
      const r = await fetch(`${BASE}${c.path}`, {
        headers: { cookie },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`${c.path} auth: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      for (const must of c.mustInclude) {
        if (!body.includes(must)) {
          throw new Error(`${c.path} missing "${must}"\n${body.slice(0, 800)}`);
        }
      }
      console.log(`[${i}] ${c.path} -> 307 (no cookie) + 200 with all required text`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    await invalidateSession(token);
  }

  if (failed) {
    console.error("Taxonomy pages smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nTaxonomy pages smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Taxonomy pages smoke FAILED:", e);
  process.exit(1);
});
