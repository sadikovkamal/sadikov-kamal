// Failure-path smoke for v2 import.
//
// Builds a ZIP with several broken problems and confirms the validator
// surfaces each kind of error. Because v2 hard-stops on any error,
// executeImportAction would never reach executeImport with these inputs
// — so this script only exercises the validator.

import "../src/db/load-env";

import JSZip from "jszip";
import { db } from "../src/db";
import { sources, ageCategories, topics } from "../src/db/schema";
import { parseBundle } from "../src/lib/import/parse";
import { validateBundle } from "../src/lib/import/validate";
import { parentIdSet } from "../src/lib/taxonomy/hierarchy";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  // Pick one real code of each kind so the "good" block in the bundle
  // can actually pass validation; the rest deliberately use codes that
  // don't exist.
  // Must pick a LEAF source and topic (non-parent) so the "good" block
  // passes the new parent-guard check in the validator.
  const [oneAge] = await db
    .select({ code: ageCategories.code })
    .from(ageCategories)
    .limit(1);
  const allSources = await db
    .select({ id: sources.id, code: sources.code, parentId: sources.parentId })
    .from(sources);
  const sourceParents = parentIdSet(allSources);
  const leafSource = allSources.find((s) => !sourceParents.has(s.id));
  const allTopics = await db
    .select({ id: topics.id, code: topics.code, parentId: topics.parentId })
    .from(topics);
  const topicParents = parentIdSet(allTopics);
  const leafTopic = allTopics.find((t) => !topicParents.has(t.id));
  assert(oneAge && leafSource && leafTopic, "seed missing — run pnpm db:seed");
  const oneSource = leafSource;
  const oneTopic = leafTopic;

  const S = oneSource.code;
  const A = oneAge.code;
  const T = oneTopic.code;

  const zip = new JSZip();
  zip.file(
    "problems.md",
    `---
source: ${S}
age_categories: [${A}]
topics: [${T}]
---

# Shart

BAD-1: references a missing image.

![diagram](images/missing.png)

---

source: ${S}
age_categories: [${A}]
topics: [${T}]
---

(no Shart heading on purpose; whole body is empty)

---

source: S999999
age_categories: [${A}]
topics: [${T}]
---

# Shart

BAD-3: nonexistent source code.

---

source: ${S}
age_categories: [${A}]
topics: [${T}]
---

# Shart

GOOD-1: valid content, no images.
`
  );

  const zipBytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  const bundle = await parseBundle(zipBytes);
  assert(bundle.bundleErrors.length === 0, `bundle errors: ${bundle.bundleErrors.join("; ")}`);
  assert(bundle.problems.length === 4, `parsed ${bundle.problems.length}, want 4`);
  console.log(`[1] parsed broken bundle: 4 blocks`);

  const report = await validateBundle(bundle);
  assert(report.errorCount === 3, `errorCount=${report.errorCount}, want 3`);
  assert(report.okCount === 1, `okCount=${report.okCount}, want 1`);

  const missing = report.problems.find((p) =>
    p.errors.some((e) => e.includes("Rasm arxivda yo'q"))
  );
  assert(missing, "missing image error not surfaced");
  console.log(`[2] missing image surfaced: ${missing!.errors[0]}`);

  const emptyBody = report.problems.find((p) =>
    p.errors.some((e) => e.includes("Masala matni bo'sh"))
  );
  assert(emptyBody, "empty body not detected");
  console.log(`[3] empty body surfaced: ${emptyBody!.errors[0]}`);

  const badSource = report.problems.find((p) =>
    p.errors.some((e) => e.includes("Manba topilmadi"))
  );
  assert(badSource, "bad source code not detected");
  console.log(`[4] missing source code surfaced: ${badSource!.errors[0]}`);

  const good = report.problems.find((p) => p.status === "ok");
  assert(good, "no ok problem found");
  console.log(`[5] one problem validated cleanly`);

  console.log(`\nFailure-path smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failure-path smoke FAILED:", e);
  process.exit(1);
});
