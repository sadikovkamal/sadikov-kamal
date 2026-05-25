# Print feature implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task-by-task. Tasks within a single Phase have no inter-dependencies and SHOULD be dispatched as parallel subagents (see `superpowers:dispatching-parallel-agents`). Use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-25-print-feature-design.md`](../specs/2026-05-25-print-feature-design.md). Read it first — this plan does not restate the design.

**Goal:** Ship a "Chop etish" action on `/admin/problems` that lets a teacher select problems across filter/page boundaries and download them as a Word `.docx` worksheet (native OMath math, embedded images, configurable layout) via a Chrome-print-style modal.

**Architecture summary:** layout-scoped React-Context + localStorage selection state; new modal with config panel + ordered selected list + live A4 HTML preview; server action that fetches full problem data, converts markdown to docx, converts LaTeX to OMath via MathJax + Microsoft's MML2OMML XSLT, embeds R2-fetched images, returns bytes.

**Tech stack additions:** `docx` (dolanmiu) for OOXML; `mathjax-full` for TeX → MathML; `xslt-processor` for MML → OMath; XSLT file (`mml2omml.xsl`) vendored from Microsoft Office.

---

## File map

**Create:**

- `src/app/admin/problems/_selection-context.tsx`
- `src/app/admin/problems/_print-actions.ts`
- `src/app/admin/problems/print-dialog.tsx`
- `src/app/admin/problems/print-dialog/config-panel.tsx`
- `src/app/admin/problems/print-dialog/selected-list.tsx`
- `src/app/admin/problems/print-dialog/preview.tsx`
- `src/lib/print/types.ts`
- `src/lib/print/docx.ts`
- `src/lib/print/markdown-to-docx.ts`
- `src/lib/print/math-omml.ts`
- `src/lib/print/r2-fetch.ts`
- `src/lib/print/mml2omml.xsl`
- `scripts/print-smoke.ts`

**Modify:**

- `src/app/admin/problems/layout.tsx` — wrap children in `<SelectionProvider>`.
- `src/app/admin/problems/problems-list.tsx` — switch to `useSelection()`; insert Print button.
- `src/app/admin/problems/bulk-edit-dialog.tsx` — switch to `useSelection()`.
- `src/app/admin/problems/_actions.ts` — after `bulkDelete` success, no change needed; the list calls `deselectMany` client-side.
- `src/lib/problems/queries.ts` — add `getProblemsForPrint(ids)`.
- `scripts/run-all-smokes.sh` — register `print-smoke.ts`.
- `package.json` — add the three new deps.

---

## Phase 0 — Dependencies (sequential, must run first)

A trivial setup task that every other phase needs. Run this first, alone.

### Task 0.1: Install npm dependencies

**Subagent:** general-purpose
**Depends on:** nothing
**Parallel with:** nothing — others may import these

- [ ] Add to `package.json` `dependencies`:
  - `"docx": "^9.0.0"` (or the latest 9.x — pin minor)
  - `"mathjax-full": "^3.2.2"`
  - `"xslt-processor": "^4.0.0"`
  - `"unified": "^11.0.5"` (transitively present via `react-markdown` today, but the docx walker imports it directly — make the dependency explicit)
  - `"remark-parse": "^11.0.0"` (same reasoning)
  - `"mdast-util-to-string"` (latest) — text fallback for unknown nodes in the docx walker
- [ ] Run `npm install` to update lockfile.
- [ ] Verify `npm run build` succeeds with the new deps installed (no usage yet).

**Verification:** `npm run build` exits 0. No new files emit any TypeScript errors.

---

## Phase 1 — Foundations (4 tasks, all parallel)

These tasks have **no inter-dependencies**. Dispatch as four parallel subagents.

### Task 1.1: Selection context + layout wrap + consumer migration

**Subagent:** general-purpose
**Depends on:** Phase 0
**Parallel with:** 1.2, 1.3, 1.4

**Files:**
- Create: `src/app/admin/problems/_selection-context.tsx`
- Modify: `src/app/admin/problems/layout.tsx`
- Modify: `src/app/admin/problems/problems-list.tsx`
- Modify: `src/app/admin/problems/bulk-edit-dialog.tsx`

- [ ] **Step 1: Build the provider.** Create `_selection-context.tsx` exactly as specified in the design (section "Part 1"). Constants:
  - `STORAGE_KEY = "provia:admin:problems:selection"`
  - Hydrate from localStorage on mount only; never during render.
  - Persist on every `selected` change via `useEffect`. Wrap `setItem` in `try/catch` and log a `console.warn` on quota errors — never throw to React.
  - Throw a clear error from `useSelection()` if used outside the provider.

- [ ] **Step 2: Wrap the layout.** Edit `layout.tsx` to keep CSS imports and the RSC default export, but wrap `children` in `<SelectionProvider>`. The provider is a client component imported by name — the layout itself stays RSC.

- [ ] **Step 3: Migrate `problems-list.tsx`.** Replace `useState<Set<string>>` with the hook. Local helpers `toggleAll`/`toggleOne` are rewritten to call `selectMany` / `toggle` from context. After successful bulk delete, call `deselectMany(deletedIds)` (the action already returns the deleted ids; if it doesn't, change the action so it does — but check first).

- [ ] **Step 4: Migrate `bulk-edit-dialog.tsx`.** Drop the `problemIds` prop. Inside the component, read `Array.from(selected)` from `useSelection()`. On successful save, call `clear()` (matches today's call-site that already clears + refreshes).

- [ ] **Step 5: Update call-sites.** Wherever `<BulkEditDialog>` is mounted, remove the `problemIds` prop. Same for any other place that passes selection IDs around.

**Verification:**
- `npm run build` and `npm run lint` succeed.
- Manual: open `/admin/problems`, tick a few cards, change filter — still ticked. Reload — still ticked. Navigate to `/admin/topics` and back — still ticked. Open one problem and back — still ticked. Bulk-edit, save — selection cleared.

### Task 1.2: Print types + Zod schemas + defaults

**Subagent:** general-purpose
**Depends on:** Phase 0
**Parallel with:** 1.1, 1.3, 1.4

**Files:**
- Create: `src/lib/print/types.ts`

- [ ] **Step 1: Declare TypeScript interfaces** exactly as in the spec ("Part 3 — Config schema"). `PrintConfig`, `PrintProblem`, `DEFAULT_PRINT_CONFIG`.

- [ ] **Step 2: Add Zod schemas** that mirror the interfaces — `printConfigSchema`, `printProblemSchema`. Title is `z.string().trim().max(200)`. Enums are `z.literal(...)` unions to keep the inferred type strict. Use `z.infer` to assert the runtime schema matches the interface — a `satisfies` check at compile time.

- [ ] **Step 3: Export everything** from `src/lib/print/types.ts`. No React, no DB — pure types.

**Verification:**
- `npx tsc --noEmit` is clean.
- `import { DEFAULT_PRINT_CONFIG, printConfigSchema } from "@/lib/print/types"` resolves.

### Task 1.3: LaTeX → OMath module

**Subagent:** general-purpose
**Depends on:** Phase 0
**Parallel with:** 1.1, 1.2, 1.4

**Files:**
- Create: `src/lib/print/math-omml.ts`
- Create: `src/lib/print/mml2omml.xsl`

- [ ] **Step 1: Vendor the XSLT.** Download Microsoft's `MML2OMML.XSL` (ships with Office; also found in `pandoc`'s repo). Save to `src/lib/print/mml2omml.xsl`. Prepend a top-of-file comment that records: original source URL, commit SHA, retrieval date (2026-05-25), license, and a note that we never modify the file.

- [ ] **Step 2: Build the cached pipeline.** In `math-omml.ts`:
  - Lazy-initialise a MathJax instance: `tex.input`, `mml.output`, no PostHTML, no SVG (we want serialised MathML output as XML string). Cache the instance in a module-level `let`.
  - Lazy-load the XSLT once via `fs.readFileSync` of the vendored file (server-only — module is marked `import "server-only"` at the top).
  - Lazy-initialise an `xslt-processor` `Xslt` instance and cache.

- [ ] **Step 3: Expose `mathToOmml(latex: string, opts?: { display?: boolean }): string`.**
  - `display: true` → MathJax `displayMath`, output wrapped in `<math display="block">` → XSLT → block-style OMath.
  - On any thrown error, return the fallback `<m:oMath><m:r><m:t>{escapedLatex}</m:t></m:r></m:oMath>` and `console.warn` the failure with the input (truncated to 100 chars).

- [ ] **Step 4: Inline ad-hoc check.** Author a throw-away `scripts/_math-omml-check.ts` (gitignored or deleted after) that calls `mathToOmml` against:
  - `\frac{a}{b}`, `\sqrt{x+1}`, `\sum_{i=1}^n i`, `\int_a^b f(x)\,dx`, `\alpha+\beta`. Assert each returns a string containing `<m:oMath`.
  - One bad input (`\frac{1}{`) — assert the fallback shape.
  - Run via `npx tsx scripts/_math-omml-check.ts`, confirm output, then delete. The permanent home for these assertions is `scripts/print-smoke.ts` (Task 4.1) — Task 1.3 just needs you to confirm the module works in isolation before downstream tasks build on it.

**Verification:**
- Manual `npx tsx -e "import('./src/lib/print/math-omml').then(m => console.log(m.mathToOmml('\\\\frac{1}{2}')))"` prints OMath XML.
- `npm run lint` and `npx tsc --noEmit` pass.

### Task 1.4: R2 image fetcher

**Subagent:** general-purpose
**Depends on:** Phase 0
**Parallel with:** 1.1, 1.2, 1.3

**Files:**
- Create: `src/lib/print/r2-fetch.ts`

- [ ] **Step 1: Implement `fetchImageBytes(storageKey: string): Promise<Uint8Array>`.** Reuse `getClient` from `src/lib/storage/r2.ts` — extend that file to export `getClient` for internal callers if it doesn't already, OR import the public URL helper and use `fetch` over the public bucket. **Prefer the S3 client** — direct R2 access keeps us off the public CDN and works even if the bucket later goes private.
- [ ] **Step 2: Add `fetchImageBytesBatch(keys: string[], opts?: { concurrency?: number }): Promise<Map<string, Uint8Array>>`.** Cap concurrency (default 10) using a small semaphore — `Promise.all` over an array of `(async () => {...})()` IIFEs with a counting gate. Failed fetches resolve to `undefined` and are returned in a parallel `failures` set so the caller can render a placeholder.
- [ ] **Step 3: Mark the module `import "server-only"`.**

**Verification:**
- Module compiles. No manual integration test in this task — Phase 2 (Task 2.2) will run it end-to-end.

---

## Phase 2 — Server side (2 tasks, parallel)

### Task 2.1: `getProblemsForPrint` query + image URL hydration

**Subagent:** general-purpose
**Depends on:** Task 1.2
**Parallel with:** 2.2

**Files:**
- Modify: `src/lib/problems/queries.ts`

- [ ] **Step 1: Add `getProblemsForPrint(ids: string[]): Promise<PrintProblem[]>`.** Mirror the existing `hydrateProblem` shape but for a batch, with `bodyMd` (not `bodyPreview`), and *re-ordered to match the input* (so the dialog's order is honoured). Missing IDs are silently dropped — the caller compares lengths.
- [ ] **Step 2: Image URLs.** For each problem, return `images: { storageKey, url, altText }[]` where `url = getPublicUrl(storageKey)` (helper already exported from `src/lib/storage/r2.ts`). The dialog preview displays from `url`; the docx generator fetches bytes via Task 1.4's helper using `storageKey`. Carrying both keeps neither path responsible for deriving the other. The `PrintProblem` shape in `src/lib/print/types.ts` (declared in Task 1.2) already includes both fields — no refinement here.

**Verification:**
- `npx tsc --noEmit` passes.
- Manual: `npx tsx -e "..."` to call the query with a known UUID and inspect the shape.

### Task 2.2: Markdown → docx walker + `buildDocx` assembler

**Subagent:** general-purpose
**Depends on:** Tasks 1.2, 1.3, 1.4
**Parallel with:** 2.1

**Files:**
- Create: `src/lib/print/markdown-to-docx.ts`
- Create: `src/lib/print/docx.ts`

- [ ] **Step 1: `markdown-to-docx.ts` — exports `renderProblemBodyToParagraphs(bodyMd, ctx)`.**
  - Use `unified().use(remarkParse).use(remarkMath).use(remarkGfm).parse(bodyMd)` (these packages are already in `package.json`).
  - Walk the `mdast` root's children. Map each node per the design's "Markdown → docx element map" table (Part 4 of the spec).
  - For `inlineMath` / `math` nodes call `mathToOmml(node.value, { display: node.type === "math" })` and wrap with `ImportedXmlComponent.fromXmlString(omml)` inside the surrounding paragraph.
  - For `image` nodes look up the matching image in `ctx.images: Map<url, Uint8Array>` and emit an `ImageRun({ data, transformation: { width, height } })` in its own paragraph. Width is capped to `ctx.maxImageWidthEmu`. Compute height with aspect ratio detection — `docx`'s `ImageRun` accepts width+height in EMU; we don't know the source dimensions without parsing the image, so we use `sharp`? **No** — adding sharp is overkill. We read the image bytes' dimensions via a tiny helper that recognises PNG (IHDR), JPEG (SOF markers), GIF (LSD), and WEBP (VP8X/VP8/VP8L) headers. Implement inline as `getImageDimensions(bytes)` in this file. If unknown, fall back to a square at `maxImageWidthEmu`.
  - Unknown node types: walk children, emit text. Never throw.

- [ ] **Step 2: `docx.ts` — exports `buildDocx(problems: PrintProblem[], config: PrintConfig, images: Map<storageKey, Uint8Array>): Document`.**
  - Open the `Document` with `creator: "Provia"`, `title: config.title || undefined`.
  - One `Section` with the configured margins. Margin map: `narrow → 720 twips`, `normal → 1440`, `wide → 1800` (twips = 1/1440 inch).
  - If `config.title` is non-empty, prepend a centered, bold, 16pt `Paragraph` with the title plus a spacer.
  - For each problem:
    - If any `config.showFields.*` is true: a small grey 9pt `Paragraph` with the assembled metadata line (code · source · age · topics · methods). Each field prefixed with its label in Uzbek (`Kod:`, `Manba:`, `Yosh:`, `Mavzu:`, `Metod:`). Set `keepNext: true` so it sticks to the body.
    - Body paragraphs from `renderProblemBodyToParagraphs`, with the first body paragraph prefixed by the number (`"1. "`, `"1) "`, or `"Masala 1. "`).
    - For each image, an `ImageRun`-only paragraph after the body.
    - 240 twips (12pt) after-spacing on the last paragraph of the problem.
  - Pass `font: "Times New Roman"`, `size: config.fontSize * 2` (docx uses half-points) on every default run via the document `styles.default.document.run`.
  - Return the `Document` — caller packs.

- [ ] **Step 3: Unit-test the image dimension parser** with one PNG, one JPEG, one GIF, one WEBP from the test fixtures (or generate small ones inline). Keep this near the top of Task 4.1's smoke test if it's easier.

**Verification:**
- Compile + lint pass.
- Phase 3 (Task 3.1) will exercise this end-to-end.

---

## Phase 3 — Integration: server action + UI shell (3 tasks, parallel)

### Task 3.1: `_print-actions.ts` — `loadProblemsForPrintAction` + `generatePrintDocxAction`

**Subagent:** general-purpose
**Depends on:** Tasks 2.1, 2.2, 1.4
**Parallel with:** 3.2, 3.3

**Files:**
- Create: `src/app/admin/problems/_print-actions.ts`

- [ ] **Step 1: `loadProblemsForPrintAction`.** Server action shape per spec. Auth-gate via the existing admin session helper (e.g. `requireAdminSession()` if one exists — check `src/lib/auth/`). Zod-validate the input. Call `getProblemsForPrint(ids)`. Return `{ ok: true, problems }` or `{ ok: false, error: <user-friendly Uzbek> }`.

- [ ] **Step 2: `generatePrintDocxAction`.**
  - Auth-gate + Zod-validate (`orderedIds` len in `[1, BULK_OP_LIMIT]`, `config` via `printConfigSchema`).
  - `const problems = await getProblemsForPrint(orderedIds)`.
  - Collect all `storageKey`s. `const imageMap = await fetchImageBytesBatch(keys)`.
  - `const doc = buildDocx(problems, config, imageMap)`.
  - `const bytes = await Packer.toBuffer(doc)` — `docx`'s `Packer` returns a Node Buffer; convert to `ArrayBuffer` via `bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)`.
  - Return `{ ok: true, bytes, filename: \`masalalar-${new Date().toISOString().slice(0,10)}.docx\`, partial?: { failedFormulas, failedImages } }`.
  - On any unhandled throw, log via `console.error` with a request id, return `{ ok: false, error: "Hujjat tayyorlashda xatolik" }`.

**Verification:**
- `npx tsc --noEmit` passes.
- Smoke (Phase 4) exercises this end-to-end.

### Task 3.2: PrintDialog shell + config panel + selected list

**Subagent:** general-purpose
**Depends on:** Tasks 1.1, 1.2
**Parallel with:** 3.1, 3.3

**Files:**
- Create: `src/app/admin/problems/print-dialog.tsx`
- Create: `src/app/admin/problems/print-dialog/config-panel.tsx`
- Create: `src/app/admin/problems/print-dialog/selected-list.tsx`

- [ ] **Step 1: `print-dialog.tsx` shell.**
  - Built on the existing `Dialog` primitive from `@/components/ui/dialog`.
  - `DialogContent` overrides `className="sm:max-w-[1100px] h-[85vh] p-0 overflow-hidden"`.
  - Two-column grid: `grid grid-cols-[20rem_1fr]`. Left = sticky config column with internal scroll; right = preview pane.
  - Local state: `config: PrintConfig` (init to `DEFAULT_PRINT_CONFIG`), `orderedIds: string[]` (init from `[...selected]` once on open), `problems: PrintProblem[] | "loading" | { error }`, `isGenerating: boolean`, `genResult: null | { failedFormulas, failedImages }`.
  - On open, run `loadProblemsForPrintAction(orderedIds)` once. If response shorter than input, `deselectMany(missing)` and toast "{n} ta masala topilmadi va olib tashlandi".
  - Footer: `[Bekor qilish]` (close), `[Yuklab olish .docx]` (calls `generatePrintDocxAction`, on success builds a `Blob` and triggers download via temporary anchor).
  - The download button is `disabled={orderedIds.length === 0 || isGenerating}`.

- [ ] **Step 2: `config-panel.tsx`.** Three collapsible sections (use the existing primitives or a simple `<details>` if no Accordion ships in `components/ui` — check). Sections: Hujjat, Har masala ma'lumoti, Tanlanganlar (which is the embedded selected list). Use `Input`, native `<select>`, `Checkbox` components already in the repo. Wire every field via `onChange={(v) => setConfig(c => ({ ...c, fieldName: v }))}`.

- [ ] **Step 3: `selected-list.tsx`.**
  - Props: `problems: PrintProblem[]`, `orderedIds: string[]`, `onReorder(newIds: string[])`, `onRemove(id: string)`.
  - Row: small number prefix, code chip, 1-line preview (use the existing `stripMarkdownToPreview` server-side helper… **wait, that's `server-only`.** We need a client-safe text-only version. Inline a tiny `stripMd(bodyMd, 60)` in this component — drop markdown punctuation, no KaTeX). Up/down/remove buttons.
  - "Asl tartibga qaytarish" button resets via the parent.

**Verification:**
- Manual: with no print action yet, mock the load to return fake problems; verify the panel renders, fields update config, list reorders.

### Task 3.3: Preview component

**Subagent:** general-purpose
**Depends on:** Task 1.2
**Parallel with:** 3.1, 3.2

**Files:**
- Create: `src/app/admin/problems/print-dialog/preview.tsx`

- [ ] **Step 1: Build the A4 page frame.** A single `<div>` styled as `width: 794px; max-height: 1123px; aspect-ratio: 210/297; box-shadow: 0 4px 20px rgba(0,0,0,0.08); background: white;` centred in a `padding: 2rem` scroll container.
- [ ] **Step 2: Apply config.** Inline `padding` per `margins`, `font-size` and `line-height` per config, `font-family: 'Times New Roman', Times, serif`.
- [ ] **Step 3: Render problems.**
  - For each `PrintProblem`, render the header line if any `showFields.*` is on. Use a small muted `<div>` with `text-xs text-muted-foreground border-b`-like styling but in print-paper aesthetic.
  - Render markdown body via `react-markdown` + `remark-math` + `remark-gfm` + `rehype-katex`, configured the same way as the list preview. The first paragraph gets prefixed with the numbering (use `components` override on `react-markdown` for the first paragraph of each problem).
  - Each image lands in its own `<p>` with `<img src={url} loading="lazy" />`, `max-width: 100%`, `display: block`, `margin-top: 0.5em`.
- [ ] **Step 4: Pagination guide-rails.** After rendering all problems, measure cumulative content height via a `ResizeObserver` on the inner wrapper. Inject visual dashed horizontal `─ Sahifa N ─` divider at each multiple of `(A4 content height = 1123 - 2*padding)`. Best-effort — fine if it's off by a line.
- [ ] **Step 5: Debounce.** Wrap the config-derived render in `useDeferredValue(config)` (React 19 ships it) — that gives us a free 150 ms style debounce.
- [ ] **Step 6: > 200 problems guard.** If `problems.length > 200`, render only the first 50 plus a "Yana {n} ta masala — to'liq ko'rsatish" button that lifts the cap.

**Verification:**
- Manual: pass static fixture problems; verify rendering and that toggling each config knob immediately updates the preview.

---

## Phase 4 — Wire-up + verification (sequential)

### Task 4.1: Smoke test

**Subagent:** general-purpose
**Depends on:** Phase 3 complete
**Parallel with:** nothing

**Files:**
- Create: `scripts/print-smoke.ts`
- Modify: `scripts/run-all-smokes.sh`

- [ ] **Step 1: Author the smoke** per the design spec ("Part 8 — Smoke test outline"). All five checks. Seed fixtures inline (don't depend on the live DB state); clean up at the end.
- [ ] **Step 2: Register** in `run-all-smokes.sh` alongside the other smokes.
- [ ] **Step 3: Run locally.** `bash scripts/run-all-smokes.sh` (or directly `npx tsx scripts/print-smoke.ts`). All checks pass; script exits `Smoke: PASSED`.

**Verification:** smoke script exits 0; combined `npm run lint && npx tsc --noEmit && npm run build` all clean.

### Task 4.2: Mount the Print button + manual run-through

**Subagent:** general-purpose (the author of Task 1.1 already touched problems-list, but the dialog mount needs the actual `PrintDialog` import — wire here once 3.2 ships)
**Depends on:** Tasks 1.1, 3.2, 3.1
**Parallel with:** nothing

**Files:**
- Modify: `src/app/admin/problems/problems-list.tsx`

- [ ] **Step 1: Import** `<PrintDialog>` and render it conditionally on `printOpen` state. Add a `Printer` icon button to the bulk toolbar (between "Bekor qilish" and "O'zgartirish"). Same `variant="outline"`, `size="xs"`, `disabled={isPending || overBulkLimit}`.
- [ ] **Step 2: Manual run-through.** Run `npm run dev`. As an admin:
  - Filter to a topic with ≤ 20 problems; tick all; click "Chop etish".
  - Verify modal opens; preview renders within ~1s.
  - Toggle every field on; verify metadata line appears in preview.
  - Change font, line-height, margins; verify preview updates.
  - Reorder a few rows; verify preview reflects new order.
  - Remove one row via the × button; verify preview drops it AND the underlying card un-ticks.
  - Click "Yuklab olish"; verify the .docx downloads and opens cleanly in Word/LibreOffice with formulas as OMath (right-click → "Equation").
  - Close modal; verify selection persists. Reload page; verify selection persists.
  - Filter to a different topic, tick a few more; click "Chop etish" — preview shows union (in selection order).

**Verification:** all manual checks pass; no console errors.

### Task 4.3: Documentation polish

**Subagent:** general-purpose
**Depends on:** 4.2
**Parallel with:** nothing

**Files:**
- Modify: `docs/admin-guide.md`

- [ ] **Step 1: Add a "Masala chop etish" section** in the admin guide describing the workflow: select via filters → "Chop etish" → adjust → download. Note the Word-vs-preview pagination caveat. Two screenshots optional (add `TODO` placeholders if not generating them this session).

**Verification:** the new section reads cleanly; matches the actual UI strings.

---

## Phase ordering and parallel dispatch summary

```
Phase 0  ──▶  Phase 1 (1.1 ∥ 1.2 ∥ 1.3 ∥ 1.4)  ──▶  Phase 2 (2.1 ∥ 2.2)  ──▶  Phase 3 (3.1 ∥ 3.2 ∥ 3.3)  ──▶  Phase 4 (4.1 ─▶ 4.2 ─▶ 4.3)
```

- **Phase 0**: 1 task, ~5 minutes.
- **Phase 1**: 4 parallel subagents, ~30 minutes each, finishes in ~30 minutes wall-clock.
- **Phase 2**: 2 parallel subagents, ~30 min each.
- **Phase 3**: 3 parallel subagents, ~30–45 min each.
- **Phase 4**: 3 sequential tasks, ~30 min total.

Total wall-clock estimate (with parallelism): **~2.5 hours.**
Total work content: ~13 task-hours.

---

## Risks and contingencies

| Risk | Likelihood | Mitigation |
|---|---|---|
| `docx` library version doesn't expose `ImportedXmlComponent.fromXmlString` (API drift). | Low (v9 has it, v8 had it) | Pin to `^9.0.0`. If broken in a later patch, fall back to extending `XmlComponent` directly — `docx` allows raw XML via subclassing. |
| MML2OMML XSLT output rejected by Word. | Low (Microsoft uses it themselves) | Smoke unzips the docx and validates `word/document.xml` contains `<m:oMath>` *and* opens in LibreOffice (manual). |
| MathJax SSR startup adds >500 ms to action latency. | Medium | Cache the instance module-wide (already in spec). Cold-start hit is one-time per Vercel function instance. |
| `xslt-processor` library is dead / buggy. | Medium | If it errors on the vendored XSLT, swap to `saxon-js` (4 MB but more battle-tested). Both APIs are similar. |
| 500-problem print blows past Vercel 30s. | Medium-low (typical print ≤ 50) | Action returns a clear error; UI suggests splitting. Future: stream-to-blob with progress. |
| LocalStorage corruption breaks selection. | Low | `try/catch` around parse; corrupt data is overwritten on next change. |
| Image dimension parser fails on an exotic format. | Low | Fallback to a square at max width. |

## Open questions

None — answered during brainstorming.
