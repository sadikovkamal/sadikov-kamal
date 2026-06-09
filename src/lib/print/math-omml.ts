import "server-only";

import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { SerializedMmlVisitor } from "mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js";
// Side-effect imports register the TeX extension packages we enable below.
// Each `packages` entry MUST have a matching side-effect import here, or
// MathJax can't find its config at parse time (autoload/dynamic require is
// NOT available in this no-loader, no-output-jax setup — that is why the
// `cancel`/`extpfeil` macros silently fell through to the text fallback
// before, even though autoload nominally maps them).
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/cancel/CancelConfiguration.js";
import "mathjax-full/js/input/tex/extpfeil/ExtpfeilConfiguration.js";
import "mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js";
// `configmacros` is what makes the TeX `macros` option below take effect;
// without it the custom \oiint/\overgroup definitions are silently ignored.
import "mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js";
// `unicode` provides \unicode{xNNNN}, used by the \oiint/\oiiint macros to
// emit the contour-integral glyphs that no TeX package defines.
import "mathjax-full/js/input/tex/unicode/UnicodeConfiguration.js";
import { mml2omml } from "mathml2omml";

/**
 * Server-only LaTeX -> OMath (Office Math Markup) conversion.
 *
 * Pipeline:
 *   1. MathJax (TeX input) parses the LaTeX source into an MmlNode tree.
 *   2. SerializedMmlVisitor serialises that tree to a MathML XML string.
 *   3. `mathml2omml` walks the MathML AST and emits a Word-native
 *      OMath fragment (<m:oMath>...) ready to drop into a docx body.
 *
 * Why `mathml2omml` instead of the vendored Microsoft MML2OMML.XSL: the
 * XSLT relies on namespace-aware XPath template matching, which the
 * pure-JS `xslt-processor` library does not implement correctly — every
 * structural template (mfrac, msqrt, msup, …) falls through to the
 * catch-all and produces a flat text-only OMath that Word renders as
 * plain characters instead of a real equation. `mathml2omml` is a small
 * dedicated library by the FidusWriter team that ports the same
 * transform to JS directly, no XSLT engine needed.
 *
 * The MathJax document, TeX input jax, and MathML visitor are all heavy
 * to construct (cold start ~150 ms). We cache the lot in module-level
 * `let`s so the cost is paid exactly once per worker.
 */

type MathDocument = ReturnType<typeof mathjax.document>;

let cachedDocument: MathDocument | null = null;
let cachedVisitor: SerializedMmlVisitor | null = null;
let htmlHandlerRegistered = false;

function getMathDocument(): MathDocument {
  if (cachedDocument) return cachedDocument;

  // The HTML handler must be registered exactly once globally; mathjax's
  // handlers list throws on duplicate registration.
  if (!htmlHandlerRegistered) {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    htmlHandlerRegistered = true;
  }

  // We deliberately DON'T use AllPackages: it pulls in bussproofs, which
  // calls getBBox() on the output jax during compile; since we operate
  // without an output jax (we serialise the MmlNode tree directly),
  // bussproofs throws and forces every conversion into the fallback path.
  //
  // Instead we enable an explicit, vetted set:
  //   base + ams  — fractions, roots, sums/integrals, matrices, accents, …
  //   cancel      — \cancel \bcancel \xcancel \cancelto
  //   extpfeil    — \xlongequal \xtwoheadrightarrow \xtwoheadleftarrow \xmapsto …
  //   mathtools   — \xLeftarrow \xRightarrow \xLeftrightarrow \xhookrightarrow …
  // Every one of these is exercised by scripts/print-omml-coverage.ts, which
  // asserts that all toolbar templates convert to structural OMML (no
  // "Undefined control sequence" text fallback). A few constructs have no
  // package at all (\oiint \oiiint \overgroup \undergroup) and are mapped to
  // supported equivalents via `macros` below.
  const tex = new TeX({
    packages: [
      "base",
      "ams",
      "cancel",
      "extpfeil",
      "mathtools",
      "configmacros",
      "unicode",
    ],
    macros: {
      // Contour double/triple integrals: no MathJax package defines these
      // (only \oint exists). Render the proper Unicode contour-integral
      // glyphs as a math operator so sub/superscript limits attach.
      oiint: "\\mathop{\\unicode{x222F}}",
      oiiint: "\\mathop{\\unicode{x2230}}",
      // Over/under arcs: \overgroup/\undergroup are unsupported here, but
      // \overparen/\underparen (base) draw the same stretchy arc accent.
      overgroup: ["\\overparen{#1}", 1],
      undergroup: ["\\underparen{#1}", 1],
    },
  });

  // We stop the pipeline at STATE.CONVERT and serialise the MathML tree
  // ourselves via SerializedMmlVisitor, so no output jax is needed.
  cachedDocument = mathjax.document("", {
    InputJax: tex,
  });
  return cachedDocument;
}

function getVisitor(): SerializedMmlVisitor {
  if (!cachedVisitor) {
    cachedVisitor = new SerializedMmlVisitor();
  }
  return cachedVisitor;
}

/**
 * Escape a string for safe inclusion as XML text (between tags).
 * Mirrors the minimal set required by the XML 1.0 specification.
 */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildFallback(latex: string): string {
  return `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>${escapeXmlText(latex)}</m:t></m:r></m:oMath>`;
}

/**
 * Convert a LaTeX expression into an OMath XML fragment.
 *
 * Returns a string that always contains a self-contained `<m:oMath>`
 * element with `xmlns:m` bound, suitable for raw-XML injection into a
 * `docx` `Paragraph`.
 *
 * On any unexpected error the function returns a textual-only OMath
 * fallback carrying the original LaTeX source, so a single broken
 * formula never takes down the surrounding .docx generation pipeline.
 */
export function mathToOmml(
  latex: string,
  opts?: { display?: boolean },
): string {
  const display = opts?.display === true;
  try {
    const doc = getMathDocument();
    const visitor = getVisitor();

    // Step 1: TeX -> MmlNode. STATE.CONVERT (= 100) stops the pipeline
    // before any output jax is invoked; we only want the MathML tree.
    const node = doc.convert(latex, {
      display,
      end: 100,
    });

    // Step 2: MmlNode -> MathML XML string.
    let mathml = visitor.visitTree(node);

    // Mark the root <math> element as display block when the caller asked
    // for displayMath. `mathml2omml` does not honour the display attribute
    // for layout (Word's OMath has no equivalent flag at the element level,
    // it's a paragraph-level concern), so this is informational only — but
    // we keep it so the MathML round-trips cleanly if we ever serialise
    // it back out for debugging.
    if (display && mathml.startsWith("<math")) {
      if (/<math[^>]*\sdisplay=/u.test(mathml)) {
        mathml = mathml.replace(
          /<math([^>]*)\sdisplay="[^"]*"/u,
          '<math$1 display="block"',
        );
      } else {
        mathml = mathml.replace(/<math\b/u, '<math display="block"');
      }
    }

    // Step 3: MathML -> OMML. The output is a complete <m:oMath>
    // fragment with the `xmlns:m` namespace bound on the root element,
    // which is exactly what the docx library expects for raw-XML
    // injection (via ImportedXmlComponent).
    const omml = mml2omml(mathml);
    if (!omml || !omml.includes("<m:oMath")) {
      throw new Error("mathml2omml produced no <m:oMath> root");
    }
    return omml;
  } catch (err) {
    const preview = latex.length > 100 ? `${latex.slice(0, 100)}...` : latex;
    console.warn(
      `mathToOmml failed for ${preview}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return buildFallback(latex);
  }
}
