# AI Prompt — Convert source material to bulk import bundle

Use this prompt with Claude or ChatGPT to convert PDFs, web pages, or
plain text problem collections into a `problems.md` file that conforms
to `docs/format-spec.md` (v2).

## How to use

1. Look up the stable codes you'll need from the admin panel:
   - `/admin/sources` — find the source's `S######` code.
   - `/admin/age-categories` — find the right `A######` codes.
   - `/admin/topics` — find the relevant `T######` codes.
2. Copy the prompt below and paste in your AI assistant. Substitute the
   placeholder code lists in the **Available codes** section with the
   actual codes from your DB.
3. Attach the source material (PDF) or paste the source text where
   indicated.
4. After the AI produces `problems.md`, review the output:
   - Every frontmatter value is a real code (no invented codes).
   - LaTeX renders correctly.
   - Image references match what you actually have in `images/`.
   - Each problem has at most one image.
5. Place the file in a folder with an `images/` subfolder, zip it, and
   upload via `/admin/problems/new`.

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
exactly `---`.

The first `---` of the file opens the first frontmatter; each
subsequent `---` line that is not closing a frontmatter opens the next
problem's frontmatter.

**Available codes** (substitute these with real values from your DB
before running the prompt)

- Sources (`S######`):
  - `S000001` — IMO
  - `S000002` — Uzbekistan National Olympiad
  - ... (paste your full list)
- Age categories (`A######`):
  - `A000001` — 1-sinf
  - `A000010` — 10-sinf
  - `A000011` — 11-sinf
  - `A000099` — Talaba
  - ... (paste your full list)
- Topics (`T######`):
  - `T000001` — Algebra
  - `T000002` — Geometry
  - `T000003` — Number Theory
  - `T000004` — Combinatorics
  - ... (paste your full list)

**Frontmatter fields**

| Field | Type | Notes |
|---|---|---|
| `source` | `S######` | Pick the single best match from the sources list above. |
| `age_categories` | `A######[]` | One or more codes. Pick whichever grade(s) the problem targets. |
| `topics` | `T######[]` | One or more codes from the topics list. 1–3 most relevant. |

Never invent a code. If no listed code fits, write `[NEEDS REVIEW:
no matching code for "X"]` in place of the field so the user can fix
it manually.

**Body format**

- Begin with a `# Shart` heading (Uzbek for "problem statement").
- Translate problem text to Uzbek if it is in another language;
  preserve meaning faithfully. If the source is already in Uzbek,
  keep as-is.
- Math expressions use LaTeX: inline `$...$`, display `$$...$$`.
- Use only KaTeX-supported commands. No TikZ, no custom macros, no
  Asymptote.
- For a figure, write `![Description](images/PROBLEM_FILENAME.ext)`.
  **At most one image per problem.** Use a consistent naming pattern,
  e.g. `{source-name}-{year}-p{n}.png`.
- Do NOT include solutions, hints, or answers. Only the problem
  statement.

**Strict rules**

- Never invent problems. If the source is unclear, mark unclear
  sections with `[NEEDS REVIEW: ...]`.
- Do not include problem numbering as body text — there is no
  `problem_number` field anymore; the database assigns a code
  automatically.
- Do not include the source attribution as body text — the `source`
  frontmatter field carries that.
- Output ONLY the `problems.md` content. No commentary before or
  after, no outer code fences.

**Example output for two problems**

```
---
source: S000001
age_categories: [A000011]
topics: [T000003]
---

# Shart

Barcha musbat butun sonlar $n$ ni toping, shunday qilib $n+1$ son
$n^2 + 1$ ga qoldiqsiz bo'linsin.

---

source: S000001
age_categories: [A000011]
topics: [T000001, T000002]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib, $abc = 1$ shartni qanoatlantiradi.
Isbotlang:

$$\frac{1}{a} + \frac{1}{b} + \frac{1}{c} \geq a + b + c$$
```

Now process the following source material:

[paste your PDF text or web page content here]

---
