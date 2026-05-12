# AI Prompt — Convert source material to bulk import bundle

Use this prompt with Claude or ChatGPT to convert PDFs, web pages, or
plain text problem collections into a `problems.md` file that conforms
to `docs/format-spec.md` (v1).

## How to use

1. Copy the entire **The prompt** section below (everything between the
   two `---` separators, **inclusive**).
2. Paste it as your message in Claude or ChatGPT.
3. Attach the source material (PDF) or paste the source text under the
   prompt where indicated.
4. After the AI produces `problems.md`, review the output for accuracy:
   - Frontmatter fields match the source (year, problem number)
   - LaTeX renders correctly (paste a sample into `/admin/test/preview`)
   - Image references match what you actually have in `images/`
5. Place the file in a folder with an `images/` subfolder, zip it, and
   upload via `/admin/import` (Phase 8).

## Iteration tips

- For a PDF with mixed languages, ask the model to translate into Uzbek
  in the same prompt.
- For long PDFs, process by section (e.g. Day 1 first, Day 2 second) to
  keep the model's context window comfortable.

---

## The prompt

---

You are converting math olympiad problems into a strict markdown format
for bulk import into a database. Output ONLY the `problems.md` content,
with no commentary before or after.

**Output format**

A single `problems.md` file. Each problem is a markdown block with YAML
frontmatter, separated from the next problem by a line containing
exactly `---` (with blank lines around it).

The first `---` of the file opens the first frontmatter; subsequent
`---` lines that are not closing a frontmatter are problem separators.

**Frontmatter fields**

| Field | Required | Notes |
|---|---|---|
| `source` | yes | Slug of the olympiad: lowercase, hyphens. Examples: `imo`, `imo-shortlist`, `uzbekistan-national`, `tournament-of-towns`, `putnam`, `usamo`. If unsure, use a reasonable slug derived from the source name. |
| `year` | recommended | 4-digit integer, or omit if unknown. |
| `problem_number` | yes | String. Examples: `"1"`, `"P3"`, `"Day 2 / 5"`, `"A1"`. |
| `classes` | yes (>= 1) | Array of integers in [5..11]. If unsure, default to `[10, 11]` for IMO-level, `[8, 9, 10, 11]` for national-level, `[5, 6, 7]` for early-grade. |
| `topics` | yes (>= 1) | Array of slugs from this list: `algebra`, `geometry`, `number-theory`, `combinatorics`, `inequalities`, `functional-equations`. Pick 1–3 most relevant. |
| `answer` | optional | Short text answer for non-proof problems. Omit for proof-based problems. |

**Body format**

- Begin with a `# Shart` heading (Uzbek for "problem statement").
- Translate problem text to Uzbek if it is in another language; preserve
  meaning faithfully. If the source is already in Uzbek, keep as-is.
- Math expressions use LaTeX: inline `$...$`, display `$$...$$`.
- Use only KaTeX-supported commands. No `\begin{tikzpicture}`, no custom
  macros, no Asymptote.
- For figures, write `![Description](images/PROBLEM_FILENAME.ext)`. Use
  a consistent naming pattern, e.g.
  `{source-slug}-{year}-p{problem_number}.png`. The user will provide
  actual image files separately; you only write the reference.
- If the source provides a solution, include it after a `# Yechim`
  heading. Otherwise omit `# Yechim` entirely.

**Strict rules**

- Never invent problems or solutions. If the source is unclear, mark
  unclear sections with `[NEEDS REVIEW: ...]` so the user can fix them.
- Do not include problem numbering as part of the body — that goes in
  `problem_number`.
- Do not include the source attribution as part of the body — that goes
  in `source` and `year`.
- Output ONLY the `problems.md` content. No commentary before or after,
  no code fences around the whole file (use code fences only for code
  blocks within problem solutions).

**Example output for two problems**

```
---
source: imo
year: 2024
problem_number: "1"
classes: [10, 11]
topics: [number-theory]
---

# Shart

Barcha musbat butun sonlar $n$ ni toping, shunday qilib $n+1$ son
$n^2 + 1$ ga qoldiqsiz bo'linsin.

# Yechim

$n^2 + 1 = (n+1)(n-1) + 2$ ekanidan, $n+1 \mid 2$ bo'ladi.

---

source: imo
year: 2024
problem_number: "2"
classes: [10, 11]
topics: [algebra, inequalities]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib, $abc = 1$ shartni qanoatlantiradi.
Isbotlang:

$$\frac{1}{a} + \frac{1}{b} + \frac{1}{c} \geq a + b + c$$
```

Now process the following source material:

[paste your PDF text or web page content here]

---
