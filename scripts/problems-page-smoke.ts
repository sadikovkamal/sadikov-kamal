// HTTP smoke for the Phase 5 problem CRUD pages. Asserts that they
// render with the right server-side shells when authenticated, and
// redirect when not.

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import {
  createSession,
  invalidateSession,
} from "../src/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/tokens";
import {
  createProblemTx,
  deleteProblemTx,
} from "../src/lib/problems/mutations";

const PORT = Number(process.env.PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

async function main() {
  const admin = await db.query.users.findFirst({
    where: eq(users.email, "admin@example.com"),
  });
  if (!admin) throw new Error("seeded admin missing");

  const topic = (await db.query.topics.findMany()).find((t) => t.slug === "algebra");
  const source = (await db.query.sources.findMany()).find((s) => s.slug === "imo");
  if (!topic || !source) throw new Error("seed data missing");

  const { token } = await createSession(admin.id);
  const cookie = `${SESSION_COOKIE_NAME}=${token}`;
  let createdId: string | null = null;
  let failed: Error | null = null;

  try {
    // Insert a real problem via the data layer so detail/edit pages have
    // something to render.
    createdId = await createProblemTx(
      {
        bodyMd: "Page smoke: $a + b > 0$ when $a, b > 0$.",
        solutionMd: null,
        answer: "always",
        sourceId: source.id,
        year: 2023,
        problemNumber: "PG-1",
        topicIds: [topic.id],
        classes: [9],
      },
      admin.id
    );

    // /admin/problems/[id] view page with cookie
    {
      const r = await fetch(`${BASE}/admin/problems/${createdId}`, {
        headers: { cookie },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`detail: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/Page smoke/.test(body)) {
        throw new Error(`detail body did not include problem text`);
      }
      if (!/Tahrirlash/.test(body)) {
        throw new Error(`detail page missing "Tahrirlash" edit link`);
      }
      // React HTML-encodes the apostrophe in "O'chirish" to &#x27; so we
      // accept either the literal or the encoded form.
      if (!/O(?:'|&#x27;|&apos;)chirish/.test(body)) {
        throw new Error(`detail page missing "O'chirish" delete control`);
      }
      console.log(`[1] /admin/problems/${createdId.slice(0, 8)}… -> 200 OK with body + controls`);
    }

    // /admin/problems/[id]/edit with cookie
    {
      const r = await fetch(`${BASE}/admin/problems/${createdId}/edit`, {
        headers: { cookie },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`edit: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/Masalani tahrirlash/.test(body)) {
        throw new Error(`edit page missing heading`);
      }
      console.log(`[2] /admin/problems/${createdId.slice(0, 8)}…/edit -> 200 OK`);
    }

    // /admin/problems/[id] for unknown id -> 404
    {
      const r = await fetch(`${BASE}/admin/problems/00000000-0000-0000-0000-000000000000`, {
        headers: { cookie },
        redirect: "manual",
      });
      if (r.status !== 404) {
        throw new Error(`unknown id: expected 404, got ${r.status}`);
      }
      console.log(`[3] unknown problem id -> 404`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    if (createdId) {
      await deleteProblemTx(createdId);
      console.log(`[cleanup] deleted ${createdId}`);
    }
    await invalidateSession(token);
  }

  if (failed) {
    console.error("Pages smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nPages smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Pages smoke FAILED:", e);
  process.exit(1);
});
