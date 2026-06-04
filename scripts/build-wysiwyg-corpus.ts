/**
 * Build the WYSIWYG math-editor corpus fixture.
 *
 * Sources:
 *  1. Real import bundle: "6-9 2020 Part4.zip" (~61 problems, no images)
 *  2. docs/examples/sample-batch/problems.md (3 problems, includes image refs)
 *  3. Synthetic absolute-URL image cases (2 extra)
 *
 * Output: scripts/fixtures/wysiwyg-corpus.json
 *
 * Run: npx tsx scripts/build-wysiwyg-corpus.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import JSZip from "jszip";
import { parseBundle, splitProblemBlocks, extractShartBody } from "../src/lib/import/parse";

interface CorpusEntry {
  code: string;
  bodyMd: string;
}

async function main() {
  const entries: CorpusEntry[] = [];

  // ── 1. Real Part4 ZIP ─────────────────────────────────────────────────────
  const zipPath =
    "C:\\Users\\Aytmurat's PC\\Downloads\\Telegram Desktop\\6-9 2020 Part4.zip";
  console.log(`Reading ZIP: ${zipPath}`);
  const zipBytes = new Uint8Array(readFileSync(zipPath).buffer);
  const bundle = await parseBundle(zipBytes);

  if (bundle.bundleErrors.length > 0) {
    console.warn("Bundle warnings:", bundle.bundleErrors);
  }
  console.log(`Part4 bundle: ${bundle.problems.length} problems parsed`);

  for (let i = 0; i < bundle.problems.length; i++) {
    const p = bundle.problems[i]!;
    entries.push({ code: `part4-${i + 1}`, bodyMd: p.bodyMd });
  }

  // ── 2. Sample-batch problems.md ───────────────────────────────────────────
  const sampleMdPath = resolve(
    __dirname,
    "..",
    "docs",
    "examples",
    "sample-batch",
    "problems.md"
  );
  console.log(`Reading sample-batch: ${sampleMdPath}`);
  const sampleText = readFileSync(sampleMdPath, "utf8");
  const blocks = splitProblemBlocks(sampleText);

  for (let i = 0; i < blocks.length; i++) {
    // extractShartBody works on the content-after-frontmatter; but the block
    // still includes the frontmatter delimiters, so we strip them first using
    // the same gray-matter approach parse.ts uses internally — or just call
    // extractShartBody on the raw block (it scans for "# Shart").
    const bodyMd = extractShartBody(blocks[i]!);
    if (bodyMd) {
      entries.push({ code: `sample-${i + 1}`, bodyMd });
    }
  }
  console.log(`Sample-batch: added ${blocks.length} problems`);

  // ── 3. Synthetic absolute-URL image cases ─────────────────────────────────
  entries.push({
    code: "synthetic-img-1",
    bodyMd: `$ABC$ uchburchakda $AB = AC$ va $\\angle A = 36°$ bo'lsin. Isbotlangki, $BC^2 = AB \\cdot (AB - BC)$.

![Diagram](https://example.r2.dev/p1.png)`,
  });

  entries.push({
    code: "synthetic-img-2",
    bodyMd: `Tenglikni isbotlang:

$$\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}$$

![Yig'indini ko'rsatuvchi chizma](https://example.r2.dev/p2.png)`,
  });

  // ── 4. Grammar audit ─────────────────────────────────────────────────────
  const grammarIssues: string[] = [];
  for (const entry of entries) {
    // Check for markdown constructs beyond paragraphs, inline math, display
    // math, and images. Flag tables, lists, headings, bold/italic.
    if (/^\|.+\|/m.test(entry.bodyMd)) {
      grammarIssues.push(`${entry.code}: contains table`);
    }
    if (/^[-*+] /m.test(entry.bodyMd)) {
      grammarIssues.push(`${entry.code}: contains unordered list`);
    }
    if (/^\d+\. /m.test(entry.bodyMd)) {
      grammarIssues.push(`${entry.code}: contains ordered list`);
    }
    if (/^#{1,6} /m.test(entry.bodyMd)) {
      grammarIssues.push(`${entry.code}: contains heading`);
    }
    if (/\*\*.+\*\*/.test(entry.bodyMd)) {
      grammarIssues.push(`${entry.code}: contains bold`);
    }
  }

  if (grammarIssues.length > 0) {
    console.warn("\nGRAMMAR ISSUES FOUND — review before proceeding:");
    for (const issue of grammarIssues) {
      console.warn("  " + issue);
    }
  } else {
    console.log(
      "\nGrammar audit: OK — only paragraphs, inline math, display math, and images found."
    );
  }

  // ── 5. Image coverage check ───────────────────────────────────────────────
  const imageEntries = entries.filter(
    (e) => /!\[/.test(e.bodyMd)
  );
  console.log(`\nImage-bearing entries: ${imageEntries.length}`);
  for (const e of imageEntries) {
    console.log(`  ${e.code}`);
  }

  // ── 6. Write fixture ──────────────────────────────────────────────────────
  const outDir = resolve(__dirname, "fixtures");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "wysiwyg-corpus.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf8");

  console.log(`\nWrote ${entries.length} entries to ${outPath}`);

  if (entries.length < 63) {
    console.warn(
      `WARNING: only ${entries.length} entries — expected ≥63. Check the ZIP path.`
    );
  }
  if (imageEntries.length < 3) {
    console.warn(
      `WARNING: only ${imageEntries.length} image-bearing entries — expected ≥3.`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
