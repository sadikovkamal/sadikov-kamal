# Print feature — design

**Date:** 2026-05-25

**Scope:** A "Chop etish" (print) action on `/admin/problems` that lets a teacher select problems (across filters and pages) and download them as a `.docx` worksheet for distribution to students. The selection is taken to a Chrome-print-style modal with a live A4 HTML preview on the right and configurable per-problem and per-document options on the left. Math is preserved as native Word formulas (OMath), so a teacher can keep editing in Word afterwards.

The work has four interlocking parts:

1. **Selection state lifted to a layout-scoped React context backed by `localStorage`** — survives filter changes, route changes, and page reloads.
2. **Print dialog** — modal with config panel + selected-problems list + live HTML preview, opens from a new toolbar button next to "O'zgartirish" / "O'chirish".
3. **Server-side .docx generation** — markdown bodies parsed via `remark`, math converted via `MathJax` (LaTeX → MathML) + `mathml2omml` (MathML → OMath), images embedded from R2, document built with the `docx` library, returned as an `ArrayBuffer`.
4. **Preview** — HTML/CSS A4 mimic in the modal, sharing the same configuration object as the docx generator, so what the user sees closely matches what they get.

## Non-goals

- **Answer keys, hints, solutions.** This first version emits problem statements only (the user is targeting student handouts). A second pass can add a "Show solutions" toggle once the solution field exists in the model.
- **PDF output.** Word is the requested format. PDF can be generated later from the same docx if needed.
- **Print preview that is byte-accurate to Word's pagination.** Word lays text out with its own metrics; the HTML preview mimics it within ~5%. A footer note tells the user pagination may differ slightly.
- **Sharing or saving worksheet templates.** Each print is one-shot. Reusable templates can come later.
- **Variant generation** (random N from a pool, random order, multiple variants of one worksheet). Out of scope for this iteration — the teacher hand-picks via filters + checkboxes.
- **Bulk print of an entire taxonomy node** without selecting first. The user explicitly wanted selection-driven; "filter → select-all → print" already covers the common case with no extra UI.
- **DB migrations.** No schema changes — selection is client-state, print is read-only on the server.

## Part 1 — Selection state (context + localStorage)

Today `ProblemsList` keeps the selection in `useState<Set<string>>`. Inside the same route segment that survives filter URL changes (the client component doesn't unmount), but it is **lost** on three transitions a teacher will routinely make: a page reload (`Ctrl+R`), opening a problem detail page and pressing back, and visiting any non-problems admin page and returning. The selection is also private to `ProblemsList`, which is awkward once `BulkEditDialog` and `PrintDialog` both need to read and mutate it.

### Provider

New file `src/app/admin/problems/_selection-context.tsx` (client component):

```ts
"use client";

const STORAGE_KEY = "provia:admin:problems:selection";

interface SelectionContextValue {
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectMany: (ids: Iterable<string>) => void;
  deselectMany: (ids: Iterable<string>) => void;
  clear: () => void;
}

export function SelectionProvider({ children }: { children: React.ReactNode });
export function useSelection(): SelectionContextValue;
```

Internals:

- `useState<Set<string>>(new Set())` — initial render is SSR-safe (empty set, no `localStorage` read).
- One `useEffect(() => { … }, [])` on mount: parse `localStorage[STORAGE_KEY]`, validate it's a JSON array of strings shaped like UUIDs, hydrate the Set. If the entry is missing or malformed, leave the Set empty and don't throw.
- One `useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])) }, [selected])` to persist.
- The hook throws a clear error if used outside the provider — catches forgotten mounts during refactors.
- No cross-tab `storage` event listener. Tabs are independent in v1 (matches mental model: "what I tick in this tab is mine").

**Why a single `Set` in context (not split state/action contexts) for v1:** with up to 500 ids, modern React + the cards' `key`-stability makes per-row re-renders cheap; React Compiler narrows them further. If profiling later reveals problems we can split. Premature splitting is the easier mistake here.

### Wrapping the segment

`src/app/admin/problems/layout.tsx` is currently a passthrough RSC that pulls in `katex.min.css` and `highlight.css`. We keep it server-rendered and import the provider as a client component:

```tsx
import { SelectionProvider } from "./_selection-context";
// …existing CSS imports

export default function ProblemsLayout({ children }) {
  return <SelectionProvider>{children}</SelectionProvider>;
}
```

The provider lives at `/admin/problems/*`, so it unmounts only when the teacher leaves that subtree. localStorage carries the IDs across mount/unmount cycles, so coming back to the list page rehydrates the selection automatically.

### Stale IDs

Local storage can hold IDs of problems that were deleted, reassigned, or otherwise vanished since the user picked them. We don't try to validate at hydration time (no server round-trip on page load); validation happens lazily at the point of use:

- **Bulk delete** already returns the IDs it deleted; we `deselectMany(deletedIds)` after a successful call.
- **Bulk edit** keeps the selection (the targets still exist).
- **Print** is read-only — the `loadProblemsForPrintAction(ids)` returns rows for whatever still exists; if the response has fewer rows than requested, the UI silently shows a toast/banner and the dialog reflects the trimmed list. The state in localStorage is updated to drop the missing IDs.

### Touchpoints

| Behaviour change | Effect |
|---|---|
| `Ctrl+R` on `/admin/problems` | Selection restored from `localStorage`. |
| Navigate to `/admin/problems/<code>` and back | Selection restored. |
| Visit any non-problems route and return | Selection restored. |
| Two tabs open | Independent selections in each. |
| `localStorage` quota exceeded | `try/catch` around `setItem`; on failure the in-memory state still works, just doesn't persist. We log a `console.warn` for diagnostics. |
| Selection size > `BULK_OP_LIMIT` (500) | Print button is disabled with the same warning chip as edit/delete already shows ("Maks 500 ta…"). Identical UX to the existing bulk actions. |

## Part 2 — Toolbar button and modal shell

`ProblemsList` is modified in place:

- Replace `useState<Set<string>>` with `useSelection()`.
- The existing select-all checkbox stays per-page (matches today's behaviour and avoids "Select All… 500" surprises).
- Where the toolbar currently renders "Bekor qilish · O'zgartirish · O'chirish" when `selected.size > 0`, we insert a new "Chop etish" button (with a `Printer` icon from `lucide-react`) **before** O'zgartirish. Same `size="xs"` styling, same `disabled={isPending || overBulkLimit}` semantics.
- Clicking opens `<PrintDialog open … onOpenChange={…} />`. The dialog reads selection from context — no `problemIds` prop.

`bulk-edit-dialog.tsx` is also lifted to the same hook. `problemIds` prop goes away there (consistency, but mostly so the deselect-on-success path lives in one place).

`PrintDialog` opens at `~90vw / 85vh max` with a fixed left rail (`w-80` config + `flex-1` selected list) and a `flex-1` preview pane. Mobile collapses to a single column with a tab switcher (preview vs config) — but the admin tool is desktop-targeted, so this is a nice-to-have, not a v1 must.

### Loading the data

When the dialog opens we trigger a single server action:

```ts
"use server";
export async function loadProblemsForPrintAction(
  ids: string[],
): Promise<{ ok: true; problems: PrintProblem[] } | { ok: false; error: string }>;
```

`PrintProblem` has everything the renderer (preview and docx) needs:

```ts
interface PrintProblem {
  id: string;
  code: string;          // "P0000123"
  bodyMd: string;        // full markdown, no truncation
  /**
   * `storageKey` is the R2 object key — used by the server-side docx
   * generator to fetch image bytes directly through the S3 client.
   * `url` is the public CDN URL — used by the HTML preview to render
   * the image in the browser. We carry both so neither path has to
   * derive one from the other.
   */
  images: { storageKey: string; url: string; altText: string | null }[];
  source: { code: string; name: string } | null;
  topics: { code: string; name: string }[];
  ageCategories: { code: string; name: string }[];
  methods: { code: string; name: string }[];
}
```

The action:

1. Validates `ids` with Zod: 1 ≤ length ≤ `BULK_OP_LIMIT`, each item is a UUID.
2. Pulls all problems whose `id IN (...)` plus their image rows, source, and three taxonomy junctions in a single transaction (or three batched queries) — same pattern as `listProblems` hydration.
3. Re-orders the result to match the requested `ids` order (so the user's checkbox order is preserved deterministically). Missing IDs are silently dropped — the client compares the returned IDs to its `selected` Set and calls `deselectMany(missing)`.
4. Returns the list. Images are public R2 URLs; the preview fetches them directly, and the docx generator fetches them server-side.

While loading, the dialog shows a skeleton: a placeholder list on the left and a gray A4 frame on the right.

### Selected-problems list (left, below config)

A scrollable column showing every selected problem as one line:

```
↑ ↓ × 1. P0000123 — Hozirgi qator preview…
↑ ↓ × 2. P0000456 — Boshqa masala…
```

- The 1-based number is the position in the rendered worksheet (matches the numbering style chosen in config).
- `↑ ↓` move the item in the local order; clicking `×` removes it from selection via `deselectMany([id])` (context propagates to all consumers, including the underlying cards).
- The order is **local to the dialog**: we don't write back to the context. The Set has no order semantics; the dialog keeps an `orderedIds: string[]` ref. When the user removes from selection the orderedIds is filtered too. If the user re-opens after closing, the order is the default (list order, which is the same as the original `ids` argument from context — see "Open vs close" below).
- An "Asl tartibga qaytarish" button resets `orderedIds` to the default (insertion order, derived from the list query).

### Open / close lifecycle

- **Open:** dialog reads `selected` once, snapshots it into `orderedIds`, fires `loadProblemsForPrintAction(orderedIds)`. As problems load it caches them in dialog state.
- **While open:** edits to the context (e.g. unticking a card behind the dialog… though dialog overlay prevents this) would not retroactively change the dialog's snapshot. The user can always reset.
- **Close (cancel or backdrop click):** dialog state is dropped; selection in context is untouched (except for the `deselectMany` that the × button calls, which is intentional).
- **Close (after successful download):** same — selection persists, so the teacher can tweak parameters and download again.

## Part 3 — Configuration and preview

### Config schema

`src/lib/print/types.ts`:

```ts
export interface PrintConfig {
  /** Document title at the top of page 1. Empty = no title block. */
  title: string;
  fontSize: 10 | 11 | 12 | 14;
  /** Word multiplies single-line height by this value. */
  lineHeight: 1.0 | 1.15 | 1.5;
  margins: "narrow" | "normal" | "wide";   // 1.27cm / 2.54cm / 3.18cm
  numberStyle: "dot" | "paren" | "masala"; // "1." / "1)" / "Masala 1."
  showFields: {
    code: boolean;
    source: boolean;
    topics: boolean;
    ageCategories: boolean;
    methods: boolean;
  };
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  title: "",
  fontSize: 12,
  lineHeight: 1.15,
  margins: "normal",
  numberStyle: "dot",
  showFields: {
    code: false,
    source: false,
    topics: false,
    ageCategories: false,
    methods: false,
  },
};
```

`fontSize`, `lineHeight`, `margins`, `numberStyle` are typed as unions so the popovers can be small `<select>` widgets and the docx code can switch exhaustively. Defaults bias toward a clean handout: no metadata, no title, body text only.

### Live HTML preview

The preview pane is a stack of A4-shaped cards (210 × 297 mm at 96 dpi → 794 × 1123 px), with the active config applied via inline `style`:

- White background, paper-like soft shadow.
- Inner padding = mapped margin from the config.
- `font-family: 'Times New Roman', Times, serif` (Word default for body text in many locales; configurable later if needed).
- `font-size: {config.fontSize}pt`.
- `line-height: {config.lineHeight}`.
- KaTeX renders math the same way `listProblems` does today (we reuse the same renderer for inline `$…$` and block `$$…$$`). Block math centers on its own line.
- Markdown rendered with `react-markdown` + `remark-math` + `rehype-katex`; we apply a small typographic plugin (`remark-gfm` is already in the codebase) to support tables and strikethrough.
- Images render natively from their R2 public URL. Each `![alt](url)` is wrapped in its own `<p>` so it lands on a new line per the user's rule. `max-width: 100%` keeps oversize diagrams in the page.
- The per-problem header row (only when any `showFields.*` is on) renders as a small muted line above the body: `P0000123 · Manba · Yosh: 7 · Metod: Inverse`. Each shown field is space-separated and prefixed with the label. When all flags are off, the header row is omitted entirely.

**Pagination simulation.** We don't try to lay out across `<page>` elements precisely. Instead, we render every problem inside one tall scrollable A4-shaped page-frame and inject visual "page break" dividers when total height passes A4's content height boundary. For a teacher this is "close enough" — the docx pagination is authoritative; the preview is a sketch. A muted note under the title bar reads: "Taxminiy ko'rinish — Word'da sahifa chegaralari biroz farq qilishi mumkin."

**Update cadence.** Config changes update via a 150 ms debounced state-derived prop. KaTeX renders client-side and is cheap enough at this scale (most problems have a handful of formulas).

**Perf safety net.** If the loaded set is huge (say > 200 problems) the preview shows only the first 50 by default with an "expand to all" button — typing or scrolling beyond the first page is rare, and 50 is enough to see what the docx will look like.

### Config panel layout

Three collapsible sections (open by default):

1. **Hujjat** — title input, font size, line height, margins, numbering style.
2. **Har masala ma'lumoti** — five toggles (code, source, topics, age categories, methods).
3. **Tanlanganlar (N ta)** — the ordered list with up/down/remove.

Each control writes into the same `PrintConfig` object held by `useState` at the dialog root.

## Part 4 — Server-side .docx generation

```ts
"use server";
export async function generatePrintDocxAction(input: {
  orderedIds: string[];
  config: PrintConfig;
}): Promise<{ ok: true; bytes: ArrayBuffer; filename: string } | { ok: false; error: string }>;
```

The action:

1. Auth-gates via the existing admin session.
2. Validates with Zod: `orderedIds.length` in `[1, BULK_OP_LIMIT]`, each a UUID, `config` matches schema. Title trimmed to 200 chars.
3. Re-fetches the problems (same query as `loadProblemsForPrintAction`, in `orderedIds` order). Missing IDs are dropped; the response indicates the trim count.
4. Fetches every referenced image's bytes from R2 (one `GetObject` per image, parallelised with `Promise.all`, capped to ~10 concurrent fetches to be polite to the bucket).
5. Walks the markdown of each problem with `unified().use(remarkParse).use(remarkMath).use(remarkGfm).parse(body)` and converts the AST to docx elements (see "Markdown → docx" below).
6. Assembles the document with `docx` (build a `Document` with one `Section`).
7. Renders to a `Buffer` via `Packer.toBuffer(doc)`, returns `bytes` as an `ArrayBuffer` plus a suggested filename (`"masalalar-YYYY-MM-DD.docx"`).
8. Caller in the browser wraps the bytes in a `Blob`, builds a temporary `<a href={URL.createObjectURL(blob)} download>` and triggers a click; revokes the URL after a microtask.

The action runs on Vercel; `vercel.json` already sets `maxDuration: 30`, which is enough for 500 problems with images at a comfortable margin (most prints will be ≤ 50). If a future test shows long-tail prints brushing 30s, the action can be split into "prepare + paginate" + "stream chunks" or moved to a background job, but neither is needed in v1.

### Markdown → docx element map

| Markdown node | docx element |
|---|---|
| `paragraph` | `Paragraph` with text + math + inline formatting. |
| `text` | `TextRun` (with bold/italic if wrapped in `strong` / `emphasis`). |
| `inlineCode` | `TextRun({ font: "Consolas", text })`. |
| `link` | `TextRun` of the visible text only — URL discarded for handout output. |
| `inlineMath` | OMath run (see Part 5). |
| `math` (block) | Centered paragraph containing the OMath. |
| `image` | New paragraph with `ImageRun({ data, transformation: { width, height } })`, sized to fit page width minus margins, aspect ratio preserved. |
| `list` (ordered/unordered) | Multiple `Paragraph`s with `numbering` / `bullet` style. |
| `code` (block) | `Paragraph` with `font: "Consolas"`, no syntax highlighting. |
| `heading` | `Paragraph` with `heading: HeadingLevel.HEADING_N`. Bodies rarely have these, but we honour them. |
| `table` | `Table` with rows/cells. |
| `thematicBreak` (`---`) | `Paragraph` with bottom border. |
| `blockquote` | `Paragraph` with left indent + italic. |
| `strong`, `emphasis`, `delete` | Wrapped `TextRun({ bold: true })` / `{ italics: true }` / `{ strike: true }`. |

Unknown nodes are best-effort: we walk children, emit plain text, and never throw. Problem bodies are user-controlled markdown; a fail-soft renderer is safer than a strict one.

### Per-problem skeleton

For each problem in `orderedIds`:

1. **Header row** (only when any `showFields.*` is true): one `Paragraph` with small grey text — `P0000123 · Manba: Olympiad book · Yosh: 7 · Mavzu: Algebra · Metod: Inverse`. Spaces and the middle-dot separator keep it scannable.
2. **Numbered body**: the first markdown paragraph is fused with the number prefix. Numbering style `"dot"` → `"1. "`, `"paren"` → `"1) "`, `"masala"` → `"Masala 1. "`. Subsequent paragraphs inside the same problem get a left indent equal to the number's width (hanging-indent visual).
3. **Images**: each image becomes its own paragraph after the body text, in the order they appear in `images`.
4. **Spacing**: 12pt after the last block of each problem, so the next item breathes.

We **do not** insert explicit page breaks. Word's natural pagination is driven by the page size and the content — exactly what the user requested ("egallagan o'rnidan kelib chiqib sahifa to'ldirilsin, sig'maydigan bo'lsa keyingisiga o'tilsin"). We do set `keepLines: true` on the header row + first body paragraph of every problem so a problem doesn't visually split right at the header.

## Part 5 — LaTeX → OMath conversion

This is the highest-risk technical piece. The plan:

### Pipeline

```
LaTeX string ("\frac{a}{b}")
  ↓ MathJax (mathjax-full, TeX input + MathML output)
MathML string
  ↓ mathml2omml (pure-JS MathML AST walker)
OMath XML string ("<m:oMath>…</m:oMath>")
  ↓ docx custom XML insert
Word document with native, editable formulas
```

### Library choices

- **`mathjax-full`** (npm) — well-maintained, runs server-side under Node, supports TeX → MathML conversion. We initialise a single `MathJax` instance per module (heavy startup ~150 ms) and reuse for every formula in the batch.
- **`mathml2omml`** (npm) — small pure-JS library by the FidusWriter team that walks the MathML AST and emits a Word-native OMath fragment. No XSLT engine, no native deps.

**Why not the Microsoft MML2OMML.XSL stylesheet:** the obvious "use the official transform" approach turns out not to work in pure JS. The XSLT relies on namespace-aware XPath template matching; the only no-native-dep XSLT processor on npm (`xslt-processor`) does not match templates by namespace URI, only by literal qualified name. Every structural template (`mfrac`, `msqrt`, `msup`, …) collapses to the catch-all and the result is flat text-only OMath that Word renders as plain characters instead of an equation. Saxon-JS works but ships 4 MB of runtime. `mathml2omml` is a dedicated port of the same transform to native JS — small, correct, and matches Word's output structurally.

### `mathToOmml(latex: string): string`

`src/lib/print/math-omml.ts`:

```ts
let cachedTex: TeX<…> | null = null;
let cachedXslt: Xslt | null = null;

export function mathToOmml(latex: string, opts?: { display?: boolean }): string {
  // 1. tex2mml — MathJax converts to MathML (MathML 3.0)
  // 2. xslt(mml, MML2OMML.XSL) — Microsoft's transform → OMath XML
  // 3. Return the raw XML string for caller to embed
}
```

On any conversion error, we fall back to `<m:oMath><m:r><m:t>{escaped LaTeX}</m:t></m:r></m:oMath>` so the worksheet still emits *something* readable and never crashes the action.

### Embedding into `docx`

The `docx` library doesn't have first-class OMath builders but does expose `ImportedXmlComponent` (or equivalent: `XmlComponent.fromXml`) for injecting raw OOXML fragments into a `Paragraph`. We wrap each formula:

```ts
new Paragraph({
  children: [
    new TextRun({ text: "before " }),
    ImportedXmlComponent.fromXmlString(`<m:oMath>...</m:oMath>`),
    new TextRun({ text: " after." }),
  ],
});
```

Block math becomes a centered `Paragraph` whose only child is the OMath component, with `alignment: AlignmentType.CENTER`.

### Tested LaTeX surface

The problem corpus uses standard math: fractions, exponents, square roots, sums, integrals, Greek letters, basic matrices. MathJax + MML2OMML handles all of these. Smoke tests cover the top 20 patterns we extract from the existing `bodyMd` corpus (one-off script during dev).

### Fallback if a single formula fails

If `mathToOmml(latex)` throws for one formula in one problem, the failure is contained to that formula: we substitute the literal LaTeX source as plain text and continue. The action's response includes a `partial: { failedFormulas: number }` field so the dialog can show a small banner.

## Part 6 — Component touchpoints

| File | Change |
|---|---|
| `src/app/admin/problems/_selection-context.tsx` | **New.** Client component. `SelectionProvider` + `useSelection()` hook backed by `localStorage`. |
| `src/app/admin/problems/layout.tsx` | Wrap `children` in `<SelectionProvider>`. |
| `src/app/admin/problems/problems-list.tsx` | Replace local `useState<Set<string>>` with `useSelection()`. Insert "Chop etish" button into the bulk toolbar before "O'zgartirish". Wire it to a new `<PrintDialog>`. After successful bulk-delete, `deselectMany(deletedIds)`. |
| `src/app/admin/problems/bulk-edit-dialog.tsx` | Switch from `problemIds` prop to `useSelection()` reads. Keep the existing `onSuccess` clear behaviour by calling `clear()` (or `deselectMany(problemIds)` to be conservative — clear keeps semantics). |
| `src/app/admin/problems/_actions.ts` | No interface change; `bulkDeleteProblemsAction` already returns the deleted ids. |
| `src/app/admin/problems/print-dialog.tsx` | **New.** Modal shell, reads from `useSelection()`, owns `PrintConfig` state, mounts config panel + selected list + preview. |
| `src/app/admin/problems/print-dialog/config-panel.tsx` | **New.** Title input, document params, per-field toggles. |
| `src/app/admin/problems/print-dialog/selected-list.tsx` | **New.** Ordered list with up/down/remove. |
| `src/app/admin/problems/print-dialog/preview.tsx` | **New.** A4-shaped HTML preview, debounced re-render on config changes. |
| `src/app/admin/problems/_print-actions.ts` | **New.** Server actions `loadProblemsForPrintAction` and `generatePrintDocxAction`. |
| `src/lib/print/types.ts` | **New.** `PrintConfig`, `PrintProblem`, `DEFAULT_PRINT_CONFIG`, Zod schemas. |
| `src/lib/print/docx.ts` | **New.** `buildDocx(problems, config, imageBlobs)` returns a `docx.Document` ready to pack. |
| `src/lib/print/markdown-to-docx.ts` | **New.** Walks a `mdast` tree and emits docx elements; consults `mathToOmml` for math nodes. |
| `src/lib/print/math-omml.ts` | **New.** LaTeX → OMath conversion via cached MathJax + `mathml2omml`, with a graceful-fallback wrapper. |
| `src/lib/print/r2-fetch.ts` | **New.** `fetchImageBytes(storageKey): Promise<Uint8Array>` using the existing R2 client. |
| `src/lib/problems/queries.ts` | Add `getProblemsForPrint(ids)` — co-located with the existing hydration helpers. Same shape as the list query but with full `bodyMd` and ordered to match input. |
| `src/app/admin/problems/_constants.ts` | No change — `BULK_OP_LIMIT` already covers print. |
| `scripts/print-smoke.ts` | **New.** Smoke test: seed N problems with math + images, generate a docx, assert non-zero size, parse the XML inside, assert at least one `<m:oMath>` exists. |
| `scripts/run-all-smokes.sh` | Register `print-smoke.ts`. |
| `package.json` | Add `docx`, `mathjax-full`, `mathml2omml`. |

## Part 7 — Error handling and edge cases

| Failure | Behaviour |
|---|---|
| Selection empty + "Chop etish" attempt | Button hidden (same as edit/delete pattern). |
| Selection > 500 | Banner: "Maks 500 ta…" — same copy as bulk-edit/delete. Print button disabled. |
| localStorage rejects write (quota) | In-memory state still works; `console.warn` only. |
| localStorage holds malformed JSON | Hydration silently leaves selection empty; corrupt entry is overwritten on the next change. |
| Modal opens, server returns 0 problems | "Tanlangan masalalar topilmadi" empty state; "Tanlovni tozalash" button calls `clear()`. |
| Some IDs no longer exist | Dialog shows toast: "{n} ta masala topilmadi va olib tashlandi" and proceeds with the rest. |
| A formula fails to convert | Plain-text LaTeX substituted; action result includes `partial: { failedFormulas }`; dialog shows a non-blocking banner. |
| Image fetch from R2 fails (network/404) | The image is skipped; a `[rasm yuklanmadi]` placeholder text is inserted in its place; action records a `partial: { failedImages }`. |
| Action exceeds 30s | Vercel times out; the dialog shows a "Juda ko'p masala — kamroq tanlang" message and the user can split into two prints. |
| Two tabs hit the action concurrently | No shared state; each gets its own docx. |
| User reorders rapidly | Reorders are O(1) array splice; no API calls. |
| User downloads, then immediately changes config and downloads again | Two separate downloads, identical except for the config. Selection unchanged. |
| Math `$$` is unbalanced in `bodyMd` | `remark-math` parser tolerates it (treats unmatched as text); preview and docx both render the body without crashing. |
| Body contains an `<img>` HTML tag instead of markdown | Ignored — we only walk the markdown AST. (Bodies are markdown by convention; HTML is not expected.) |

## Part 8 — Smoke test outline

`scripts/print-smoke.ts`:

1. **Selection helper round-trip.** Run `JSON.parse` against representative localStorage values. Trivial but catches regressions in the serialisation shape.
2. **`loadProblemsForPrintAction`** with a mix of real and fake UUIDs returns only the real ones, in order.
3. **`mathToOmml`** on 5 canonical formulas (`\frac{1}{2}`, `\sqrt{x+1}`, `\sum_{i=1}^n i`, `\int_a^b f(x)\,dx`, `\alpha + \beta`) returns non-empty XML containing `<m:oMath>`.
4. **`mathToOmml`** on intentionally bad LaTeX (`\frac{1}{`) returns the fallback OMath without throwing.
5. **`generatePrintDocxAction`** end-to-end with 3 seeded problems (one plain, one with math, one with an image): assert resulting bytes are a valid ZIP, unzip, locate `word/document.xml`, assert it contains `<m:oMath>` and at least one image relationship.

Smoke exits `Smoke: PASSED` on success.

## Part 9 — Implementation strategy

The work decomposes into **five independent foundation tracks** that can run in parallel, followed by **three integration tasks** that depend on the foundations. The implementation plan (`docs/superpowers/plans/2026-05-25-print-feature.md`) elaborates each task with a file map, step checklist, and the recommended subagent.

Foundations (parallelisable):

- **F1.** Selection context + layout wrap + migrate existing list/bulk-edit consumers.
- **F2.** Print types + Zod schemas + default config (no React).
- **F3.** LaTeX → OMath module (math-omml.ts + cached MathJax/mathml2omml pipeline + tests against canonical formulas).
- **F4.** Markdown → docx walker, paired with `buildDocx()` and `getProblemsForPrint()` query.
- **F5.** R2 image fetcher (small wrapper over the existing client).

Integration (depend on foundations):

- **I1.** `_print-actions.ts` server actions wiring F2/F3/F4/F5 together.
- **I2.** PrintDialog UI shell + config panel + selected list (depends on F1 for context, F2 for types).
- **I3.** Preview component (depends on F2 for config; reuses the same markdown + KaTeX renderer used in the list).

Final: **V1.** Smoke tests, manual run-through, and a polish pass (icons, copy, loading states).

## Open questions

None at design time. Defaults documented in the spec; everything else has been chosen explicitly with the user.
