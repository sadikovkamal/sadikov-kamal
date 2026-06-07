// One-off migration: rewrite absolute R2 image URLs in `problems.body_md`
// to the portable `r2:<storageKey>` form (see src/lib/storage/image-ref.ts).
//
// Why: body_md used to inline absolute URLs like
//   ![](https://pub-xxx.r2.dev/problems/imported/123/abc.png)
// which hard-wire every problem to one storage host. After this migration
// the same image is referenced as
//   ![](r2:problems/imported/123/abc.png)
// and resolved to an absolute URL at render time from R2_PUBLIC_URL — so a
// future host/domain/provider change is a one-env-var edit, not a DB rewrite.
//
// Uses the CURRENT R2_PUBLIC_URL as the base to strip; only URLs under that
// base are relativised (foreign URLs are left untouched). Idempotent: rows
// already using `r2:` are unchanged.
//
// Safe by default: prints a plan and changes NOTHING. Pass --apply to write.
//
// Run:
//   npx tsx scripts/migrate-image-refs-to-relative.ts            # dry run
//   npx tsx scripts/migrate-image-refs-to-relative.ts --apply    # migrate

import "../src/db/load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { problems } from "../src/db/schema";
import { getR2PublicUrlOrEmpty } from "../src/lib/storage/r2";
import { relativizeImageRefs } from "../src/lib/storage/image-ref";

const APPLY = process.argv.includes("--apply");

async function main() {
  const base = getR2PublicUrlOrEmpty();
  if (!base) {
    console.error(
      "R2_PUBLIC_URL is not configured — can't determine which URLs to relativise. Aborting."
    );
    process.exit(1);
  }
  console.log(`Base URL to strip: ${base}`);

  const rows = await db
    .select({ id: problems.id, code: problems.code, bodyMd: problems.bodyMd })
    .from(problems);

  let changed = 0;
  for (const row of rows) {
    const next = relativizeImageRefs(row.bodyMd, base);
    if (next === row.bodyMd) continue;
    changed++;
    console.log(`→ ${row.code} (${countRefs(row.bodyMd, base)} ref(s))`);
    if (APPLY) {
      await db
        .update(problems)
        .set({ bodyMd: next })
        .where(eq(problems.id, row.id));
    }
  }

  console.log(
    `\n${rows.length} problem(s) scanned, ${changed} ${
      APPLY ? "migrated" : "would change (dry run — pass --apply)"
    }.`
  );
}

/** Count how many absolute refs under `base` a body contains (for the report). */
function countRefs(md: string, base: string): number {
  const re = new RegExp(
    `\\]\\(\\s*${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`,
    "g"
  );
  return (md.match(re) ?? []).length;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("migrate-image-refs-to-relative FAILED:", e);
    process.exit(1);
  });
