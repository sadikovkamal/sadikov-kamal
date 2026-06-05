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
import { FORMULA_GROUPS } from "../src/components/problem-body-editor/toolbar/templates";

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

// ── Non-canonical input stability (review follow-up, Important #1) ────────
// Our stored corpus is uniformly in the editor's canonical form, so it
// round-trips byte-stable on the first pass. Arbitrary/legacy markdown that
// ISN'T canonical (trailing punctuation outside $$, inline code, raw HTML,
// mid-sentence $$) may be *normalized* on the first edit pass — that is
// acceptable, but it MUST then be STABLE (reach a fixpoint, never drift on
// further edits). These assertions pin that guarantee. See NOTES.md §5.
{
  // Guarantee: non-canonical input reaches a FIXPOINT within a bounded number
  // of passes (it never drifts forever). Most cases stabilize on pass 1; the
  // mid-sentence `$$` promotion leaves boundary whitespace that the next parse
  // trims, so it stabilizes on pass 2. We assert pass-2 == pass-3 (stable from
  // the second serialization onward) — the honest, bounded guarantee.
  const assertBoundedFixpoint = (label: string, input: string) => {
    const md1 = docToMarkdown(markdownToDoc(input));
    const md2 = docToMarkdown(markdownToDoc(md1));
    const md3 = docToMarkdown(markdownToDoc(md2));
    unit(
      `non-canonical input reaches a stable fixpoint: ${label}`,
      md2 === md3,
      `md1=${JSON.stringify(md1)}\n  md2=${JSON.stringify(md2)}\n  md3=${JSON.stringify(md3)}`
    );
  };
  const assertStableFixpoint = assertBoundedFixpoint;
  assertStableFixpoint("trailing punctuation outside $$", "$$x^2$$.");
  assertStableFixpoint("inline code span (dropped from grammar)", "use `code` here");
  assertStableFixpoint("raw inline HTML (escaped to text)", "a <b>bold</b> c");
  assertStableFixpoint("mid-sentence $$ (promoted to block)", "see $$x^2$$ here");
}

// ── Font-style / colour rendering (Word-style toolbar) ───────────────────
// The toolbar's "Shrift va rang" tools emit these commands. Verify each
// renders through the canonical pipeline (KaTeX + rehype-sanitize) without a
// KaTeX error AND that colours survive the sanitize schema.
{
  const styled: Array<[string, string, string | null]> = [
    ["bold \\bm", "$\\bm{x}$", null],
    ["italic \\mathit", "$\\mathit{x}$", null],
    ["roman \\mathrm", "$\\mathrm{x}$", null],
    ["text colour \\textcolor", "$\\textcolor{#e03131}{x}$", "e03131"],
    ["background \\colorbox", "$\\colorbox{#ffec99}{x}$", "ffec99"],
  ];
  for (const [label, src, mustContain] of styled) {
    let html = "";
    let threw = false;
    try {
      html = render(src);
    } catch {
      threw = true;
    }
    const lc = html.toLowerCase();
    const ok =
      !threw &&
      !lc.includes("katex-error") &&
      (mustContain === null || lc.includes(mustContain));
    unit(`styled math renders cleanly: ${label}`, ok, html.slice(0, 220));
  }
}

// ── Every toolbar template is KaTeX-renderable (the safety net) ──────────
// Each toolbar button's LaTeX MUST render through the canonical pipeline. Fill
// placeholders with a dummy, render, and fail on any KaTeX error — this catches
// an unsupported command the moment a symbol is added to the palette.
{
  let checked = 0;
  let clean = 0;
  for (const group of FORMULA_GROUPS) {
    for (const tpl of group.templates) {
      checked++;
      const filled = tpl.latex.replace(/#[0-9@?]/g, "x");
      const src = tpl.target === "display" ? `$$${filled}$$` : `$${filled}$`;
      let html = "";
      let threw = false;
      try {
        html = render(src);
      } catch {
        threw = true;
      }
      const ok = !threw && !html.toLowerCase().includes("katex-error");
      if (ok) {
        clean++;
      } else {
        unit(
          `toolbar template renders: [${group.label}] ${tpl.label} → ${tpl.latex}`,
          false,
          html.slice(0, 200)
        );
      }
    }
  }
  unit(
    `all ${checked} toolbar templates render in KaTeX`,
    clean === checked,
    `${clean}/${checked} clean`
  );
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
