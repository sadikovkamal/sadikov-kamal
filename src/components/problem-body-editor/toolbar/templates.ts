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

/**
 * An optional named sub-block inside a group's popover. Used by large groups
 * (e.g. Qavslar) to keep MathType's sub-palettes visually separated while
 * still living under a SINGLE toolbar button.
 */
export interface FormulaSection {
  /** Uzbek sub-header shown above this block. */
  label: string;
  templates: FormulaTemplate[];
}

export interface FormulaGroup {
  /** Uzbek group label shown on the popover trigger. */
  label: string;
  /** Short trigger glyph. */
  icon: string;
  /**
   * Flat list of templates. Mutually exclusive with `sections` — a group
   * uses one or the other. Optional so a sections-only group can omit it.
   */
  templates?: FormulaTemplate[];
  /** Sub-divided layout (sub-headers). When set, `templates` is ignored. */
  sections?: FormulaSection[];
}

/** Helper: an argument-less symbol (inline). */
const sym = (icon: string, label: string, latex: string): FormulaTemplate => ({
  icon,
  label,
  latex,
  target: "inline",
});

export const FORMULA_GROUPS: FormulaGroup[] = [
  // ── 1. Fraction (its own group, MathType-style) ───────────────────────────
  {
    label: "Kasr",
    icon: "a⁄b",
    templates: [
      { icon: "a⁄b", label: "Kasr (oddiy)", latex: "\\frac{#0}{#1}", target: "inline" },
      { icon: "ᵃ⁄ᵦ", label: "Qiya kasr", latex: "{}^{#0}\\!\\big/\\!_{#1}", target: "inline" },
      { icon: "a/b", label: "Chiziqli kasr", latex: "{#0}/{#1}", target: "inline" },
      { icon: "ⁿ⁄ₘ", label: "Kichik kasr", latex: "\\tfrac{#0}{#1}", target: "inline" },
    ],
  },

  // ── 2. Scripts (subscripts & superscripts) ────────────────────────────────
  {
    label: "Indekslar",
    icon: "xⁿ",
    templates: [
      { icon: "x²", label: "Yuqori indeks (daraja)", latex: "{#0}^{#1}", target: "inline" },
      { icon: "xₙ", label: "Pastki indeks", latex: "{#0}_{#1}", target: "inline" },
      { icon: "xⁿₘ", label: "Pastki va yuqori indeks", latex: "{#0}_{#1}^{#2}", target: "inline" },
      { icon: "ⁿₘx", label: "Chap (oldingi) indeks", latex: "{}_{#0}^{#1}{#2}", target: "inline" },
    ],
  },

  // ── 3. Radicals (roots) ───────────────────────────────────────────────────
  {
    label: "Ildiz",
    icon: "√",
    templates: [
      { icon: "√", label: "Kvadrat ildiz", latex: "\\sqrt{#0}", target: "inline" },
      { icon: "ⁿ√", label: "n-darajali ildiz", latex: "\\sqrt[#0]{#1}", target: "inline" },
    ],
  },

  // ── 4. Integrals ──────────────────────────────────────────────────────────
  {
    label: "Integrallar",
    icon: "∫",
    templates: [
      { icon: "∫", label: "Integral", latex: "\\int #0", target: "inline" },
      { icon: "∫ᵇₐ", label: "Aniq integral (chegarali)", latex: "\\int_{#0}^{#1} #2", target: "inline" },
      { icon: "∫ᶦ", label: "Integral (chegara ustida)", latex: "\\int\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∬", label: "Ikki karra integral", latex: "\\iint #0", target: "inline" },
      { icon: "∬ᵇₐ", label: "Ikki karra (chegarali)", latex: "\\iint_{#0}^{#1} #2", target: "inline" },
      { icon: "∬ᶦ", label: "Ikki karra (chegara ustida)", latex: "\\iint\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∭", label: "Uch karra integral", latex: "\\iiint #0", target: "inline" },
      { icon: "∭ᵇₐ", label: "Uch karra (chegarali)", latex: "\\iiint_{#0}^{#1} #2", target: "inline" },
      { icon: "∭ᶦ", label: "Uch karra (chegara ustida)", latex: "\\iiint\\limits_{#0}^{#1} #2", target: "inline" },
    ],
  },

  // ── 5. Contour integrals ──────────────────────────────────────────────────
  {
    label: "Kontur integrallar",
    icon: "∮",
    templates: [
      { icon: "∮", label: "Kontur integral", latex: "\\oint #0", target: "inline" },
      { icon: "∮ᵇₐ", label: "Kontur (chegarali)", latex: "\\oint_{#0}^{#1} #2", target: "inline" },
      { icon: "∮ᶦ", label: "Kontur (chegara ustida)", latex: "\\oint\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∯", label: "Ikki kontur integral", latex: "\\oiint #0", target: "inline" },
      { icon: "∯ᵇₐ", label: "Ikki kontur (chegarali)", latex: "\\oiint_{#0}^{#1} #2", target: "inline" },
      { icon: "∯ᶦ", label: "Ikki kontur (chegara ustida)", latex: "\\oiint\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∰", label: "Uch kontur integral", latex: "\\oiiint #0", target: "inline" },
      { icon: "∰ᵇₐ", label: "Uch kontur (chegarali)", latex: "\\oiiint_{#0}^{#1} #2", target: "inline" },
      { icon: "∰ᶦ", label: "Uch kontur (chegara ustida)", latex: "\\oiiint\\limits_{#0}^{#1} #2", target: "inline" },
    ],
  },

  // ── 6. Differentials ──────────────────────────────────────────────────────
  {
    label: "Differensiallar",
    icon: "dx",
    templates: [
      { icon: "dx", label: "dx", latex: "dx", target: "inline" },
      { icon: "dy", label: "dy", latex: "dy", target: "inline" },
      { icon: "dz", label: "dz", latex: "dz", target: "inline" },
      { icon: "dt", label: "dt", latex: "dt", target: "inline" },
      { icon: "dθ", label: "dθ", latex: "d\\theta", target: "inline" },
      { icon: "d□", label: "d (umumiy)", latex: "d#0", target: "inline" },
    ],
  },

  // ── 7. Summations (MathType "Summation" palette) ──────────────────────────
  // ∑-only, five variants. `\limits`/`\nolimits` make the limit vs. side-script
  // distinction render the same in both inline and display contexts.
  {
    label: "Yig'indilar",
    icon: "∑",
    templates: [
      { icon: "∑", label: "Yig'indi (chegarasiz)", latex: "\\sum #0", target: "inline" },
      { icon: "∑ᵇₐ", label: "Yig'indi (yuqori va pastki chegara)", latex: "\\sum\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∑ⁿᵏ", label: "Yig'indi (yon indekslar)", latex: "\\sum\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "∑ₐ", label: "Yig'indi (faqat pastki chegara)", latex: "\\sum_{#0} #1", target: "inline" },
      { icon: "∑ᵇ", label: "Yig'indi (faqat yuqori chegara)", latex: "\\sum^{#0} #1", target: "inline" },
    ],
  },

  // ── 8. Products & Co-Products (MathType "Products and Co-Products") ────────
  // ∏ and ∐, five variants each (mirrors the Summation set).
  {
    label: "Ko'paytmalar",
    icon: "∏",
    templates: [
      { icon: "∏", label: "Ko'paytma (chegarasiz)", latex: "\\prod #0", target: "inline" },
      { icon: "∏ᵇₐ", label: "Ko'paytma (yuqori va pastki chegara)", latex: "\\prod\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∏ⁿᵏ", label: "Ko'paytma (yon indekslar)", latex: "\\prod\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "∏ₐ", label: "Ko'paytma (faqat pastki chegara)", latex: "\\prod_{#0} #1", target: "inline" },
      { icon: "∏ᵇ", label: "Ko'paytma (faqat yuqori chegara)", latex: "\\prod^{#0} #1", target: "inline" },
      { icon: "∐", label: "Ko-ko'paytma (chegarasiz)", latex: "\\coprod #0", target: "inline" },
      { icon: "∐ᵇₐ", label: "Ko-ko'paytma (yuqori va pastki chegara)", latex: "\\coprod\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "∐ⁿᵏ", label: "Ko-ko'paytma (yon indekslar)", latex: "\\coprod\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "∐ₐ", label: "Ko-ko'paytma (faqat pastki chegara)", latex: "\\coprod_{#0} #1", target: "inline" },
      { icon: "∐ᵇ", label: "Ko-ko'paytma (faqat yuqori chegara)", latex: "\\coprod^{#0} #1", target: "inline" },
    ],
  },

  // ── 9. Unions & Intersections (MathType "Unions and Intersections") ───────
  // ⋃ and ⋂, five variants each (mirrors the Summation set).
  {
    label: "To'plam amallari",
    icon: "⋃",
    templates: [
      { icon: "⋃", label: "Birlashma (chegarasiz)", latex: "\\bigcup #0", target: "inline" },
      { icon: "⋃ᵇₐ", label: "Birlashma (yuqori va pastki chegara)", latex: "\\bigcup\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋃ⁿᵏ", label: "Birlashma (yon indekslar)", latex: "\\bigcup\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋃ₐ", label: "Birlashma (faqat pastki chegara)", latex: "\\bigcup_{#0} #1", target: "inline" },
      { icon: "⋃ᵇ", label: "Birlashma (faqat yuqori chegara)", latex: "\\bigcup^{#0} #1", target: "inline" },
      { icon: "⋂", label: "Kesishma (chegarasiz)", latex: "\\bigcap #0", target: "inline" },
      { icon: "⋂ᵇₐ", label: "Kesishma (yuqori va pastki chegara)", latex: "\\bigcap\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋂ⁿᵏ", label: "Kesishma (yon indekslar)", latex: "\\bigcap\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋂ₐ", label: "Kesishma (faqat pastki chegara)", latex: "\\bigcap_{#0} #1", target: "inline" },
      { icon: "⋂ᵇ", label: "Kesishma (faqat yuqori chegara)", latex: "\\bigcap^{#0} #1", target: "inline" },
    ],
  },

  // ── 10. Other Large Operators (MathType "Other Large Operators") ──────────
  // ⋁ and ⋀, five variants each (mirrors the Summation set).
  {
    label: "Boshqa katta operatorlar",
    icon: "⋁",
    templates: [
      { icon: "⋁", label: "Diz'yunksiya (chegarasiz)", latex: "\\bigvee #0", target: "inline" },
      { icon: "⋁ᵇₐ", label: "Diz'yunksiya (yuqori va pastki chegara)", latex: "\\bigvee\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋁ⁿᵏ", label: "Diz'yunksiya (yon indekslar)", latex: "\\bigvee\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋁ₐ", label: "Diz'yunksiya (faqat pastki chegara)", latex: "\\bigvee_{#0} #1", target: "inline" },
      { icon: "⋁ᵇ", label: "Diz'yunksiya (faqat yuqori chegara)", latex: "\\bigvee^{#0} #1", target: "inline" },
      { icon: "⋀", label: "Kon'yunksiya (chegarasiz)", latex: "\\bigwedge #0", target: "inline" },
      { icon: "⋀ᵇₐ", label: "Kon'yunksiya (yuqori va pastki chegara)", latex: "\\bigwedge\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋀ⁿᵏ", label: "Kon'yunksiya (yon indekslar)", latex: "\\bigwedge\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⋀ₐ", label: "Kon'yunksiya (faqat pastki chegara)", latex: "\\bigwedge_{#0} #1", target: "inline" },
      { icon: "⋀ᵇ", label: "Kon'yunksiya (faqat yuqori chegara)", latex: "\\bigwedge^{#0} #1", target: "inline" },
      { icon: "⨁", label: "To'g'ri yig'indi (chegarasiz)", latex: "\\bigoplus #0", target: "inline" },
      { icon: "⨁ᵇₐ", label: "To'g'ri yig'indi (yuqori va pastki chegara)", latex: "\\bigoplus\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⨁ⁿᵏ", label: "To'g'ri yig'indi (yon indekslar)", latex: "\\bigoplus\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⨁ₐ", label: "To'g'ri yig'indi (faqat pastki chegara)", latex: "\\bigoplus_{#0} #1", target: "inline" },
      { icon: "⨁ᵇ", label: "To'g'ri yig'indi (faqat yuqori chegara)", latex: "\\bigoplus^{#0} #1", target: "inline" },
      { icon: "⨂", label: "Tenzor ko'paytma (chegarasiz)", latex: "\\bigotimes #0", target: "inline" },
      { icon: "⨂ᵇₐ", label: "Tenzor (yuqori va pastki chegara)", latex: "\\bigotimes\\limits_{#0}^{#1} #2", target: "inline" },
      { icon: "⨂ⁿᵏ", label: "Tenzor (yon indekslar)", latex: "\\bigotimes\\nolimits_{#0}^{#1} #2", target: "inline" },
      { icon: "⨂ₐ", label: "Tenzor (faqat pastki chegara)", latex: "\\bigotimes_{#0} #1", target: "inline" },
      { icon: "⨂ᵇ", label: "Tenzor (faqat yuqori chegara)", latex: "\\bigotimes^{#0} #1", target: "inline" },
    ],
  },

  // ── 11. Brackets (MathType "Brackets" family — one button, four sub-blocks:
  //     matched pairs, with-separators, single/one-sided, cases & stacks) ─────
  {
    label: "Qavslar",
    icon: "( )",
    sections: [
      {
        label: "Juft qavslar",
        templates: [
          { icon: "( )", label: "Yumaloq qavs", latex: "\\left( #0 \\right)", target: "inline" },
          { icon: "[ ]", label: "Kvadrat qavs", latex: "\\left[ #0 \\right]", target: "inline" },
          { icon: "{ }", label: "Figurali qavs", latex: "\\left\\{ #0 \\right\\}", target: "inline" },
          { icon: "⟨ ⟩", label: "Burchak qavs", latex: "\\left\\langle #0 \\right\\rangle", target: "inline" },
          { icon: "⌊ ⌋", label: "Pastga yaxlitlash", latex: "\\left\\lfloor #0 \\right\\rfloor", target: "inline" },
          { icon: "⌈ ⌉", label: "Yuqoriga yaxlitlash", latex: "\\left\\lceil #0 \\right\\rceil", target: "inline" },
          { icon: "| |", label: "Modul", latex: "\\left| #0 \\right|", target: "inline" },
          { icon: "‖ ‖", label: "Norma", latex: "\\left\\| #0 \\right\\|", target: "inline" },
          { icon: "( ]", label: "Yarim ochiq (o'ngda)", latex: "\\left( #0 \\right]", target: "inline" },
          { icon: "[ )", label: "Yarim ochiq (chapda)", latex: "\\left[ #0 \\right)", target: "inline" },
          { icon: "] [", label: "Ochiq oraliq", latex: "\\left] #0 \\right[", target: "inline" },
          { icon: "⌊ ⌉", label: "Eng yaqin butun", latex: "\\left\\lfloor #0 \\right\\rceil", target: "inline" },
        ],
      },
      {
        label: "Ajratuvchili qavslar",
        templates: [
          { icon: "(|)", label: "Yumaloq, ajratuvchili", latex: "\\left( #0 \\middle| #1 \\right)", target: "inline" },
          { icon: "{|}", label: "Figurali, ajratuvchili", latex: "\\left\\{ #0 \\middle| #1 \\right\\}", target: "inline" },
          { icon: "⟨|⟩", label: "Burchak, ajratuvchili", latex: "\\left\\langle #0 \\middle| #1 \\right\\rangle", target: "inline" },
          { icon: "⟨||⟩", label: "Burchak, ikki ajratuvchili", latex: "\\left\\langle #0 \\middle| #1 \\middle| #2 \\right\\rangle", target: "inline" },
        ],
      },
      {
        label: "Bir tomonlama qavslar",
        templates: [
          { icon: "(", label: "Chap yumaloq", latex: "\\left( #0 \\right.", target: "inline" },
          { icon: ")", label: "O'ng yumaloq", latex: "\\left. #0 \\right)", target: "inline" },
          { icon: "[", label: "Chap kvadrat", latex: "\\left[ #0 \\right.", target: "inline" },
          { icon: "]", label: "O'ng kvadrat", latex: "\\left. #0 \\right]", target: "inline" },
          { icon: "{", label: "Chap figurali", latex: "\\left\\{ #0 \\right.", target: "inline" },
          { icon: "}", label: "O'ng figurali", latex: "\\left. #0 \\right\\}", target: "inline" },
          { icon: "⟨", label: "Chap burchak", latex: "\\left\\langle #0 \\right.", target: "inline" },
          { icon: "⟩", label: "O'ng burchak", latex: "\\left. #0 \\right\\rangle", target: "inline" },
          { icon: "⌊", label: "Chap floor", latex: "\\left\\lfloor #0 \\right.", target: "inline" },
          { icon: "⌋", label: "O'ng floor", latex: "\\left. #0 \\right\\rfloor", target: "inline" },
          { icon: "⌈", label: "Chap ceil", latex: "\\left\\lceil #0 \\right.", target: "inline" },
          { icon: "⌉", label: "O'ng ceil", latex: "\\left. #0 \\right\\rceil", target: "inline" },
          { icon: "|·", label: "Chap modul chizig'i", latex: "\\left| #0 \\right.", target: "inline" },
          { icon: "·|", label: "Hisoblash chizig'i", latex: "\\left. #0 \\right|", target: "inline" },
          { icon: "‖·", label: "Chap norma chizig'i", latex: "\\left\\| #0 \\right.", target: "inline" },
          { icon: "·‖", label: "O'ng norma chizig'i", latex: "\\left. #0 \\right\\|", target: "inline" },
        ],
      },
      {
        label: "Hollar va to'plamlar",
        templates: [
          { icon: "{ ⋮", label: "Hollar (2 qator)", latex: "\\begin{cases}#0 \\\\ #1\\end{cases}", target: "display" },
          { icon: "{ ⋮⋮", label: "Hollar (3 qator)", latex: "\\begin{cases}#0 \\\\ #1 \\\\ #2\\end{cases}", target: "display" },
          { icon: "⋮", label: "Ustun (qavssiz)", latex: "\\substack{#0 \\\\ #1}", target: "inline" },
          { icon: "(ⁿₖ)", label: "Binomial (ustunli)", latex: "\\binom{#0}{#1}", target: "inline" },
        ],
      },
    ],
  },

  // ── 12. Trigonometric Functions (MathType — to'g'ri + teskari) ────────────
  {
    label: "Trigonometrik funksiyalar",
    icon: "sin",
    sections: [
      {
        label: "Trigonometrik",
        templates: [
          { icon: "sin", label: "sinus", latex: "\\sin #0", target: "inline" },
          { icon: "cos", label: "kosinus", latex: "\\cos #0", target: "inline" },
          { icon: "tan", label: "tangens", latex: "\\tan #0", target: "inline" },
          { icon: "csc", label: "kosekans", latex: "\\csc #0", target: "inline" },
          { icon: "sec", label: "sekans", latex: "\\sec #0", target: "inline" },
          { icon: "cot", label: "kotangens", latex: "\\cot #0", target: "inline" },
        ],
      },
      {
        label: "Teskari trigonometrik",
        templates: [
          { icon: "sin⁻¹", label: "arksinus (sin⁻¹)", latex: "\\sin^{-1} #0", target: "inline" },
          { icon: "cos⁻¹", label: "arkkosinus (cos⁻¹)", latex: "\\cos^{-1} #0", target: "inline" },
          { icon: "tan⁻¹", label: "arktangens (tan⁻¹)", latex: "\\tan^{-1} #0", target: "inline" },
          { icon: "csc⁻¹", label: "arkkosekans (csc⁻¹)", latex: "\\csc^{-1} #0", target: "inline" },
          { icon: "sec⁻¹", label: "arksekans (sec⁻¹)", latex: "\\sec^{-1} #0", target: "inline" },
          { icon: "cot⁻¹", label: "arkkotangens (cot⁻¹)", latex: "\\cot^{-1} #0", target: "inline" },
        ],
      },
    ],
  },

  // ── 13. Hyperbolic Functions (MathType — to'g'ri + teskari) ───────────────
  {
    label: "Giperbolik funksiyalar",
    icon: "sinh",
    sections: [
      {
        label: "Giperbolik",
        templates: [
          { icon: "sinh", label: "giperbolik sinus", latex: "\\sinh #0", target: "inline" },
          { icon: "cosh", label: "giperbolik kosinus", latex: "\\cosh #0", target: "inline" },
          { icon: "tanh", label: "giperbolik tangens", latex: "\\tanh #0", target: "inline" },
          { icon: "csch", label: "giperbolik kosekans", latex: "\\operatorname{csch} #0", target: "inline" },
          { icon: "sech", label: "giperbolik sekans", latex: "\\operatorname{sech} #0", target: "inline" },
          { icon: "coth", label: "giperbolik kotangens", latex: "\\coth #0", target: "inline" },
        ],
      },
      {
        label: "Teskari giperbolik",
        templates: [
          { icon: "sinh⁻¹", label: "area-sinus (sinh⁻¹)", latex: "\\sinh^{-1} #0", target: "inline" },
          { icon: "cosh⁻¹", label: "area-kosinus (cosh⁻¹)", latex: "\\cosh^{-1} #0", target: "inline" },
          { icon: "tanh⁻¹", label: "area-tangens (tanh⁻¹)", latex: "\\tanh^{-1} #0", target: "inline" },
          { icon: "csch⁻¹", label: "area-kosekans (csch⁻¹)", latex: "\\operatorname{csch}^{-1} #0", target: "inline" },
          { icon: "sech⁻¹", label: "area-sekans (sech⁻¹)", latex: "\\operatorname{sech}^{-1} #0", target: "inline" },
          { icon: "coth⁻¹", label: "area-kotangens (coth⁻¹)", latex: "\\coth^{-1} #0", target: "inline" },
        ],
      },
    ],
  },

  // ── 14. Accents, Boxed Formulas, Overbars & Underbars (MathType) ──────────
  {
    label: "Aksent va bezaklar",
    icon: "x̂",
    sections: [
      {
        label: "Aksentlar",
        templates: [
          { icon: "ẋ", label: "Nuqta", latex: "\\dot{#0}", target: "inline" },
          { icon: "ẍ", label: "Ikki nuqta", latex: "\\ddot{#0}", target: "inline" },
          { icon: "x⃛", label: "Uch nuqta", latex: "\\dddot{#0}", target: "inline" },
          { icon: "x̂", label: "Shlyapa", latex: "\\hat{#0}", target: "inline" },
          { icon: "x̌", label: "Galochka", latex: "\\check{#0}", target: "inline" },
          { icon: "x̆", label: "Brev", latex: "\\breve{#0}", target: "inline" },
          { icon: "x́", label: "Akut", latex: "\\acute{#0}", target: "inline" },
          { icon: "x̀", label: "Grav", latex: "\\grave{#0}", target: "inline" },
          { icon: "x̃", label: "Tilda", latex: "\\tilde{#0}", target: "inline" },
          { icon: "x̄", label: "Chiziq (bar)", latex: "\\bar{#0}", target: "inline" },
          { icon: "x⃗", label: "Vektor", latex: "\\vec{#0}", target: "inline" },
          { icon: "x̊", label: "Halqa", latex: "\\mathring{#0}", target: "inline" },
          { icon: "ˆxy", label: "Keng shlyapa", latex: "\\widehat{#0}", target: "inline" },
          { icon: "˜xy", label: "Keng tilda", latex: "\\widetilde{#0}", target: "inline" },
          { icon: "→AB", label: "Ustki o'ng o'q", latex: "\\overrightarrow{#0}", target: "inline" },
          { icon: "←AB", label: "Ustki chap o'q", latex: "\\overleftarrow{#0}", target: "inline" },
          { icon: "↔AB", label: "Ustki ikki tomon o'q", latex: "\\overleftrightarrow{#0}", target: "inline" },
        ],
      },
      {
        label: "Ramkali formula",
        templates: [
          { icon: "▭", label: "Ramkaga olish", latex: "\\boxed{#0}", target: "inline" },
        ],
      },
      {
        label: "Ustki va pastki chiziq",
        templates: [
          { icon: "x̄", label: "Ustki chiziq", latex: "\\overline{#0}", target: "inline" },
          { icon: "x̲", label: "Pastki chiziq", latex: "\\underline{#0}", target: "inline" },
          { icon: "⏞", label: "Ustki qavs", latex: "\\overbrace{#0}", target: "inline" },
          { icon: "⏟", label: "Pastki qavs", latex: "\\underbrace{#0}", target: "inline" },
        ],
      },
    ],
  },

  // ── 15. Functions (MathType "Functions"; log → lg per user request) ───────
  {
    label: "Qo'shimcha funksiyalar",
    icon: "log",
    templates: [
      { icon: "logₐ", label: "Logarifm (asosi berilgan)", latex: "\\log_{#0}{#1}", target: "inline" },
      { icon: "lg", label: "O'nlik logarifm (lg)", latex: "\\lg #0", target: "inline" },
      { icon: "ln", label: "Natural logarifm", latex: "\\ln #0", target: "inline" },
      { icon: "lim", label: "Limit", latex: "\\lim_{#0} #1", target: "inline" },
      { icon: "min", label: "Minimum", latex: "\\min #0", target: "inline" },
      { icon: "max", label: "Maksimum", latex: "\\max #0", target: "inline" },
    ],
  },

  // ── 16. Operators (MathType — Basic Operators + Operator Structures) ──────
  {
    label: "Operatorlar",
    icon: "≔",
    sections: [
      {
        label: "Asosiy operatorlar",
        templates: [
          { icon: "≔", label: "Aniqlanadi (:=)", latex: ":=", target: "inline" },
          { icon: "==", label: "Tengmi (==)", latex: "==", target: "inline" },
          { icon: "+=", label: "Qo'shib tenglashtirish (+=)", latex: "+=", target: "inline" },
          { icon: "−=", label: "Ayirib tenglashtirish (-=)", latex: "-=", target: "inline" },
          { icon: "≝", label: "Ta'rifan teng (def)", latex: "\\stackrel{\\text{def}}{=}", target: "inline" },
          { icon: "ᵐ=", label: "Belgi bo'yicha teng (m)", latex: "\\stackrel{m}{=}", target: "inline" },
          { icon: "≜", label: "Aniqlanishi bo'yicha teng (Δ)", latex: "\\triangleq", target: "inline" },
        ],
      },
      {
        label: "Operator tuzilmalari",
        templates: [
          { icon: "←̄□", label: "Ustki chap o'q", latex: "\\overleftarrow{#0}", target: "inline" },
          { icon: "→̄□", label: "Ustki o'ng o'q", latex: "\\overrightarrow{#0}", target: "inline" },
          { icon: "□←", label: "Pastki chap o'q", latex: "\\underleftarrow{#0}", target: "inline" },
          { icon: "□→", label: "Pastki o'ng o'q", latex: "\\underrightarrow{#0}", target: "inline" },
          { icon: "↔̄□", label: "Ustki ikki tomon o'q", latex: "\\overleftrightarrow{#0}", target: "inline" },
          { icon: "□↔", label: "Pastki ikki tomon o'q", latex: "\\underleftrightarrow{#0}", target: "inline" },
          { icon: "⇐□", label: "Ustki qo'sh chap o'q", latex: "\\xLeftarrow{#0}", target: "inline" },
          { icon: "⇒□", label: "Ustki qo'sh o'ng o'q", latex: "\\xRightarrow{#0}", target: "inline" },
          { icon: "⇔□", label: "Ustki qo'sh ikki tomon o'q", latex: "\\xLeftrightarrow{#0}", target: "inline" },
          { icon: "x←", label: "Cho'ziluvchi chap o'q", latex: "\\xleftarrow{#0}", target: "inline" },
          { icon: "x→", label: "Cho'ziluvchi o'ng o'q", latex: "\\xrightarrow{#0}", target: "inline" },
          { icon: "x↔", label: "Cho'ziluvchi ikki tomon o'q", latex: "\\xleftrightarrow{#0}", target: "inline" },
        ],
      },
    ],
  },

  // ── 17. Matrices (MathType "Matrix" palette) ──────────────────────────────
  {
    label: "Matritsalar",
    icon: "[ ⋮ ]",
    sections: [
      {
        label: "Bo'sh matritsalar",
        templates: [
          { icon: "1×2", label: "1×2 matritsa", latex: "\\begin{matrix}#0 & #1\\end{matrix}", target: "display" },
          { icon: "2×1", label: "2×1 matritsa", latex: "\\begin{matrix}#0 \\\\ #1\\end{matrix}", target: "display" },
          { icon: "1×3", label: "1×3 matritsa", latex: "\\begin{matrix}#0 & #1 & #2\\end{matrix}", target: "display" },
          { icon: "3×1", label: "3×1 matritsa", latex: "\\begin{matrix}#0 \\\\ #1 \\\\ #2\\end{matrix}", target: "display" },
          { icon: "2×2", label: "2×2 matritsa", latex: "\\begin{matrix}#0 & #1 \\\\ #2 & #3\\end{matrix}", target: "display" },
          { icon: "2×3", label: "2×3 matritsa", latex: "\\begin{matrix}#0 & #1 & #2 \\\\ #3 & #4 & #5\\end{matrix}", target: "display" },
          { icon: "3×2", label: "3×2 matritsa", latex: "\\begin{matrix}#0 & #1 \\\\ #2 & #3 \\\\ #4 & #5\\end{matrix}", target: "display" },
          { icon: "3×3", label: "3×3 matritsa", latex: "\\begin{matrix}#0 & #1 & #2 \\\\ #3 & #4 & #5 \\\\ #6 & #7 & #8\\end{matrix}", target: "display" },
        ],
      },
      {
        label: "Nuqtalar",
        templates: [
          { icon: "⋯", label: "Markaziy gorizontal nuqtalar", latex: "\\cdots", target: "inline" },
          { icon: "…", label: "Pastki gorizontal nuqtalar", latex: "\\ldots", target: "inline" },
          { icon: "⋮", label: "Vertikal nuqtalar", latex: "\\vdots", target: "inline" },
          { icon: "⋱", label: "Diagonal nuqtalar", latex: "\\ddots", target: "inline" },
        ],
      },
      {
        label: "Birlik matritsalar",
        templates: [
          { icon: "I₂", label: "Birlik 2×2", latex: "\\begin{pmatrix}1 & 0 \\\\ 0 & 1\\end{pmatrix}", target: "display" },
          { icon: "I₂·", label: "Birlik 2×2 (bo'sh diagonal)", latex: "\\begin{pmatrix}1 & \\\\ & 1\\end{pmatrix}", target: "display" },
          { icon: "I₃", label: "Birlik 3×3", latex: "\\begin{pmatrix}1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1\\end{pmatrix}", target: "display" },
          { icon: "Iₙ", label: "Birlik n×n (diagonal)", latex: "\\begin{pmatrix}1 & & \\\\ & \\ddots & \\\\ & & 1\\end{pmatrix}", target: "display" },
        ],
      },
      {
        label: "Qavsli matritsalar",
        templates: [
          { icon: "( )", label: "Yumaloq qavs", latex: "\\begin{pmatrix}#0 & #1 \\\\ #2 & #3\\end{pmatrix}", target: "display" },
          { icon: "[ ]", label: "Kvadrat qavs", latex: "\\begin{bmatrix}#0 & #1 \\\\ #2 & #3\\end{bmatrix}", target: "display" },
          { icon: "| |", label: "Determinant", latex: "\\begin{vmatrix}#0 & #1 \\\\ #2 & #3\\end{vmatrix}", target: "display" },
          { icon: "‖ ‖", label: "Norma", latex: "\\begin{Vmatrix}#0 & #1 \\\\ #2 & #3\\end{Vmatrix}", target: "display" },
        ],
      },
      {
        label: "Umumiy (siyrak) matritsalar",
        templates: [
          { icon: "(⋱)", label: "Umumiy n×n (yumaloq)", latex: "\\begin{pmatrix}#0 & \\cdots & #1 \\\\ \\vdots & \\ddots & \\vdots \\\\ #2 & \\cdots & #3\\end{pmatrix}", target: "display" },
          { icon: "[⋱]", label: "Umumiy n×n (kvadrat)", latex: "\\begin{bmatrix}#0 & \\cdots & #1 \\\\ \\vdots & \\ddots & \\vdots \\\\ #2 & \\cdots & #3\\end{bmatrix}", target: "display" },
        ],
      },
    ],
  },

  // ── Boshqalar — limitlar va hosilalar (o'z MathType guruhlarini kutmoqda) ──
  {
    label: "Boshqalar",
    icon: "…",
    templates: [
      { icon: "lim sup", label: "Yuqori limit", latex: "\\limsup_{#0}", target: "inline" },
      { icon: "lim inf", label: "Quyi limit", latex: "\\liminf_{#0}", target: "inline" },
      { icon: "d⁄dx", label: "Hosila (d/dx)", latex: "\\frac{d}{d#0}#1", target: "inline" },
      { icon: "dⁿ⁄dxⁿ", label: "n-tartibli hosila", latex: "\\frac{d^{#0}}{d#1^{#0}}#2", target: "inline" },
      { icon: "∂⁄∂x", label: "Xususiy hosila", latex: "\\frac{\\partial #0}{\\partial #1}", target: "inline" },
      { icon: "f′|ₐ", label: "Hosila (nuqtada)", latex: "\\left.\\frac{d#0}{d#1}\\right|_{#1=#2}", target: "inline" },
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

  // ── Functions (misc — trig/giperbolik/log groups 12,13,15 ga ko'chirildi) ─
  {
    label: "Funksiyalar",
    icon: "ƒ",
    templates: [
      sym("arcsin", "arksinus", "\\arcsin"),
      sym("arccos", "arkkosinus", "\\arccos"),
      sym("arctan", "arktangens", "\\arctan"),
      sym("exp", "eksponenta", "\\exp"),
      sym("gcd", "EKUB", "\\gcd"),
      sym("det", "determinant", "\\det"),
      sym("dim", "o'lcham", "\\dim"),
      sym("mod", "modul (qoldiq)", "\\bmod"),
      { icon: "(mod)", label: "Modul bo'yicha", latex: "\\pmod{#0}", target: "inline" },
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
