# Sidebar Collapse + Problem Detail Page Redesign

**Date:** 2026-05-15
**Scope:** Admin shell sidebar gets a collapse toggle. Problem detail page is restructured for stronger hierarchy.

## Goals

1. Let the admin reclaim horizontal space by collapsing the sidebar to an icons-only rail. State persists across navigations.
2. Rework `/admin/problems/[id]` so the most important info (identity, taxonomy, answer) is immediately scannable, and the body sections have visible hierarchy.

## Non-goals

- No new global header.
- No mobile-specific drawer behavior (admin is desktop-first; current `lg:` breakpoint behavior is preserved).
- No changes to problem editor, list, or other admin pages.
- No changes to data layer.

---

## Part 1 — Sidebar Collapse

### State model

- Single cookie `sidebar:collapsed` with value `1` (collapsed) or absent/`0` (expanded).
- Cookie is written by client code: `document.cookie = "sidebar:collapsed=1; path=/; max-age=31536000; samesite=lax"`.
- Server reads via `cookies()` from `next/headers` in `admin/layout.tsx` and passes `initialCollapsed: boolean` to a client wrapper. This avoids hydration flash because SSR already emits the correct width.

Why cookie over localStorage: SSR has no access to `localStorage`, which would cause the sidebar to render expanded on first paint then snap collapsed once JS hydrates. Cookie eliminates the snap.

### Components

- `admin/layout.tsx` — server component. Reads cookie, renders `<SidebarShell collapsed={initialCollapsed}>`.
- `admin/sidebar-shell.tsx` (new, client) — holds collapsed state (`useState(initialCollapsed)`), writes cookie on toggle, lays out brand row, nav, and account block. Receives `user` props (name, email, initials) and the logout `<form>` as children/slots (server-rendered form action stays from layout).
- `admin/sidebar-nav.tsx` — accepts `collapsed: boolean` prop. When collapsed, hides section labels and item labels, shows only icons. Adds `title` attribute on each link for native tooltip.
- `admin/sidebar-toggle.tsx` (new, client) — small icon button that flips state.

### Layout specs

| Property | Expanded | Collapsed |
|---|---|---|
| Sidebar width | `220px` | `56px` |
| Brand area | Wordmark (104×26) | Logo mark (24×24) |
| Toggle button | Top-right of brand row | Below brand mark, centered |
| Nav item | `h-8` row, icon + label | `size-9` square, icon only |
| Section label | Visible | Hidden |
| Account block | Avatar + name/email + logout icon | Avatar centered, native title tooltip on hover; logout icon stacked below |
| Transition | `width 150ms ease-out` on the `<aside>` |

### Iconography

- Expanded toggle icon: `PanelLeftClose` (lucide)
- Collapsed toggle icon: `PanelLeftOpen` (lucide)
- Tooltip mechanism in collapsed mode: native `title` attribute (lightweight; no extra deps). If polish is needed later we can swap to base-ui Tooltip, but not in this pass.

### Edge cases

- Cookie value other than `1` → treat as expanded.
- Account block in collapsed mode: name/email truncate to nothing. Avatar still shows initials. Logout becomes a separate icon-only button stacked under the avatar.
- Toggle is keyboard accessible (it's a button).

---

## Part 2 — Problem Detail Page

### Problems with current design

1. Title (`text-xl`) competes with breadcrumb and section labels; no clear visual anchor.
2. "Shart" / "Yechim" section labels (`text-[10px] uppercase muted`) are too quiet — they read as metadata, not content boundaries.
3. "Javob" gets its own full-width card for a short string — wasteful.
4. Two-column layout pushes metadata into a sticky sidebar; readers must visually jump between content and meta.
5. Edit and Delete are both `outline`/`destructive` at equal weight on the title row — no primary action hierarchy.
6. No empty state when `solutionMd` is absent — admin has no signal that solution is missing.

### New structure

Single-column layout. Hero card at the top consolidates identity + taxonomy + answer. Body sections (`Shart`, `Yechim`) follow underneath.

```
breadcrumb (Masalalar / DTM / 2023 / #42)

┌──────────────────────────────────────────────┐
│ DTM · 2023 · #42                [Tahrirlash] │
│ {chips: 11-sinf · Algebra · Geometriya …}    │  [O'chirish dialog]
│ Javob:  42                                    │
└──────────────────────────────────────────────┘

── SHART ──
┌──────────────────────────────────────────────┐
│ <markdown body>                              │
└──────────────────────────────────────────────┘

── YECHIM ──
┌──────────────────────────────────────────────┐ (or dashed empty state)
│ <markdown body>                              │
└──────────────────────────────────────────────┘
```

### Hero card

- Container: `rounded-xl border bg-card p-6 space-y-4`.
- Title row: `text-2xl font-semibold tracking-tight` left, action buttons (Tahrirlash outline + O'chirish destructive) right. Buttons unchanged in variant — the change is they sit inside the hero, not on a bare header.
- Chip row: classes (secondary badge) + topics (outline badge) flow inline in one `flex flex-wrap gap-1.5` row. If no chips, the row is omitted.
- Answer row (only if `p.answer`): `Javob:` muted label + the value in a soft accent pill (`bg-[var(--accent-brand-soft)] text-[var(--accent-brand-strong)] font-mono`).
- "Manba" link is no longer a meta row — the identifier in the title already names the source. Year and number are part of the title. So the meta panel collapses entirely into the title and chip rows.

### Body sections

- Section header: `text-xs font-semibold uppercase tracking-wider text-foreground/70` with a thin underline (`border-b pb-1.5`). Reads as a heading, not metadata.
- Card body: `rounded-xl border bg-card px-6 py-5` (slightly more vertical room than current).
- "Yechim" empty state when `solutionMd` is missing: dashed-border card, muted text "Yechim qo'shilmagan", and a `Yechim yozish` outline button linking to the edit page.

### Action buttons

- `Tahrirlash` — `outline` with `Pencil` icon (unchanged).
- `O'chirish` — keeps existing `DeleteProblemButton` (destructive + Dialog confirmation).
- Both right-aligned in the hero title row, `flex gap-2 shrink-0`.

### Responsive

- Single-column already works at every breakpoint. Hero card title row uses `flex-wrap` so the action buttons drop below the title on narrow screens.

---

## Files to change

- `src/app/admin/layout.tsx` — read cookie, render new `<SidebarShell>`.
- `src/app/admin/sidebar-shell.tsx` — new, client wrapper.
- `src/app/admin/sidebar-nav.tsx` — accept `collapsed` prop, conditional render.
- `src/app/admin/sidebar-toggle.tsx` — new, client icon button.
- `src/app/admin/problems/[id]/page.tsx` — restructure to hero + sections, drop meta panel.

No schema, server actions, or auth touched.

---

## Test plan

Manual smoke (dev server already running at `localhost:3000`):

- `/admin` — sidebar shows expanded with all sections and labels.
- Click toggle → sidebar collapses to 56px, icons only, tooltips on hover.
- Reload → sidebar stays collapsed (cookie persisted, no flash).
- Click toggle again → expands, cookie cleared/zeroed.
- Navigate to `/admin/problems/<id>` — hero card, chips, body sections render. If answer is present, it shows as a pill in the hero. If solution is absent, empty-state card appears.
- Tahrirlash button navigates to edit page. O'chirish opens existing confirmation dialog.
- No TypeScript errors, no hydration warnings in console.
