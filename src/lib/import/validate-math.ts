import "server-only";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import katex from "katex";

/**
 * Import-time LaTeX validation.
 *
 * Bulk import stores the `# Shart` body verbatim — it never parses or
 * validates the math. So a malformed formula in a bundle (e.g. an
 * unbalanced brace, or a command KaTeX doesn't support) used to sail
 * through import and only surface as a red `katex-error` span on the
 * public page. This module closes that gap: it extracts every math node
 * exactly the way the renderer does (remark-math: the same parser behind
 * the public/print pipeline) and runs each through KaTeX with
 * `throwOnError: true`, so a bad formula is reported as a per-problem
 * import error and the whole bundle is rejected for the admin to fix —
 * matching the v2 "fix the ZIP, retry" contract.
 *
 * Using remark-math (not a hand-rolled `$...$` regex) means validation
 * sees precisely the spans the renderer will try to render: no false
 * positives on stray `$` and no false negatives on escaped delimiters.
 */

// remark-parse + remark-math produce `math` (block) and `inlineMath`
// (inline) nodes carrying the raw LaTeX in `.value`.
const processor = unified().use(remarkParse).use(remarkMath);

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

function collectMath(
  node: MdNode,
  out: { latex: string; display: boolean }[]
): void {
  if (node.type === "math") {
    out.push({ latex: node.value ?? "", display: true });
  } else if (node.type === "inlineMath") {
    out.push({ latex: node.value ?? "", display: false });
  }
  if (node.children) {
    for (const child of node.children) collectMath(child, out);
  }
}

export interface MathError {
  /** The offending LaTeX source (trimmed for the error message). */
  latex: string;
  /** KaTeX's parse-error message. */
  message: string;
}

/**
 * Returns one entry per formula in `bodyMd` that KaTeX cannot render.
 * An empty array means every formula is valid.
 *
 * `strict: "ignore"` mirrors how the app renders math elsewhere
 * (math-icon.tsx) — only HARD errors (undefined control sequence,
 * unbalanced braces, bad arguments) throw under `throwOnError: true`;
 * soft Unicode/spacing warnings are not treated as failures, so a
 * formula that renders fine in the editor is never falsely rejected.
 */
export function validateBodyMath(bodyMd: string): MathError[] {
  const tree = processor.parse(bodyMd) as unknown as MdNode;
  const maths: { latex: string; display: boolean }[] = [];
  collectMath(tree, maths);

  const errors: MathError[] = [];
  for (const m of maths) {
    const latex = m.latex.trim();
    if (!latex) continue;
    try {
      katex.renderToString(latex, {
        throwOnError: true,
        displayMode: m.display,
        strict: "ignore",
      });
    } catch (e) {
      errors.push({
        latex,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return errors;
}
