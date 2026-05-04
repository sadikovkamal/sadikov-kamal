// HTTP smoke for /admin/import and /admin/import/[batchId].

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users, importBatches } from "../src/db/schema";
import {
  createSession,
  invalidateSession,
} from "../src/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/tokens";

const PORT = Number(process.env.PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  if (!admin) throw new Error("admin missing");

  const { token } = await createSession(admin.id);
  const cookie = `${SESSION_COOKIE_NAME}=${token}`;
  let stagedBatchId: string | null = null;
  let failed: Error | null = null;

  try {
    // 1. Proxy guard on /admin/import
    {
      const r = await fetch(`${BASE}/admin/import`, { redirect: "manual" });
      if (r.status !== 307 && r.status !== 302) {
        throw new Error(`/admin/import no-cookie: expected 307, got ${r.status}`);
      }
      console.log(`[1] /admin/import no-cookie -> ${r.status}`);
    }

    // 2. Authenticated render of /admin/import
    {
      const r = await fetch(`${BASE}/admin/import`, {
        headers: { cookie },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`/admin/import auth: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/Bulk import/.test(body)) {
        throw new Error(`/admin/import missing heading`);
      }
      if (!/Bundle ZIP/.test(body)) {
        throw new Error(`/admin/import missing uploader label`);
      }
      console.log(`[2] /admin/import with cookie -> 200, uploader present`);
    }

    // 3. Stage a batch row so the detail page has something to render
    const [batch] = await db
      .insert(importBatches)
      .values({
        uploadedBy: admin.id,
        filename: "smoke-batch.zip",
        status: "success",
        totalCount: 0,
        successCount: 0,
        errorLog: [
          { index: 1, sourcePath: "problems.md (block 1)", error: "Skipped (smoke)" },
        ],
        finishedAt: new Date(),
      })
      .returning({ id: importBatches.id });
    stagedBatchId = batch.id;

    // 4. Batch detail page renders
    {
      const r = await fetch(`${BASE}/admin/import/${batch.id}`, {
        headers: { cookie },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`detail: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/smoke-batch\.zip/.test(body)) {
        throw new Error(`detail page missing filename`);
      }
      if (!/Skipped/.test(body)) {
        throw new Error(`detail page missing error log entry`);
      }
      console.log(`[3] /admin/import/${batch.id.slice(0, 8)}… -> 200 with filename + errors`);
    }

    // 5. Unknown batch id -> 404
    {
      const r = await fetch(
        `${BASE}/admin/import/00000000-0000-0000-0000-000000000000`,
        { headers: { cookie }, redirect: "manual" }
      );
      if (r.status !== 404) {
        throw new Error(`unknown batch: expected 404, got ${r.status}`);
      }
      console.log(`[4] unknown batch id -> 404`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    if (stagedBatchId) {
      await db.delete(importBatches).where(eq(importBatches.id, stagedBatchId));
    }
    await invalidateSession(token);
  }

  if (failed) {
    console.error("Import page smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nImport page smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Import page smoke FAILED:", e);
  process.exit(1);
});
