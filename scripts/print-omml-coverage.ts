// Coverage smoke for the Word/.docx export math pipeline.
//
// Runs EVERY toolbar formula template through `mathToOmml` (the exact
// LaTeX -> Office Math conversion the print/export path uses) and asserts
// that each one produces STRUCTURAL OMML — not the silent text fallback
// where MathJax emits "Undefined control sequence \foo" and the formula
// prints as literal English text instead of an equation.
//
// This guards the production trap discovered in the pre-release audit:
// ~22 templates (\oiint, \oiiint, \cancel family, \overgroup/\undergroup,
// the capital/extended extensible arrows) rendered fine in the editor
// (KaTeX) but degraded to "Undefined control sequence" in Word until the
// matching MathJax packages + macro fallbacks were enabled in math-omml.ts.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/print-omml-coverage.ts
//
// Why --conditions=react-server: math-omml.ts opens with `import
// "server-only"`, which throws at import time under the default Node
// resolver. The react-server condition resolves the no-op stub.

import { mathToOmml } from "../src/lib/print/math-omml";
import { FORMULA_GROUPS } from "../src/components/problem-body-editor/toolbar/templates";

interface Failure {
  group: string;
  label: string;
  latex: string;
  reason: string;
}

// A template degraded to the text fallback if the OMML carries a MathJax
// error string, or if it serialised to a bare text-only <m:oMath> (the
// buildFallback shape) carrying the raw LaTeX back-slashes.
function detectFallback(_latex: string, omml: string): string | null {
  if (/Undefined control sequence/i.test(omml)) {
    return "MathJax: Undefined control sequence (text fallback in Word)";
  }
  // A correct conversion resolves every macro to a Unicode glyph; real OMML
  // text never contains a `\command` token. So a `\` followed by letters in
  // the output means the raw LaTeX leaked through (either buildFallback or a
  // MathJax error string) — i.e. the formula would print as literal text in
  // Word instead of as an equation. (A lone backslash glyph is fine; only
  // `\` + letters indicates an unrendered command.)
  if (/\\[a-zA-Z]+/.test(omml)) {
    return `raw LaTeX leaked into OMML (text fallback in Word): ${omml.match(/\\[a-zA-Z]+/)?.[0]}`;
  }
  return null;
}

const failures: Failure[] = [];
let checked = 0;

for (const group of FORMULA_GROUPS) {
  const groupTemplates = group.sections
    ? group.sections.flatMap((s) => s.templates)
    : (group.templates ?? []);
  for (const tpl of groupTemplates) {
    checked++;
    // Fill placeholders with a plain variable so the structure is concrete.
    const filled = tpl.latex.replace(/#[0-9@?]/g, "x");
    let omml = "";
    try {
      omml = mathToOmml(filled, { display: tpl.target === "display" });
    } catch (err) {
      failures.push({
        group: group.label,
        label: tpl.label,
        latex: tpl.latex,
        reason: `threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const reason = detectFallback(filled, omml);
    if (reason) {
      failures.push({ group: group.label, label: tpl.label, latex: tpl.latex, reason });
    }
  }
}

console.log(`[print-omml-coverage] checked ${checked} toolbar templates`);

if (failures.length > 0) {
  console.error(`\n${failures.length} template(s) degraded to Word text fallback:\n`);
  for (const f of failures) {
    console.error(`  ✗ [${f.group}] ${f.label}`);
    console.error(`      latex:  ${f.latex}`);
    console.error(`      reason: ${f.reason}`);
  }
  console.log("\nprint-omml-coverage: FAILED");
  process.exit(1);
}

console.log(`all ${checked} templates convert to structural OMML (no Word text fallback)`);
console.log("print-omml-coverage: PASSED");
process.exit(0);
