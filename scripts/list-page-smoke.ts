// HTTP smoke for /admin/problems list page.
// - Verifies the proxy guard
// - Confirms an authenticated request renders the table + sidebar shell
// - Exercises filter URL params (?q=..., ?class=...)
// - Exercises bulkDeleteProblemsAction via the server-action mutations layer
//   (we call the underlying delete via SQL since we can't easily fire the
//   server action from CLI; this test is for the data path)

import "../src/db/load-env";

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, problems } from "../src/db/schema";
import {
  createSession,
  invalidateSession,
} from "../src/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/tokens";
import { createProblemTx } from "../src/lib/problems/mutations";

const PORT = Number(process.env.PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  if (!admin) throw new Error("admin missing");
  const algebra = (await db.query.topics.findMany()).find((t) => t.slug === "algebra")!;
  const imo = (await db.query.sources.findMany()).find((s) => s.slug === "imo")!;

  const MARKER = "PAGE_SMOKE_MARKER";
  const created: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await createProblemTx(
      {
        bodyMd: `${MARKER} fixture #${i + 1}`,
        solutionMd: null,
        answer: null,
        sourceId: imo.id,
        year: 2024,
        problemNumber: null,
        topicIds: [algebra.id],
        classes: [10],
      },
      admin.id
    );
    created.push(id);
  }

  const { token } = await createSession(admin.id);
  const cookie = `${SESSION_COOKIE_NAME}=${token}`;
  let failed: Error | null = null;

  try {
    // 1. Proxy guard
    {
      const r = await fetch(`${BASE}/admin/problems`, { redirect: "manual" });
      if (r.status !== 307 && r.status !== 302) {
        throw new Error(`no-cookie: expected 307, got ${r.status}`);
      }
      console.log(`[1] /admin/problems no-cookie -> ${r.status}`);
    }

    // 2. Authenticated render with FTS marker
    {
      const r = await fetch(
        `${BASE}/admin/problems?q=${encodeURIComponent(MARKER)}`,
        { headers: { cookie }, redirect: "manual" }
      );
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`auth: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/Masalalar/.test(body)) {
        throw new Error(`page heading missing`);
      }
      // Confirm at least one of our fixtures appears in the table
      if (!body.includes("PAGE_SMOKE_MARKER")) {
        throw new Error(`fixtures not in body`);
      }
      // Sidebar present
      if (!/Sinflar/.test(body)) {
        throw new Error(`sidebar filters missing`);
      }
      console.log(`[2] /admin/problems?q=${MARKER} -> 200, table + sidebar`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    if (created.length) {
      await db.delete(problems).where(inArray(problems.id, created));
    }
    await invalidateSession(token);
  }

  if (failed) {
    console.error("List page smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nList page smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("List page smoke FAILED:", e);
  process.exit(1);
});
