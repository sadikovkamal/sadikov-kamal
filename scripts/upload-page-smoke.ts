// HTTP smoke for /admin/test/upload — verifies the page shell renders
// even when R2 is unconfigured (the upload itself only fires on click).

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

  let failed: Error | null = null;
  try {
    {
      const r = await fetch(`${BASE}/admin/test/upload`, { redirect: "manual" });
      if (r.status !== 307 && r.status !== 302) {
        throw new Error(`no-cookie: expected 307/302, got ${r.status}`);
      }
      console.log(`[1] /admin/test/upload no-cookie -> ${r.status} (proxy guard ok)`);
    }
    {
      const r = await fetch(`${BASE}/admin/test/upload`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
        redirect: "manual",
      });
      const body = await r.text();
      if (r.status !== 200) {
        throw new Error(`with-cookie: expected 200, got ${r.status}\n${body.slice(0, 500)}`);
      }
      if (!/R2 Upload Test/.test(body)) {
        throw new Error(`page heading missing\n${body.slice(0, 500)}`);
      }
      if (!/Pick an image/.test(body)) {
        throw new Error(`file picker label missing`);
      }
      console.log(`[2] /admin/test/upload with cookie -> 200 OK, page shell renders`);
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  } finally {
    await invalidateSession(token);
    console.log(`[cleanup] session invalidated`);
  }

  if (failed) {
    console.error("Upload page smoke FAILED:", failed.message);
    process.exit(1);
  }
  console.log(`\nUpload page smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Upload page smoke FAILED:", e);
  process.exit(1);
});
