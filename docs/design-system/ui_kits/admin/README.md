# Provia admin UI kit

Five interactive admin screens, all sharing `../_shared.css`. Top nav links across them so you can click through the flow:

| File | Screen | URL it mirrors |
|---|---|---|
| `dashboard.html` | Dashboard with stat cards, topic / difficulty charts, recent imports | `/admin` |
| `problems.html` | Problems list with full filter sidebar, sortable table, pagination | `/admin/problems` |
| `problem-view.html` | Single problem (read mode) — body + side meta, expandable solution | `/admin/problems/[id]` |
| `problem-edit.html` | Two-pane CodeMirror + live KaTeX preview, meta strip on top, image drop zone | `/admin/problems/new` |
| `import.html` | Bulk ZIP import in step 2 (Validate) with summary tiles + error/warning rows + prior imports table | `/admin/import` |

Conventions used across the kit:
- Top bar is `max-w 1152px` (1280 on edit/problems for table breathing room), padded `14px 24px`, sticky.
- Active nav item uses the underline pattern from base-nova.
- All buttons are the variants defined in `_shared.css` (`btn-default`, `btn-outline`, `btn-secondary`, `btn-ghost`, `btn-destructive`).
- Tables use `oklch(0.985 0 0)` header background, hairline rows, monospace columns for IDs / dates / counts.
- Difficulty stars are filled in primary (oklch 0.205) on top of an oklch 0.88 ghost row — no green→red ramp, neutral per the design tone.
- Math is rendered with KaTeX font fallback via `KaTeX_Main, Cambria, serif` italic — real KaTeX loads if `katex.min.css` is present.
