/**
 * Formula templates for the WYSIWYG math editor toolbar.
 *
 * The toolbar is the SINGLE source of math symbols and structures — MathLive's
 * context menu and virtual keyboard are both disabled. Everything a math
 * problem needs lives here, sorted into named groups (like MathType's palette).
 *
 * Each template's LaTeX uses MathLive's placeholder syntax (`#0`, `#1`, … become
 * tab-stops). Clicking a template inserts it into the open formula if one is
 * being edited, otherwise creates a fresh math node seeded with the skeleton.
 *
 * Every command here MUST be KaTeX-renderable — this is enforced by
 * `scripts/wysiwyg-smoke.ts`, which renders every template through the canonical
 * pipeline and fails on any KaTeX error.
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
  /** Which math node to create when inserted with no formula open. */
  target: FormulaTarget;
}

export interface FormulaGroup {
  /** Uzbek group label shown on the popover trigger. */
  label: string;
  /** Short trigger glyph. */
  icon: string;
  templates: FormulaTemplate[];
}

/** Helper: an argument-less symbol (inline). */
const sym = (icon: string, label: string, latex: string): FormulaTemplate => ({
  icon,
  label,
  latex,
  target: "inline",
});

export const FORMULA_GROUPS: FormulaGroup[] = [
  // ── Fractions, roots, powers ──────────────────────────────────────────────
  {
    label: "Kasr, ildiz, daraja",
    icon: "÷√",
    templates: [
      { icon: "a⁄b", label: "Kasr", latex: "\\frac{#0}{#1}", target: "inline" },
      { icon: "√", label: "Kvadrat ildiz", latex: "\\sqrt{#0}", target: "inline" },
      { icon: "ⁿ√", label: "n-darajali ildiz", latex: "\\sqrt[#0]{#1}", target: "inline" },
      { icon: "xⁿ", label: "Daraja", latex: "{#0}^{#1}", target: "inline" },
      { icon: "xₙ", label: "Indeks", latex: "{#0}_{#1}", target: "inline" },
      { icon: "xⁿₘ", label: "Daraja va indeks", latex: "{#0}_{#1}^{#2}", target: "inline" },
      { icon: "(ⁿₖ)", label: "Binomial koeffitsiyent", latex: "\\binom{#0}{#1}", target: "inline" },
      { icon: "x̄", label: "Yuqori chiziq", latex: "\\overline{#0}", target: "inline" },
      { icon: "x̲", label: "Pastki chiziq", latex: "\\underline{#0}", target: "inline" },
    ],
  },

  // ── Big operators ─────────────────────────────────────────────────────────
  {
    label: "Yig'indi va integral",
    icon: "∑∫",
    templates: [
      { icon: "∑", label: "Yig'indi", latex: "\\sum_{#0}^{#1}", target: "inline" },
      { icon: "∏", label: "Ko'paytma", latex: "\\prod_{#0}^{#1}", target: "inline" },
      { icon: "∐", label: "Ko-ko'paytma", latex: "\\coprod_{#0}^{#1}", target: "inline" },
      { icon: "∫", label: "Integral", latex: "\\int_{#0}^{#1}", target: "inline" },
      { icon: "∬", label: "Ikki karra integral", latex: "\\iint_{#0}", target: "inline" },
      { icon: "∭", label: "Uch karra integral", latex: "\\iiint_{#0}", target: "inline" },
      { icon: "∮", label: "Kontur integral", latex: "\\oint_{#0}", target: "inline" },
      { icon: "⋃", label: "Katta birlashma", latex: "\\bigcup_{#0}^{#1}", target: "inline" },
      { icon: "⋂", label: "Katta kesishma", latex: "\\bigcap_{#0}^{#1}", target: "inline" },
      { icon: "⨁", label: "Katta to'g'ri yig'indi", latex: "\\bigoplus_{#0}^{#1}", target: "inline" },
      { icon: "⨂", label: "Katta tenzor", latex: "\\bigotimes_{#0}^{#1}", target: "inline" },
      { icon: "⋁", label: "Katta diz'yunksiya", latex: "\\bigvee_{#0}^{#1}", target: "inline" },
      { icon: "⋀", label: "Katta kon'yunksiya", latex: "\\bigwedge_{#0}^{#1}", target: "inline" },
      { icon: "lim", label: "Limit", latex: "\\lim_{#0}", target: "inline" },
      { icon: "lim sup", label: "Yuqori limit", latex: "\\limsup_{#0}", target: "inline" },
      { icon: "lim inf", label: "Quyi limit", latex: "\\liminf_{#0}", target: "inline" },
      { icon: "d⁄dx", label: "Hosila (d/dx)", latex: "\\frac{d}{d#0}#1", target: "inline" },
      { icon: "dⁿ⁄dxⁿ", label: "n-tartibli hosila", latex: "\\frac{d^{#0}}{d#1^{#0}}#2", target: "inline" },
      { icon: "∂⁄∂x", label: "Xususiy hosila", latex: "\\frac{\\partial #0}{\\partial #1}", target: "inline" },
      { icon: "f′|ₐ", label: "Hosila (nuqtada)", latex: "\\left.\\frac{d#0}{d#1}\\right|_{#1=#2}", target: "inline" },
      { icon: "∫f dx", label: "Aniq integral (dx bilan)", latex: "\\int_{#0}^{#1} #2 \\,d#3", target: "inline" },
    ],
  },

  // ── Relations ─────────────────────────────────────────────────────────────
  {
    label: "Munosabatlar",
    icon: "≤≥",
    templates: [
      sym("=", "Teng", "="),
      sym("≠", "Teng emas", "\\neq"),
      sym("≈", "Taqriban teng", "\\approx"),
      sym("≡", "Ekvivalent", "\\equiv"),
      sym("≅", "Kongruent", "\\cong"),
      sym("∼", "O'xshash", "\\sim"),
      sym("≃", "Asimptotik teng", "\\simeq"),
      sym("∝", "Proporsional", "\\propto"),
      sym("<", "Kichik", "<"),
      sym(">", "Katta", ">"),
      sym("≤", "Kichik yoki teng", "\\leq"),
      sym("≥", "Katta yoki teng", "\\geq"),
      sym("≪", "Ancha kichik", "\\ll"),
      sym("≫", "Ancha katta", "\\gg"),
      sym("≺", "Oldin keladi", "\\prec"),
      sym("≻", "Keyin keladi", "\\succ"),
      sym("≼", "Oldin yoki teng", "\\preceq"),
      sym("≽", "Keyin yoki teng", "\\succeq"),
      sym("⊥", "Perpendikulyar", "\\perp"),
      sym("∥", "Parallel", "\\parallel"),
      sym("≐", "Aniqlanadi", "\\doteq"),
      sym("≍", "Asimptotik", "\\asymp"),
    ],
  },

  // ── Binary operators ──────────────────────────────────────────────────────
  {
    label: "Amallar",
    icon: "±×",
    templates: [
      sym("+", "Qo'shish", "+"),
      sym("−", "Ayirish", "-"),
      sym("±", "Plyus-minus", "\\pm"),
      sym("∓", "Minus-plyus", "\\mp"),
      sym("×", "Ko'paytirish (krest)", "\\times"),
      sym("÷", "Bo'lish", "\\div"),
      sym("·", "Ko'paytirish (nuqta)", "\\cdot"),
      sym("∗", "Yulduzcha", "\\ast"),
      sym("⋆", "Yulduz", "\\star"),
      sym("∘", "Kompozitsiya", "\\circ"),
      sym("∙", "Nuqta", "\\bullet"),
      sym("⊕", "To'g'ri yig'indi", "\\oplus"),
      sym("⊖", "Ayirma (doira)", "\\ominus"),
      sym("⊗", "Tenzor ko'paytma", "\\otimes"),
      sym("⊘", "Bo'lish (doira)", "\\oslash"),
      sym("⊙", "Nuqta (doira)", "\\odot"),
      sym("⊞", "Plyus (kvadrat)", "\\boxplus"),
      sym("∖", "Ayirma (to'plam)", "\\setminus"),
      sym("⋄", "Olmos", "\\diamond"),
      sym("△", "Uchburchak yuqori", "\\bigtriangleup"),
      sym("▽", "Uchburchak quyi", "\\bigtriangledown"),
    ],
  },

  // ── Arrows ────────────────────────────────────────────────────────────────
  {
    label: "O'qlar",
    icon: "→",
    templates: [
      sym("→", "O'ng o'q", "\\to"),
      sym("←", "Chap o'q", "\\leftarrow"),
      sym("↔", "Ikki tomon o'q", "\\leftrightarrow"),
      sym("⇒", "Kelib chiqadi", "\\Rightarrow"),
      sym("⇐", "Chap qo'sh o'q", "\\Leftarrow"),
      sym("⇔", "Ekvivalent (o'q)", "\\Leftrightarrow"),
      sym("↦", "Akslantiradi", "\\mapsto"),
      sym("⟶", "Uzun o'ng o'q", "\\longrightarrow"),
      sym("⟵", "Uzun chap o'q", "\\longleftarrow"),
      sym("⟷", "Uzun ikki tomon", "\\longleftrightarrow"),
      sym("⟹", "Uzun kelib chiqadi", "\\Longrightarrow"),
      sym("↑", "Yuqori o'q", "\\uparrow"),
      sym("↓", "Pastki o'q", "\\downarrow"),
      sym("↕", "Yuqori-past", "\\updownarrow"),
      sym("⇑", "Yuqori qo'sh", "\\Uparrow"),
      sym("⇓", "Pastki qo'sh", "\\Downarrow"),
      sym("↗", "Shimoli-sharq", "\\nearrow"),
      sym("↘", "Janubi-sharq", "\\searrow"),
      sym("↙", "Janubi-g'arb", "\\swarrow"),
      sym("↖", "Shimoli-g'arb", "\\nwarrow"),
      sym("↪", "Pastga ilmoq", "\\hookrightarrow"),
      sym("↩", "Chapga ilmoq", "\\hookleftarrow"),
      sym("⇌", "Muvozanat", "\\rightleftharpoons"),
    ],
  },

  // ── Set theory & logic ────────────────────────────────────────────────────
  {
    label: "To'plam va mantiq",
    icon: "∈∀",
    templates: [
      sym("∈", "Tegishli", "\\in"),
      sym("∉", "Tegishli emas", "\\notin"),
      sym("∋", "O'z ichiga oladi", "\\ni"),
      sym("⊂", "Qism to'plam", "\\subset"),
      sym("⊃", "Ust to'plam", "\\supset"),
      sym("⊆", "Qism yoki teng", "\\subseteq"),
      sym("⊇", "Ust yoki teng", "\\supseteq"),
      sym("⊊", "Xos qism to'plam", "\\subsetneq"),
      sym("∪", "Birlashma", "\\cup"),
      sym("∩", "Kesishma", "\\cap"),
      sym("∖", "Ayirma", "\\setminus"),
      sym("∅", "Bo'sh to'plam", "\\varnothing"),
      sym("∀", "Har qanday", "\\forall"),
      sym("∃", "Mavjud", "\\exists"),
      sym("∄", "Mavjud emas", "\\nexists"),
      sym("¬", "Inkor", "\\neg"),
      sym("∧", "Va (kon'yunksiya)", "\\land"),
      sym("∨", "Yoki (diz'yunksiya)", "\\lor"),
      sym("⟹", "Implikatsiya", "\\implies"),
      sym("⟺", "Agar va faqat agar", "\\iff"),
      sym("∴", "Demak", "\\therefore"),
      sym("∵", "Chunki", "\\because"),
      sym("ℝ", "Haqiqiy sonlar", "\\mathbb{R}"),
      sym("ℕ", "Natural sonlar", "\\mathbb{N}"),
      sym("ℤ", "Butun sonlar", "\\mathbb{Z}"),
      sym("ℚ", "Ratsional sonlar", "\\mathbb{Q}"),
      sym("ℂ", "Kompleks sonlar", "\\mathbb{C}"),
      sym("ℵ", "Alef", "\\aleph"),
    ],
  },

  // ── Greek lowercase ───────────────────────────────────────────────────────
  {
    label: "Yunon (kichik)",
    icon: "αβγ",
    templates: [
      sym("α", "alfa", "\\alpha"),
      sym("β", "beta", "\\beta"),
      sym("γ", "gamma", "\\gamma"),
      sym("δ", "delta", "\\delta"),
      sym("ε", "epsilon", "\\varepsilon"),
      sym("ϵ", "epsilon (lunda)", "\\epsilon"),
      sym("ζ", "dzeta", "\\zeta"),
      sym("η", "eta", "\\eta"),
      sym("θ", "teta", "\\theta"),
      sym("ϑ", "teta (variant)", "\\vartheta"),
      sym("ι", "iota", "\\iota"),
      sym("κ", "kappa", "\\kappa"),
      sym("λ", "lambda", "\\lambda"),
      sym("μ", "myu", "\\mu"),
      sym("ν", "nyu", "\\nu"),
      sym("ξ", "ksi", "\\xi"),
      sym("π", "pi", "\\pi"),
      sym("ϖ", "pi (variant)", "\\varpi"),
      sym("ρ", "ro", "\\rho"),
      sym("ϱ", "ro (variant)", "\\varrho"),
      sym("σ", "sigma", "\\sigma"),
      sym("ς", "sigma (oxirgi)", "\\varsigma"),
      sym("τ", "tau", "\\tau"),
      sym("υ", "upsilon", "\\upsilon"),
      sym("φ", "fi", "\\varphi"),
      sym("ϕ", "fi (variant)", "\\phi"),
      sym("χ", "xi", "\\chi"),
      sym("ψ", "psi", "\\psi"),
      sym("ω", "omega", "\\omega"),
    ],
  },

  // ── Greek uppercase ───────────────────────────────────────────────────────
  {
    label: "Yunon (katta)",
    icon: "ΓΔ",
    templates: [
      sym("Γ", "Gamma", "\\Gamma"),
      sym("Δ", "Delta", "\\Delta"),
      sym("Θ", "Teta", "\\Theta"),
      sym("Λ", "Lambda", "\\Lambda"),
      sym("Ξ", "Ksi", "\\Xi"),
      sym("Π", "Pi", "\\Pi"),
      sym("Σ", "Sigma", "\\Sigma"),
      sym("Υ", "Upsilon", "\\Upsilon"),
      sym("Φ", "Fi", "\\Phi"),
      sym("Ψ", "Psi", "\\Psi"),
      sym("Ω", "Omega", "\\Omega"),
    ],
  },

  // ── Delimiters ────────────────────────────────────────────────────────────
  {
    label: "Qavslar",
    icon: "( )",
    templates: [
      { icon: "( )", label: "Yumaloq qavs", latex: "\\left( #0 \\right)", target: "inline" },
      { icon: "[ ]", label: "Kvadrat qavs", latex: "\\left[ #0 \\right]", target: "inline" },
      { icon: "{ }", label: "Figurali qavs", latex: "\\left\\{ #0 \\right\\}", target: "inline" },
      { icon: "| |", label: "Modul", latex: "\\left| #0 \\right|", target: "inline" },
      { icon: "‖ ‖", label: "Norma", latex: "\\left\\| #0 \\right\\|", target: "inline" },
      { icon: "⟨ ⟩", label: "Burchak qavs", latex: "\\langle #0 \\rangle", target: "inline" },
      { icon: "⌊ ⌋", label: "Pastga yaxlitlash", latex: "\\lfloor #0 \\rfloor", target: "inline" },
      { icon: "⌈ ⌉", label: "Yuqoriga yaxlitlash", latex: "\\lceil #0 \\rceil", target: "inline" },
      { icon: "( ]", label: "Yarim ochiq", latex: "\\left( #0 \\right]", target: "inline" },
      { icon: "[ )", label: "Yarim ochiq (chap)", latex: "\\left[ #0 \\right)", target: "inline" },
    ],
  },

  // ── Accents ───────────────────────────────────────────────────────────────
  {
    label: "Aksentlar",
    icon: "x̂",
    templates: [
      { icon: "x̂", label: "Shlyapa", latex: "\\hat{#0}", target: "inline" },
      { icon: "x̄", label: "Chiziq", latex: "\\bar{#0}", target: "inline" },
      { icon: "x⃗", label: "Vektor", latex: "\\vec{#0}", target: "inline" },
      { icon: "ẋ", label: "Nuqta", latex: "\\dot{#0}", target: "inline" },
      { icon: "ẍ", label: "Ikki nuqta", latex: "\\ddot{#0}", target: "inline" },
      { icon: "x̃", label: "Tilda", latex: "\\tilde{#0}", target: "inline" },
      { icon: "x́", label: "Akut", latex: "\\acute{#0}", target: "inline" },
      { icon: "x̀", label: "Grav", latex: "\\grave{#0}", target: "inline" },
      { icon: "x̌", label: "Galochka", latex: "\\check{#0}", target: "inline" },
      { icon: "x̆", label: "Brev", latex: "\\breve{#0}", target: "inline" },
      { icon: "ˆxy", label: "Keng shlyapa", latex: "\\widehat{#0}", target: "inline" },
      { icon: "˜xy", label: "Keng tilda", latex: "\\widetilde{#0}", target: "inline" },
      { icon: "→AB", label: "Ustki o'ng o'q", latex: "\\overrightarrow{#0}", target: "inline" },
      { icon: "←AB", label: "Ustki chap o'q", latex: "\\overleftarrow{#0}", target: "inline" },
      { icon: "⏞", label: "Ustki qavs", latex: "\\overbrace{#0}", target: "inline" },
      { icon: "⏟", label: "Pastki qavs", latex: "\\underbrace{#0}", target: "inline" },
    ],
  },

  // ── Matrices & structures ─────────────────────────────────────────────────
  {
    label: "Matritsa va tuzilma",
    icon: "[ ⋮ ]",
    templates: [
      { icon: "{", label: "Hollar (cases)", latex: "\\begin{cases}#0 \\\\ #1\\end{cases}", target: "display" },
      { icon: "( )", label: "Matritsa (yumaloq)", latex: "\\begin{pmatrix}#0 & #1 \\\\ #2 & #3\\end{pmatrix}", target: "display" },
      { icon: "[ ]", label: "Matritsa (kvadrat)", latex: "\\begin{bmatrix}#0 & #1 \\\\ #2 & #3\\end{bmatrix}", target: "display" },
      { icon: "| |", label: "Determinant", latex: "\\begin{vmatrix}#0 & #1 \\\\ #2 & #3\\end{vmatrix}", target: "display" },
      { icon: "‖ ‖", label: "Norma matritsa", latex: "\\begin{Vmatrix}#0 & #1 \\\\ #2 & #3\\end{Vmatrix}", target: "display" },
      { icon: "3×3", label: "Matritsa 3×3 (yumaloq)", latex: "\\begin{pmatrix}#0 & #1 & #2 \\\\ #3 & #4 & #5 \\\\ #6 & #7 & #8\\end{pmatrix}", target: "display" },
      { icon: "[3×3]", label: "Matritsa 3×3 (kvadrat)", latex: "\\begin{bmatrix}#0 & #1 & #2 \\\\ #3 & #4 & #5 \\\\ #6 & #7 & #8\\end{bmatrix}", target: "display" },
      { icon: "[⋮]", label: "Ustun vektor", latex: "\\begin{pmatrix}#0 \\\\ #1 \\\\ #2\\end{pmatrix}", target: "display" },
      { icon: "[⋯]", label: "Satr vektor", latex: "\\begin{pmatrix}#0 & #1 & #2\\end{pmatrix}", target: "display" },
      { icon: "⋯", label: "Gorizontal nuqtalar", latex: "\\cdots", target: "inline" },
      { icon: "⋮", label: "Vertikal nuqtalar", latex: "\\vdots", target: "inline" },
      { icon: "⋱", label: "Diagonal nuqtalar", latex: "\\ddots", target: "inline" },
    ],
  },

  // ── Functions ─────────────────────────────────────────────────────────────
  {
    label: "Funksiyalar",
    icon: "sin",
    templates: [
      sym("sin", "sinus", "\\sin"),
      sym("cos", "kosinus", "\\cos"),
      sym("tan", "tangens", "\\tan"),
      sym("cot", "kotangens", "\\cot"),
      sym("sec", "sekans", "\\sec"),
      sym("csc", "kosekans", "\\csc"),
      sym("arcsin", "arksinus", "\\arcsin"),
      sym("arccos", "arkkosinus", "\\arccos"),
      sym("arctan", "arktangens", "\\arctan"),
      sym("sinh", "giperbolik sinus", "\\sinh"),
      sym("cosh", "giperbolik kosinus", "\\cosh"),
      sym("tanh", "giperbolik tangens", "\\tanh"),
      sym("log", "logarifm", "\\log"),
      sym("ln", "natural logarifm", "\\ln"),
      sym("lg", "o'nlik logarifm", "\\lg"),
      sym("exp", "eksponenta", "\\exp"),
      sym("max", "maksimum", "\\max"),
      sym("min", "minimum", "\\min"),
      sym("gcd", "EKUB", "\\gcd"),
      sym("det", "determinant", "\\det"),
      sym("dim", "o'lcham", "\\dim"),
      sym("mod", "modul (qoldiq)", "\\bmod"),
      { icon: "(mod)", label: "Modul bo'yicha", latex: "\\pmod{#0}", target: "inline" },
      { icon: "logₐ", label: "Logarifm (asosi a)", latex: "\\log_{#0}{#1}", target: "inline" },
      sym("arg", "Argument", "\\arg"),
      { icon: "Re", label: "Haqiqiy qism", latex: "\\operatorname{Re}(#0)", target: "inline" },
      { icon: "Im", label: "Mavhum qism", latex: "\\operatorname{Im}(#0)", target: "inline" },
      sym("ker", "Yadro", "\\ker"),
      sym("deg", "Daraja (deg)", "\\deg"),
    ],
  },

  // ── Special symbols ───────────────────────────────────────────────────────
  {
    label: "Maxsus belgilar",
    icon: "∞∂",
    templates: [
      sym("∞", "Cheksizlik", "\\infty"),
      sym("∂", "Xususiy hosila", "\\partial"),
      sym("∇", "Nabla", "\\nabla"),
      sym("′", "Shtrix", "\\prime"),
      sym("°", "Gradus", "^\\circ"),
      sym("∠", "Burchak", "\\angle"),
      sym("∡", "O'lchangan burchak", "\\measuredangle"),
      sym("△", "Uchburchak", "\\triangle"),
      sym("□", "Kvadrat", "\\square"),
      sym("■", "To'la kvadrat", "\\blacksquare"),
      sym("…", "Uch nuqta", "\\ldots"),
      sym("⋯", "Markaziy uch nuqta", "\\cdots"),
      sym("ℏ", "h-chiziqcha", "\\hbar"),
      sym("ℓ", "l harfi", "\\ell"),
      sym("ℜ", "Haqiqiy qism", "\\Re"),
      sym("ℑ", "Mavhum qism", "\\Im"),
      sym("℘", "Veyershtrass", "\\wp"),
      sym("†", "Xanjar", "\\dagger"),
      sym("∝", "Proporsional", "\\propto"),
      sym("∣", "Bo'linadi", "\\mid"),
      sym("∤", "Bo'linmaydi", "\\nmid"),
      sym("%", "Foiz", "\\%"),
    ],
  },
];

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
