// Round-trip + render-equivalence smoke test for the WYSIWYG math editor's
// Markdown I/O core (Phase 1). This is the correctness gate for the whole
// feature: it proves the body_md ⇄ ProseMirror-document pair is lossless on
// the REAL corpus before any UI exists.
//
// For each corpus body:
//   • Round-trip (structural):  doc  = markdownToDoc(body)
//                               md2  = docToMarkdown(doc)
//                               doc2 = markdownToDoc(md2)
//                               assert deepEqual(doc2, doc)  (document is stable)
//   • Render-equivalence:       render `body` and `md2` through the SAME
//                               pipeline markdown-preview.tsx uses
//                               (remark-gfm + remark-math + rehype-katex +
//                               rehype-highlight + rehype-sanitize), normalize
//                               whitespace, assert the HTML is equal.
//
// It uses react-dom/server (via MarkdownPreview), so it runs in the PLAIN
// group of run-all-smokes.sh — WITHOUT --conditions=react-server (the same
// flag group as markdown-smoke.ts).
//
// Run: npx tsx scripts/wysiwyg-smoke.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownPreview } from "../src/components/markdown-preview";
import { markdownToDoc } from "../src/components/problem-body-editor/markdown/markdown-to-doc";
import { docToMarkdown } from "../src/components/problem-body-editor/markdown/doc-to-markdown";
import { escapeMarkdownText } from "../src/components/problem-body-editor/markdown/escape";

interface CorpusEntry {
  code: string;
  bodyMd: string;
}

let unitFailures = 0;

function unit(label: string, pred: boolean, detail?: string) {
  if (pred) {
    console.log(`pass: ${label}`);
  } else {
    unitFailures++;
    console.error(`FAIL (unit): ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function render(source: string): string {
  return renderToStaticMarkup(
    React.createElement(MarkdownPreview, { source })
  );
}

/** Collapse insignificant whitespace so render comparison ignores reflow. */
function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, " ").trim();
}

// ── Focused unit assertions ──────────────────────────────────────────────
{
  // 1. Plain paragraph.
  const doc = markdownToDoc("Hello world.");
  unit(
    "plain paragraph → one paragraph text node",
    deepEqual(doc, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world." }] },
      ],
    }),
    JSON.stringify(doc)
  );
}

{
  // 2. Inline math.
  const doc = markdownToDoc("a $x^2$ b");
  unit(
    "inline $..$ → mathInline between text",
    deepEqual(doc, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a " },
            { type: "mathInline", attrs: { latex: "x^2" } },
            { type: "text", text: " b" },
          ],
        },
      ],
    }),
    JSON.stringify(doc)
  );
}

{
  // 3. Single-line $$..$$ → display block (NOT inline), per the source delimiter.
  const doc = markdownToDoc("$$x^2$$");
  unit(
    "single-line $$..$$ → mathDisplay block",
    deepEqual(doc, {
      type: "doc",
      content: [{ type: "mathDisplay", attrs: { latex: "x^2" } }],
    }),
    JSON.stringify(doc)
  );
}

{
  // 4. Standalone image → block image node.
  const doc = markdownToDoc("![alt text](http://example.com/a.png)");
  unit(
    "standalone image → image block",
    deepEqual(doc, {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "http://example.com/a.png", alt: "alt text" },
        },
      ],
    }),
    JSON.stringify(doc)
  );
}

{
  // 5. Paragraph followed by image.
  const doc = markdownToDoc("Some text.\n\n![d](x.png)");
  unit(
    "paragraph + image → two blocks",
    deepEqual(doc, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Some text." }] },
        { type: "image", attrs: { src: "x.png", alt: "d" } },
      ],
    }),
    JSON.stringify(doc)
  );
}

{
  // 6. Literal-$ escaping: text with a `$` serializes to `\$` and re-parses
  //    back to the same plain text.
  const escaped = escapeMarkdownText("price is $5 and $10");
  unit("escapeMarkdownText escapes literal $", escaped === "price is \\$5 and \\$10", escaped);
  const doc = markdownToDoc(escaped);
  unit(
    "escaped literal $ re-parses to plain text",
    deepEqual(doc, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "price is $5 and $10" }] },
      ],
    }),
    JSON.stringify(doc)
  );
}

{
  // 7. Empty string → single empty paragraph; serializes back to "".
  const doc = markdownToDoc("");
  unit(
    "empty string → single empty paragraph",
    deepEqual(doc, { type: "doc", content: [{ type: "paragraph" }] }),
    JSON.stringify(doc)
  );
  unit("empty doc → empty string", docToMarkdown(doc) === "", JSON.stringify(docToMarkdown(doc)));
}

// ── Corpus round-trip + render-equivalence ───────────────────────────────
const corpusPath = resolve(__dirname, "fixtures", "wysiwyg-corpus.json");
const corpus: CorpusEntry[] = JSON.parse(readFileSync(corpusPath, "utf8"));

let tested = 0;
let roundTripStable = 0;
let renderEqual = 0;
const failures: string[] = [];

for (const { code, bodyMd } of corpus) {
  tested++;

  const doc = markdownToDoc(bodyMd);
  const md2 = docToMarkdown(doc);
  const doc2 = markdownToDoc(md2);

  const stable = deepEqual(doc2, doc);
  if (stable) {
    roundTripStable++;
  } else {
    failures.push(
      `${code}: round-trip UNSTABLE\n    md2=${JSON.stringify(md2)}\n    doc =${JSON.stringify(doc)}\n    doc2=${JSON.stringify(doc2)}`
    );
  }

  let equal = false;
  try {
    equal = normalizeHtml(render(bodyMd)) === normalizeHtml(render(md2));
  } catch (e) {
    failures.push(`${code}: render threw — ${(e as Error).message}`);
  }
  if (equal) {
    renderEqual++;
  } else if (stable) {
    // Only report a render mismatch separately if the structure was stable
    // (an unstable doc is already reported above).
    failures.push(
      `${code}: render MISMATCH\n    body=${JSON.stringify(bodyMd)}\n    md2 =${JSON.stringify(md2)}`
    );
  }
}

console.log(
  `\nCorpus: ${tested} tested / ${roundTripStable} round-trip-stable / ${renderEqual} render-equal`
);

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error("  - " + f);
}

const allGood =
  unitFailures === 0 &&
  tested > 0 &&
  roundTripStable === tested &&
  renderEqual === tested;

if (allGood) {
  console.log("\nWYSIWYG smoke: PASSED");
} else {
  console.error("\nWYSIWYG smoke: FAILED");
  process.exit(1);
}
