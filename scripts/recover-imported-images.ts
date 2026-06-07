// One-off recovery for the `imports/` lifecycle bug.
//
// Background: bulk-imported problem images used to be stored under the
// `imports/{timestamp}/…` prefix, which the R2 lifecycle rule deletes one
// day after upload (it's meant only for throwaway ZIP staging). So every
// imported image vanished ~24h later, leaving a live DB row pointing at a
// missing object. The forward fix (src/lib/import/execute.ts) now stores
// them under `problems/imported/…`; this script repairs EXISTING rows.
//
// For each `images` row whose storage_key still starts with `imports/`:
//   • If the R2 object still exists (imported < 1 day ago) → copy it to
//     `problems/imported/…`, update the DB row + rewrite the matching URL
//     in the problem's body_md, then delete the old object.
//   • If the object is already gone (expired) → report it; nothing to do
//     but re-upload the source image (the script lists the affected codes).
//
// Safe by default: prints a plan and changes NOTHING. Pass --apply to act.
//
// Run:
//   npx tsx scripts/recover-imported-images.ts            # dry run
//   npx tsx scripts/recover-imported-images.ts --apply    # perform fixes

import "../src/db/load-env";

import { eq, like } from "drizzle-orm";
import { db } from "../src/db";
import { images, problems } from "../src/db/schema";
import { fileExists, copyFile, deleteFile } from "../src/lib/storage/r2";

const APPLY = process.argv.includes("--apply");

/** `imports/123/abc.png` → `problems/imported/123/abc.png`. */
function relocate(oldKey: string): string {
  return oldKey.replace(/^imports\//, "problems/imported/");
}

async function main() {
  const rows = await db
    .select({
      imageProblemId: images.problemId,
      storageKey: images.storageKey,
      code: problems.code,
      bodyMd: problems.bodyMd,
    })
    .from(images)
    .innerJoin(problems, eq(images.problemId, problems.id))
    .where(like(images.storageKey, "imports/%"));

  if (rows.length === 0) {
    console.log("No image rows under the imports/ prefix. Nothing to do. ✓");
    return;
  }

  console.log(
    `Found ${rows.length} imported image(s) under imports/ ${
      APPLY ? "(APPLYING fixes)" : "(dry run — pass --apply to fix)"
    }\n`
  );

  let recoverable = 0;
  let lost = 0;
  let fixed = 0;

  for (const row of rows) {
    const oldKey = row.storageKey;
    const newKey = relocate(oldKey);
    const exists = await fileExists(oldKey);

    if (!exists) {
      lost++;
      console.log(`✗ LOST     ${row.code}  ${oldKey}  (object already expired)`);
      continue;
    }

    recoverable++;
    console.log(`→ RECOVER  ${row.code}  ${oldKey}  →  ${newKey}`);

    if (!APPLY) continue;

    try {
      // 1. Copy the surviving object to the permanent prefix.
      await copyFile(oldKey, newKey);
      // 2. Point the DB row + body_md URL at the new key, then drop the old.
      const newBody = row.bodyMd.split(oldKey).join(newKey);
      await db.transaction(async (tx) => {
        await tx
          .update(images)
          .set({ storageKey: newKey })
          .where(eq(images.problemId, row.imageProblemId));
        if (newBody !== row.bodyMd) {
          await tx
            .update(problems)
            .set({ bodyMd: newBody })
            .where(eq(problems.id, row.imageProblemId));
        }
      });
      // 3. Best-effort delete of the old object (lifecycle would reap it
      //    anyway, but tidy up now so it doesn't linger for a day).
      try {
        await deleteFile(oldKey);
      } catch {
        // ignore — lifecycle rule will reclaim it
      }
      fixed++;
    } catch (e) {
      console.log(
        `  ! failed to recover ${row.code}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  console.log(
    `\nSummary: ${recoverable} recoverable, ${lost} already lost, ${
      APPLY ? `${fixed} fixed` : "0 fixed (dry run)"
    }.`
  );
  if (lost > 0) {
    console.log(
      "\nLost images can't be restored from R2 — re-upload them by editing\n" +
        "the listed problems, or re-import the original ZIP batch."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("recover-imported-images FAILED:", e);
    process.exit(1);
  });
