# Phase 4 — Source ("Manba") Toggle

> **Goal:** Add a whole-document raw-Markdown mode the user can flip to —
> for trust/verification, fast LaTeX typing, pasting generated markdown,
> and recovering from any parser surprise — with **guarded** two-way sync
> so switching modes never silently loses content.
>
> **Depends on:** Phase 3 (the visual editor), Phase 1 (md I/O).
> **Blocks:** nothing (Phase 5 integrates the combined component).
> **Deliverables:** `source-mode/source-toggle.tsx`, mode state in
> `index.tsx`.

> **Reminder of intent (from requirements):** this is the
> *whole-document* escape hatch, distinct from the *per-formula* raw-LaTeX
> fallback shipped in Phase 2. Beginners never touch this; admins/power
> users do.

---

## Stage 4.1 — Mode state & toggle UI

### Step 4.1.1 — Mode state
- [ ] In `ProblemBodyEditor` (`index.tsx`), add
      `const [mode, setMode] = useState<"visual" | "source">("visual")`.
- [ ] The component remains controlled on `value` (body_md). Both modes
      read/write the **same** `value`/`onChange` — they are two views of
      one string.

### Step 4.1.2 — Toggle control
- [ ] `source-mode/source-toggle.tsx`: a small segmented control / icon
      button in the editor header's reserved slot (Phase 3.1.3). Labels in
      Uzbek: **"Ko'rinish"** (visual) / **"Manba"** (source). Use a
      `</>`-style icon for source.
- [ ] Accessible: it's a toggle button with `aria-pressed`; keyboard
      reachable.

**Verification:** the toggle renders in the header and flips `mode`.

---

## Stage 4.2 — The source view

### Step 4.2.1 — Raw markdown textarea
- [ ] In `source` mode, render a monospace editor over the **same**
      `value`. Reuse the existing CodeMirror `MarkdownEditor`
      ([`markdown-editor.tsx`](../../../../src/components/markdown-editor.tsx)) for nice editing (line wrap, image
      drop already supported) **or** a plain `<textarea>` if we are
      retiring CodeMirror. Decide in Phase 6 cleanup; either way it edits
      `value` directly and calls `onChange`.
- [ ] Source mode shows the literal `body_md` — including `$...$` and
      `![alt](url)` — so the user sees exactly what is stored.

### Step 4.2.2 — Image upload still works in source mode
- [ ] Keep the header "Rasm yuklash" working in source mode (insert the
      `![alt](url)` text at the cursor), matching today's behavior, so the
      two modes are feature-equivalent for images.

**Verification:** flipping to source shows the current body as raw
markdown; editing it updates `value`; flipping back reflects the edits.

---

## Stage 4.3 — Guarded two-way sync (the safety logic)

The only real hazard is switching **source → visual** when the source is
malformed. Guard it.

### Step 4.3.1 — visual → source (always safe)
- [ ] On switch to source, the current `value` is already the serialized
      markdown (the visual editor keeps `value` current via `onChange`).
      Just show it. No conversion risk.

### Step 4.3.2 — source → visual (guarded)
- [ ] On switch to visual, attempt `markdownToDoc(value)` inside a
      try/catch:
  - [ ] **Success** → load the doc into the TipTap editor
        (`setContent`, Phase 3.1.2) and switch.
  - [ ] **Failure / suspicious result** → **stay in source mode** and show
        an inline error: *"Manba matnida xato bor — vizual rejimga o'tib
        bo'lmadi. Tuzating yoki manba rejimida saqlang."* Never drop the
        user's text.
- [ ] Define "suspicious result": e.g. `markdownToDoc` produced a text
      fallback for content that contained `$` (a hint the math didn't
      tokenize). Log it in dev; surface a soft warning, not a hard block,
      unless it actually threw.

### Step 4.3.3 — Unsaved-edit safety
- [ ] If the user is mid-edit in MathLive (a formula node open) when they
      hit the toggle, commit that formula first (or block the toggle until
      committed) so no in-flight formula edit is lost.

**Verification:** intentionally type broken markdown (e.g. an unclosed
`$`) in source mode, hit "Ko'rinish" → the editor refuses, keeps the
text, and explains why. Fix it → switching now works.

---

## Stage 4.4 — Persisted preference (optional polish)

### Step 4.4.1 — Remember the last-used mode
- [ ] Optionally persist the preferred mode in `localStorage` (per the
      admin) so a power user who lives in source mode isn't reset each
      time. Default remains `visual` for first-time users.

**Verification:** (if implemented) reload keeps the last chosen mode.

---

## Phase 4 — Acceptance criteria

- [ ] A header toggle switches between **Ko'rinish** (visual WYSIWYG) and
      **Manba** (raw markdown) over the same `value`.
- [ ] visual → source always works; source shows the exact `body_md`.
- [ ] source → visual is guarded: malformed markdown keeps the user in
      source mode with a clear, non-destructive error.
- [ ] Image upload works in both modes.
- [ ] Switching never loses content or an in-flight formula edit.
- [ ] `scripts/wysiwyg-smoke.ts` still green; `tsc` + `lint` clean.
