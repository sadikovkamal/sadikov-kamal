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

console.log("\nMarkdown smoke: PASSED");
