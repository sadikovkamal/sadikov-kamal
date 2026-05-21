// Server-rendered smoke test for src/components/markdown-preview.tsx.
// Exercises math, tables, code, and XSS sanitization in one go.
//
// Run: npx tsx scripts/markdown-smoke.ts

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownPreview } from "../src/components/markdown-preview";

function expect(label: string, html: string, pred: (s: string) => boolean) {
  if (!pred(html)) {
    console.error(`FAIL: ${label}`);
    console.error(`---HTML (${html.length} chars)---\n${html}\n---END---`);
    process.exit(1);
  }
  console.log(`pass: ${label}`);
}

function render(source: string): string {
  return renderToStaticMarkup(React.createElement(MarkdownPreview, { source }));
}

// 1. Inline + display math
{
  const html = render(
    "The function $f(x) = x^2$ has a minimum at $x = 0$.\n\n$$\n\\int_0^1 x \\, dx = \\frac{1}{2}\n$$\n"
  );
  expect("inline math .katex span present", html, (s) => /class="katex"/.test(s));
  expect("display math .katex-display present", html, (s) => /class="katex-display"/.test(s));
  // KaTeX preserves the original TeX inside <annotation> for accessibility,
  // so \frac will appear there. Verify the *visual* rendering produced the
  // integral glyph (∫) outside any annotation tag.
  expect("integral glyph rendered visually", html, (s) => /∫/.test(s.replace(/<annotation[\s\S]*?<\/annotation>/g, "")));
}

// 2. GFM table
{
  const html = render(
    "| Step | Reasoning |\n|------|-----------|\n| 1 | Apply Cauchy-Schwarz |\n| 2 | Conclude |"
  );
  expect("table tag emitted", html, (s) => /<table/.test(s));
  expect("table contains row content", html, (s) => /Cauchy-Schwarz/.test(s));
}

// 3. Code block highlighting
{
  const html = render(
    "```python\ndef f(n):\n    return n * (n + 1) // 2\n```"
  );
  expect("pre/code emitted", html, (s) => /<pre/.test(s) && /<code/.test(s));
  expect("hljs language class applied", html, (s) => /hljs|language-python/.test(s));
}

// 4. Cases environment renders without errors
{
  const html = render(
    "$$\nf(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}\n$$\n"
  );
  expect("cases display math present", html, (s) => /class="katex-display"/.test(s));
  expect("MathML emitted (mtable)", html, (s) => /<mtable/.test(s));
}

// 5. Aligned environment
{
  const html = render(
    "$$\n\\begin{aligned}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n        &= a^2 + b^2 + 2ab\n\\end{aligned}\n$$\n"
  );
  expect("aligned display math present", html, (s) => /class="katex-display"/.test(s));
}

// 6. XSS: <script> tag
{
  const html = render("<script>alert('xss')</script>\n\nNormal paragraph.");
  expect("<script> stripped", html, (s) => !/<script>/.test(s));
  expect("paragraph content survives", html, (s) => /Normal paragraph/.test(s));
}

// 7. XSS: javascript: link
{
  const html = render("[click me](javascript:alert('xss'))");
  expect("javascript: href stripped", html, (s) => !/javascript:/i.test(s));
}

// 8. XSS: img onerror
{
  const html = render('<img src=x onerror="alert(1)">');
  expect("img onerror stripped", html, (s) => !/onerror/i.test(s));
}

// 9. Image rendering (allowed)
{
  const html = render("![diagram](https://placehold.co/400x200)");
  expect("img tag with src emitted", html, (s) => /<img[^>]+src="https:\/\/placehold\.co/.test(s));
}

// 10. Greek letters / sums
{
  const html = render("$\\alpha + \\beta = \\gamma$ and $\\sum_{i=1}^{n} i$");
  expect("greek letters rendered (alpha mi tag)", html, (s) => /<mi>α<\/mi>|<mi[^>]*>α/.test(s) || /class="mord mathnormal"/.test(s));
}

// 11. Square roots — radicals draw via inline <svg>, which used to be
// stripped by the sanitize schema, so the operand showed up without
// the radical line ("√ab" rendered as " ab"). Lock that fix here.
{
  const html = render("Prove $6a + 4b + 5c \\geq 5\\sqrt{ab} + 7\\sqrt{ac} + 3\\sqrt{bc}$.");
  expect("radical svg survives sanitize", html, (s) => /<svg[\s\S]*?<path/.test(s));
  expect("radical operand still present (ab)", html, (s) => /ab/.test(s));
  // MathML side: <msqrt> must also survive (allows screen readers to
  // announce "square root of ab" even if the SVG is hidden visually).
  expect("MathML <msqrt> survives sanitize", html, (s) => /<msqrt/.test(s));
}

// 12. Full KaTeX feature audit — each construct below was at one point
// at risk of being silently stripped. Render each and assert both that
// (a) the MathML accessibility tag survives, and (b) the visual HTML
// span/svg the SAME feature relies on also survives. If any of these
// fail, a category of formulas would render mangled in production.

// 12.1 nth roots — <mroot> + svg radical
{
  const html = render("$\\sqrt[3]{x}$");
  expect("nth root: <mroot>", html, (s) => /<mroot/.test(s));
  expect("nth root: svg radical", html, (s) => /<svg[\s\S]*?<path/.test(s));
}

// 12.2 fractions and binomials — <mfrac> with linethickness
{
  const html = render("$\\frac{a+b}{c-d} + \\binom{n}{k}$");
  expect("fraction: <mfrac>", html, (s) => /<mfrac/.test(s));
  // \binom renders with linethickness="0"; must survive sanitize.
  expect("binomial: linethickness attr", html, (s) => /linethickness=/.test(s));
}

// 12.3 sub/sup, integrals, sums, products — <msub>/<msup>/<msubsup>
{
  const html = render("$\\sum_{i=1}^{n} i^2 + \\int_0^1 x \\, dx + \\prod_{k=1}^{n} a_k$");
  expect("sub/sup: <msubsup>", html, (s) => /<msubsup/.test(s));
  expect("sum operator visible", html, (s) => /∑/.test(s.replace(/<annotation[\s\S]*?<\/annotation>/g, "")));
  expect("integral operator visible", html, (s) => /∫/.test(s.replace(/<annotation[\s\S]*?<\/annotation>/g, "")));
}

// 12.4 mathbb / mathfrak / mathcal — <mi> with mathvariant
{
  const html = render("$\\mathbb{R} \\subset \\mathbb{C}, \\mathfrak{g}, \\mathcal{L}$");
  // mathvariant is what makes ℝ render as the blackboard-bold R rather
  // than a plain italic R. If stripped, the visual distinction is lost.
  expect("mathvariant attribute survives", html, (s) => /mathvariant=/.test(s));
}

// 12.5 over-accents — <mover> with accent
{
  const html = render("$\\hat{x} + \\widehat{abc} + \\overrightarrow{AB}$");
  expect("over-accent: <mover>", html, (s) => /<mover/.test(s));
  // \overrightarrow uses svg for the stretchy arrow on top.
  expect("overrightarrow: svg path", html, (s) => /<svg[\s\S]*?<path/.test(s));
}

// 12.6 under-accents — <munder>
{
  const html = render("$\\underbrace{a+b+c}_{=S} \\underline{xyz}$");
  expect("under-accent: <munder>", html, (s) => /<munder/.test(s));
}

// 12.7 over-and-under combined — <munderover>
{
  const html = render("$\\sum_{i=1}^{n}$ display: $\\displaystyle\\sum_{i=1}^{n}$");
  expect("displaystyle sum: <munderover>", html, (s) => /<munderover/.test(s));
}

// 12.8 cancel / boxed — <menclose> with notation
{
  const html = render("$\\frac{\\cancel{a}b}{\\cancel{a}c} = \\boxed{E=mc^2}$");
  expect("menclose tag survives", html, (s) => /<menclose/.test(s));
  expect("menclose notation attr", html, (s) => /notation=/.test(s));
  // \cancel draws the strikethrough line via SVG <line>.
  expect("cancel uses <line>", html, (s) => /<line[\s\S]*?x1=/.test(s));
}

// 12.9 stretchy delimiters — \left( \right)
{
  const html = render("$\\left( \\frac{a}{b} \\right) \\left[ x \\right]$");
  expect("stretchy mo attrs", html, (s) => /stretchy=|fence=/.test(s));
}

// 12.10 matrices and arrays — <mtable> with column alignment
{
  const html = render("$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$");
  expect("matrix: <mtable>", html, (s) => /<mtable/.test(s));
  expect("matrix: columnalign attr", html, (s) => /columnalign=/.test(s));
}

// 12.11 color — <mstyle> with mathcolor
{
  const html = render("$\\color{red}{x^2 + y^2}$");
  expect("color: <mstyle>", html, (s) => /<mstyle/.test(s));
  expect("mathcolor attr survives", html, (s) => /mathcolor=/.test(s));
}

// 12.12 long stretchy arrows — \xrightarrow, \Longrightarrow
{
  const html = render("$A \\xrightarrow{f} B \\Longrightarrow C$");
  // Long arrows are drawn via SVG paths. Without <svg><path> in the
  // schema, the arrowhead disappears and only the label survives.
  expect("long arrows: <svg><path>", html, (s) => /<svg[\s\S]*?<path/.test(s));
}

// 12.13 overbrace / underbrace
{
  const html = render("$\\overbrace{a+b+c}^{=S}$");
  // Renders both <mover> for the accessibility tree and an svg brace.
  expect("overbrace: <mover>", html, (s) => /<mover/.test(s));
  expect("overbrace: svg", html, (s) => /<svg[\s\S]*?<path/.test(s));
}

// 12.14 nested radicals — recursive structure must survive
{
  const html = render("$\\sqrt{\\sqrt{x} + \\sqrt{y}}$");
  // Should produce at least 3 svg radicals (outer + two inner).
  const svgCount = (html.match(/<svg/g) ?? []).length;
  expect("nested radicals: 3+ svgs", html, () => svgCount >= 3);
}

// 12.15 text inside math — \text{...}
{
  const html = render("$x \\text{ is positive when } x > 0$");
  expect("text-in-math: <mtext>", html, (s) => /<mtext/.test(s));
}

// 12.16 cases environment — already tested above (case 4) but assert
// the columnalign attr too since it's what gives cases their look.
{
  const html = render("$$f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}$$");
  expect("cases: columnalign", html, (s) => /columnalign=/.test(s));
}

// 12.17 spacing commands — \, \! \quad — should not leave gaps
{
  const html = render("$a \\, b \\quad c \\! d$");
  expect("spacing: <mpadded> or <mspace>", html, (s) => /<mpadded|<mspace/.test(s));
}

console.log("\nMarkdown smoke: PASSED");
