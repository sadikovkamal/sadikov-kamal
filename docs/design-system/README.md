# Provia Design System

> **Provia** — *"prove" + "via"* — **the path to proof.**
> A math-olympiad problem database for Uzbekistan, currently an admin-only CMS.
> Slogan: **"Isbotga yo'l"**

This folder is a working design system for the Provia product: tokens, type and
color foundations, brand marks, an admin UI kit, and the public landing.

---

## Sources

This system was derived directly from the production codebase:

- **GitHub:** `github.com/sadikovkamal/provia` (branch `main`)
- **Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui (`base-nova` style, neutral base)
- **Math:** server-rendered KaTeX
- **Editor:** CodeMirror 6 with `@codemirror/lang-markdown`
- **Icons:** `lucide-react`
- **Type:** Geist Sans + Geist Mono via `next/font/google`

Original component source lives at `src/components/ui/*` and `src/app/**` inside
the repo. Imported reference files in this project sit under `src/` (read-only
mirror — do not edit, edit the design tokens or UI-kit recreations instead).

---

## Index

| File / folder | What |
|---|---|
| `README.md` | This file — high-level context + foundations narrative |
| `colors_and_type.css` | All CSS variables: color tokens (light + dark), type ramp, spacing, radii, shadows |
| `fonts/` | Geist Sans + Geist Mono (Google Fonts CSS import; no static files needed) |
| `assets/` | Logo marks (wordmark + "P" glyph), favicons |
| `preview/` | Cards rendered in the Design System tab — colors, type, components, brand |
| `ui_kits/admin/` | Hi-fi React recreation of the admin panel (dashboard, problems list, problem view, editor, import) |
| `ui_kits/public/` | Hi-fi React recreation of the public surface (landing + login) |
| `src/` | Read-only mirror of imported source code (reference only) |
| `SKILL.md` | Skill descriptor — makes this folder cross-compatible with Claude Code Agent Skills |

---

## Content fundamentals

**Language: Uzbek (Latin script).** The interface is in Uzbek; problem text is
usually Uzbek but may be English or Russian. Code identifiers stay in English.

**Tone: academic, serious, terse.** This is a teaching tool, not a game. No
mascots, no exclamations, no congratulatory copy. The user is a math teacher or
content editor — assume competence.

**Casing.** Sentence-case for headings, labels, buttons, and table headers.
Never SCREAMING CAPS, never Title Case For Marketing Reasons. Examples from the
live product:

- Page titles: `Boshqaruv paneli` · `Masalalar` · `Mavzular`
- Buttons: `Yangi masala` · `Saqlash` · `Bekor qilish` · `O'chirish`
- Section headings: `So'nggi importlar`
- Form labels: `Qidiruv` · `Qiyinlik` · `Manba` · `Yil` · `Sinflar`

**Apostrophes.** Use the typographic apostrophe `'` in user-visible Uzbek
copy (`o'chirish`, `bo'sh`, `so'nggi`). In JSX source it appears as `&apos;`.

**Voice: third-person and imperative.** No "you", no "we", no "I". Buttons are
verbs in the imperative (`Saqlash` = Save, `Tahrirlash` = Edit). Empty states
are factual: `Hali import qilinmagan.` (Nothing imported yet.) ·
`Hozirgi filtrlar bilan masala topilmadi.` (No problems found with current filters.)

**Numbers and dates.** Always localized via `toLocaleString("uz-UZ")` /
`toLocaleDateString("uz-UZ")`. Counts are followed by the counter noun:
`3 ta masala` (3 problems), `${selected.size} ta tanlangan` (N selected).

**No emoji. No decorative unicode.** Lucide icons or nothing. The brief is
explicit: *"toza, akademik, jiddiy — bu o'quv vositasi, o'yin emas."*

**Math is sacred.** LaTeX inside `$…$` or `$$…$$` renders via KaTeX. Never
substitute Unicode for inline math (`x²` is wrong; `$x^2$` is right). Problem
bodies are markdown + KaTeX; preserve both.

---

## Visual foundations

### Colors

The base palette is **pure neutrals** in OKLCH — lifted directly from shadcn
`base-nova` with neutral base color. The codebase ships zero hue; we add a
single **academic indigo** as the brand accent because the spec calls for "one
accent color (blue or purple)" and Provia is a path *to* proof — direction.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` (white) | `oklch(0.145 0 0)` | Page bg |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Body text |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Subtle fills |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | Secondary text |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | All dividers |
| `--primary` | `oklch(0.205 0 0)` (near-black) | `oklch(0.922 0 0)` | Default buttons, focus |
| `--accent-brand` | `oklch(0.52 0.18 264)` | `oklch(0.68 0.16 264)` | Indigo — links, brand mark, charts |
| `--destructive` | `oklch(0.577 0.245 27)` | `oklch(0.704 0.191 22)` | Delete, errors |

**Charts** use a 5-step neutral ramp (`--chart-1`…`--chart-5`) to keep
analytical surfaces calm. Difficulty 1–5 reuses this scale: light → dark =
easy → hard, never red/green stoplight (the brief says "yashil → qizil, yoki
neytral"; we pick neutral, which fits the academic tone better).

### Type

**Geist Sans** for everything (body, headings, UI). **Geist Mono** for code,
identifiers, and any monospace context. KaTeX brings its own Computer Modern
for math — leave it alone.

| Style | Size | Line-height | Weight | Usage |
|---|---|---|---|---|
| Display | 2rem / 32px | 1.15 | 700 | `<h1>` on landing |
| H1 | 1.5rem / 24px | 1.2 | 700 | Page titles (`Boshqaruv paneli`) |
| H2 | 1.125rem / 18px | 1.3 | 600 | Section heads |
| Body | 0.875rem / 14px | 1.5 | 400 | Default UI |
| Small | 0.8rem / 13px | 1.45 | 400 | Helper text, table cells |
| XS | 0.75rem / 12px | 1.4 | 400 | Badges, captions |
| Mono | 0.875rem / 14px | 1.5 | 400 | Code, IDs |

Body default is **14px**, not 16. This is an admin tool — density matters.

### Spacing

Tailwind defaults (4px base). Page padding is `p-6` (24px) inside the
`max-w-6xl` admin shell. Card padding `px-4 py-4`. Sections gap `space-y-6`.
Stat-card grid `gap-3`. Inline pairs `gap-2`. Form rows `space-y-4`.

### Radii

Driven by `--radius: 0.625rem` (10px). Tailwind v4 derives:
`--radius-sm = 6px`, `--radius-md = 8px`, `--radius-lg = 10px`,
`--radius-xl = 14px`. Buttons use `rounded-lg`. Badges use `rounded-4xl`
(pill). Cards use `rounded-xl`. Inputs use `rounded-md`.

### Shadows / elevation

The system is **flat by design**. Cards use a single hairline `ring-1
ring-foreground/10` instead of a drop shadow. The only elevated surface is
the dialog (`shadow-lg` from Radix default). Hover never adds shadow — only
background tint (`hover:bg-muted`).

### Borders

`1px solid var(--border)` everywhere a divider appears: table rows, card
edges, sidebar separators, dialog header/footer. In dark mode borders shift
to `oklch(1 0 0 / 10%)` — a translucent white, not a fixed gray, so they
adapt to whatever surface they sit on.

### Backgrounds

**Solid colors only.** No gradients, no images, no textures. The page is
`--background`; sections sit on `--muted` when they need separation; the only
"image" anywhere in the app is the favicon and a user-uploaded problem image.

### Hover / press states

- **Hover:** background tint shifts to `bg-muted` (interactive rows, ghost
  buttons) or the primary fill goes to `bg-primary/80` (filled buttons).
  **Never opacity, never scale.**
- **Press:** `active:translate-y-px` on buttons — a 1px nudge down, no color
  change. This is the only motion in the system.
- **Focus:** 3px outer ring at `--ring/50` plus a border swap to `--ring`.
  Visible on keyboard nav only (`focus-visible:`).

### Transitions

`transition-all` on buttons and badges; durations stay at Tailwind defaults
(150ms). **No bounces. No springs. No staggered entries.** The brief says
serious — motion serves feedback, not decoration.

### Transparency and blur

Used sparingly:
- `bg-destructive/10` for destructive-button fills (10% red on white)
- `bg-input/30` for dark-mode input backgrounds
- `border-foreground/10` for card rings
- **No backdrop-blur anywhere.** This is not a glass UI.

### Card pattern

```
<div class="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
  …
</div>
```

That's it. No outer shadow, no gradient border, no hover lift. Stat cards on
the dashboard add a `hover:bg-muted` for clickability.

### Layout rules

- **Admin shell:** `max-w-6xl` (1152px) centered. Header is a full-bleed
  border-bottom strip; content is constrained.
- **Filters sidebar** on the problems list: left column, ~256px, sticky with
  the table.
- **Two-column editor:** 50/50 split, CodeMirror left, live preview right.
- **Mobile:** admin pages collapse the sidebar to a top sheet; the brief says
  admin is desktop-first, so mobile is functional but not the design target.

### Math rendering

KaTeX is loaded globally via `import "katex/dist/katex.min.css"` in the root
layout. Display equations get `$$…$$` (centered block), inline gets `$…$`.
Custom CSS adjustments are forbidden — KaTeX's own metrics are precise and
overriding them breaks alignment.

---

## Iconography

**Library:** `lucide-react` (already in `package.json`). Stroke-based icons,
1.5px stroke at default size, 16px (`size-4`) in buttons, 12px (`size-3`) in
badges and small contexts. Loaded from CDN in the design system previews:
`https://unpkg.com/lucide-static@latest/icons/<name>.svg`.

**Usage in the codebase** (from `problems-table.tsx`, `filters-sidebar.tsx`,
etc.):
- `ArrowUp` / `ArrowDown` / `ArrowUpDown` — sort indicators
- `Check` — selected state in command palettes
- `X` — dialog close
- `ChevronDown` / `ChevronRight` — disclosure, tree expand
- `Search` — search field affordance
- `Upload` — drop zones
- `Trash2` — delete (destructive variant)
- `Plus` — "Yangi …" actions
- `Filter` — filter sidebar toggle on mobile

**No emoji.** None. The brief is explicit.

**No custom SVG illustrations.** Empty states are typographic — a one-line
factual message in `text-muted-foreground`, optionally a single lucide icon
above it.

**Brand mark.** A single glyph: the letter **P** with a subtle arrow/path
motif in the bowl, referencing the "via" (path) in the name. Used at the
top-left of the admin shell, on the login card, and as the favicon. The
wordmark "Provia" sits in Geist Sans, 600 weight, tight tracking.

---

## Components inventory

The shadcn primitives imported into the codebase, all `base-nova` style:

- **Button** (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) — sizes `xs` `sm` `default` `lg` `icon` `icon-sm` `icon-lg`
- **Badge** (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`)
- **Card** + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` / `CardAction`
- **Input**, **Textarea**, **Label**, **Checkbox**
- **Select**, **Command** (combobox), **Popover**, **DropdownMenu**
- **Dialog**, **Tabs**, **Table**, **Separator**
- **Form** (react-hook-form integration)
- **Sonner** toast wrapper

Custom application components:

- `MarkdownEditor` — CodeMirror 6 with one-dark theme
- `MarkdownPreview` — server-rendered react-markdown + remark-math + rehype-katex
- `MetadataForm` — the problem meta form (source, year, difficulty stars, topics, tags, classes)
- `ProblemForm` — composes editor + preview + metadata
- `ProblemsTable` — sortable, selectable, paginated
- `ProblemFiltersSidebar` — search + difficulty + classes + source + year + topics + tags

---

## Caveats

- **No actual logo art existed in the source repo** — only the default
  Next.js placeholder SVGs (`globe.svg`, `vercel.svg`, etc.). The "P" glyph
  and wordmark in this design system are an interpretation of the brief
  ("matnli logotip yetarli, ammo kichik simvol qo'shsa bo'ladi — masalan, P
  harfi yoki yo'l/strelka motivi"). Please review and let me know if you'd
  like a different direction.
- **Accent color was a free choice** — the spec said "ko'k yoki binafsha".
  I picked **academic indigo** (oklch 0.52 / 0.18 / 264). One toggle away
  from purple if you prefer.
- **Geist fonts** are loaded via Google Fonts (`Geist` and `Geist+Mono`).
  This matches what `next/font/google` does in the production app. No local
  font files are needed.
- The codebase's source palette is *pure neutral*; I treated this as
  intentional and kept the accent restricted to **links, brand mark, charts,
  and the focused-state ring** — never the default button (which stays
  near-black, per the live product).
