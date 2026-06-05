/**
 * Formula templates for the WYSIWYG math editor toolbar.
 *
 * Each template is a labelled entry carrying a LaTeX skeleton that uses
 * MathLive's placeholder syntax (`#0`, `#1`, … — see Phase 0 NOTES.md). When a
 * template is clicked the toolbar inserts a fresh math node seeded with this
 * skeleton and `justInserted: true`, so the node-view opens MathLive focused on
 * the first placeholder (`#0`) — the MathType "fill the boxes" flow.
 *
 * `target` decides which node type is created:
 *   - "inline"  → a `mathInline` atom inside the current paragraph
 *   - "display" → a `mathDisplay` block on its own line
 *
 * Structures that only make sense as their own block (cases, matrices) default
 * to "display"; everything else defaults to "inline".
 *
 * Labels/tooltips are in Uzbek to match the app UI language.
 */

export type FormulaTarget = "inline" | "display";

export interface FormulaTemplate {
  /** Short glyph/icon shown on the button (rendered as plain text, not KaTeX). */
  icon: string;
  /** Uzbek tooltip / accessible label. */
  label: string;
  /** LaTeX skeleton with MathLive `#0`,`#1`,… placeholders. */
  latex: string;
  /** Which math node to create. */
  target: FormulaTarget;
}

export interface FormulaGroup {
  /** Uzbek group label shown on the popover trigger. */
  label: string;
  /** Short trigger glyph. */
  icon: string;
  templates: FormulaTemplate[];
}

/**
 * Font-style actions (like MS Word's Bold / Italic / Upright). Each wraps the
 * CURRENT MathLive selection via the `#@` token, so they only apply while a
 * formula is being edited. The emitted commands are KaTeX-renderable (MathLive
 * normalises `\mathbf` → `\bm`, all of which KaTeX supports).
 */
export interface StyleAction {
  /** Glyph shown on the button. */
  icon: string;
  /** Uzbek tooltip / accessible label. */
  label: string;
  /** LaTeX wrapper applied to the selection (`#@`). */
  latex: string;
}

export const FONT_STYLES: StyleAction[] = [
  { icon: "B", label: "Qalin", latex: "\\mathbf{#@}" },
  { icon: "I", label: "Kursiv", latex: "\\mathit{#@}" },
  { icon: "R", label: "Tik (Roman)", latex: "\\mathrm{#@}" },
];

/**
 * Colour swatches for text colour (`\textcolor`) and background (`\colorbox`).
 * Hex values are universally KaTeX-renderable and survive the public-page
 * sanitize schema (which already allows `style`/`mathcolor`/`mathbackground`).
 */
export interface StyleColor {
  name: string;
  value: string;
}

export const TEXT_COLORS: StyleColor[] = [
  { name: "Qora", value: "#000000" },
  { name: "Qizil", value: "#e03131" },
  { name: "Ko'k", value: "#1971c2" },
  { name: "Yashil", value: "#2f9e44" },
  { name: "To'q sariq", value: "#e8590c" },
  { name: "Binafsha", value: "#9c36b5" },
];

export const BACKGROUND_COLORS: StyleColor[] = [
  { name: "Sariq", value: "#ffec99" },
  { name: "Yashil", value: "#b2f2bb" },
  { name: "Ko'k", value: "#a5d8ff" },
  { name: "Pushti", value: "#ffc9c9" },
  { name: "Sariq-jigarrang", value: "#ffd8a8" },
  { name: "Kulrang", value: "#dee2e6" },
];

/**
 * The grouped palette. Grouping keeps the toolbar compact (popovers) instead of
 * a wall of buttons (plan Step 3.2.3).
 */
export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    label: "Kasr va ildiz",
    icon: "÷√",
    templates: [
      { icon: "a⁄b", label: "Kasr", latex: "\\frac{#0}{#1}", target: "inline" },
      { icon: "√", label: "Kvadrat ildiz", latex: "\\sqrt{#0}", target: "inline" },
      { icon: "ⁿ√", label: "n-darajali ildiz", latex: "\\sqrt[#0]{#1}", target: "inline" },
      { icon: "xⁿ", label: "Daraja", latex: "{#0}^{#1}", target: "inline" },
      { icon: "xₙ", label: "Indeks (pastki belgi)", latex: "{#0}_{#1}", target: "inline" },
      { icon: "(ⁿₖ)", label: "Binomial koeffitsiyent", latex: "\\binom{#0}{#1}", target: "inline" },
    ],
  },
  {
    label: "Yig'indi va integral",
    icon: "∑∫",
    templates: [
      { icon: "∑", label: "Yig'indi", latex: "\\sum_{#0}^{#1}", target: "inline" },
      { icon: "∏", label: "Ko'paytma", latex: "\\prod_{#0}^{#1}", target: "inline" },
      { icon: "∫", label: "Integral", latex: "\\int_{#0}^{#1}", target: "inline" },
      { icon: "∮", label: "Kontur integral", latex: "\\oint_{#0}^{#1}", target: "inline" },
      { icon: "lim", label: "Limit", latex: "\\lim_{#0}", target: "inline" },
      { icon: "∂", label: "Hosila", latex: "\\frac{d#0}{d#1}", target: "inline" },
    ],
  },
  {
    label: "Yunon harflari",
    icon: "αβγ",
    templates: [
      { icon: "α", label: "alfa", latex: "\\alpha", target: "inline" },
      { icon: "β", label: "beta", latex: "\\beta", target: "inline" },
      { icon: "γ", label: "gamma", latex: "\\gamma", target: "inline" },
      { icon: "δ", label: "delta", latex: "\\delta", target: "inline" },
      { icon: "ε", label: "epsilon", latex: "\\varepsilon", target: "inline" },
      { icon: "θ", label: "teta", latex: "\\theta", target: "inline" },
      { icon: "λ", label: "lambda", latex: "\\lambda", target: "inline" },
      { icon: "μ", label: "myu", latex: "\\mu", target: "inline" },
      { icon: "π", label: "pi", latex: "\\pi", target: "inline" },
      { icon: "ρ", label: "ro", latex: "\\rho", target: "inline" },
      { icon: "σ", label: "sigma", latex: "\\sigma", target: "inline" },
      { icon: "φ", label: "fi", latex: "\\varphi", target: "inline" },
      { icon: "ω", label: "omega", latex: "\\omega", target: "inline" },
      { icon: "Γ", label: "Katta Gamma", latex: "\\Gamma", target: "inline" },
      { icon: "Δ", label: "Katta Delta", latex: "\\Delta", target: "inline" },
      { icon: "Σ", label: "Katta Sigma", latex: "\\Sigma", target: "inline" },
      { icon: "Π", label: "Katta Pi", latex: "\\Pi", target: "inline" },
      { icon: "Ω", label: "Katta Omega", latex: "\\Omega", target: "inline" },
    ],
  },
  {
    label: "Munosabat va amallar",
    icon: "≤≥",
    templates: [
      { icon: "≤", label: "Kichik yoki teng", latex: "\\leq", target: "inline" },
      { icon: "≥", label: "Katta yoki teng", latex: "\\geq", target: "inline" },
      { icon: "≠", label: "Teng emas", latex: "\\neq", target: "inline" },
      { icon: "≈", label: "Taqriban teng", latex: "\\approx", target: "inline" },
      { icon: "∈", label: "Tegishli", latex: "\\in", target: "inline" },
      { icon: "⊂", label: "Qism to'plam", latex: "\\subset", target: "inline" },
      { icon: "∪", label: "Birlashma", latex: "\\cup", target: "inline" },
      { icon: "∩", label: "Kesishma", latex: "\\cap", target: "inline" },
      { icon: "·", label: "Ko'paytirish (nuqta)", latex: "\\cdot", target: "inline" },
      { icon: "×", label: "Ko'paytirish (krest)", latex: "\\times", target: "inline" },
      { icon: "±", label: "Plyus-minus", latex: "\\pm", target: "inline" },
      { icon: "→", label: "O'q (chap-o'ng)", latex: "\\to", target: "inline" },
      { icon: "∞", label: "Cheksizlik", latex: "\\infty", target: "inline" },
    ],
  },
  {
    label: "Tuzilmalar",
    icon: "{ }",
    templates: [
      {
        icon: "{",
        label: "Hollar (cases)",
        latex: "\\begin{cases}#0 \\\\ #1\\end{cases}",
        target: "display",
      },
      {
        icon: "( )",
        label: "Matritsa (qavsli)",
        latex: "\\begin{pmatrix}#0 & #1 \\\\ #2 & #3\\end{pmatrix}",
        target: "display",
      },
      {
        icon: "[ ]",
        label: "Matritsa (kvadrat qavs)",
        latex: "\\begin{bmatrix}#0 & #1 \\\\ #2 & #3\\end{bmatrix}",
        target: "display",
      },
    ],
  },
  {
    label: "Vektor va belgilar",
    icon: "→x",
    templates: [
      { icon: "x⃗", label: "Vektor", latex: "\\vec{#0}", target: "inline" },
      { icon: "x̄", label: "Yuqori chiziq", latex: "\\overline{#0}", target: "inline" },
      { icon: "x̂", label: "Keng shlyapa", latex: "\\widehat{#0}", target: "inline" },
      { icon: "x̃", label: "Tilda", latex: "\\widetilde{#0}", target: "inline" },
      { icon: "ẋ", label: "Nuqta (hosila)", latex: "\\dot{#0}", target: "inline" },
    ],
  },
];
