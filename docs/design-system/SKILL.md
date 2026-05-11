---
name: provia-design
description: Use this skill to generate well-branded interfaces and assets for Provia — a Uzbek math-olympiad problem database. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping admin tools and the public site. The aesthetic is academic, minimal, neutral-grayscale with an indigo accent, in Uzbek (Latin script), with first-class KaTeX math typography.
user-invocable: true
---

# Provia design skill

Read `README.md` at the root of this skill first — it has the full content + visual + iconography foundations, plus a manifest of everything else available.

## Key files

- `README.md` — brand context, content rules, visual foundations, iconography
- `colors_and_type.css` — base + semantic CSS tokens (light & dark), font imports
- `fonts/` — Geist Sans + Geist Mono (woff2) plus KaTeX math fonts
- `assets/` — logos (`logo-mark.svg`, `logo-wordmark.svg`), favicon, OG image
- `preview/` — 25 small spec cards for colors, type, spacing, components, brand
- `ui_kits/_shared.css` — production-grade primitives: `.btn`, `.badge`, `.input`, `.card`, `.chip`, `.cb`, `.kbd`, `.mono`
- `ui_kits/public/` — landing + login screens
- `ui_kits/admin/` — dashboard, problems list, problem view, problem editor, bulk import

## When you're invoked

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out of `assets/`, link to `colors_and_type.css` and `ui_kits/_shared.css`, and build static HTML. The look should feel like a serious academic tool, not a marketing page.

If working on production code, lift exact OKLCH values from `colors_and_type.css`, follow the component conventions captured in `ui_kits/_shared.css`, and write Uzbek copy that matches the tone in README's **Content fundamentals** section.

If the user invokes this skill without further guidance, ask them what they want to build (admin screen? landing variant? slide deck? brand asset?), ask 3–5 clarifying questions, then act as an expert Provia designer who outputs HTML artifacts or production-ready code.

## Non-negotiables

- Interface language is **Uzbek (Latin script)** — `o'qituvchi`, not `o'qituvchi` is wrong but `oqituvchi` is also wrong; use the apostrophe (`'`).
- Neutral grayscale + **one** accent (indigo `oklch(0.520 0.180 264)`); resist colourful chart palettes.
- KaTeX for math, never images of formulas.
- Avoid emoji and decorative gradients. Border-radius is 10px on cards, 8px on inputs, 6px on chips.
- Components live in `ui_kits/_shared.css` — reach for them before hand-rolling new primitives.
