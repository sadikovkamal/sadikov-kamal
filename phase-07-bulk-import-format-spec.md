# Phase 7 — Bulk Import Format Spec

**Goal:** Define and document the bulk import format precisely. Write the AI
prompt template you'll use to convert PDFs and web pages into this format.
**No app code in this phase** — just specification documents that drive the
implementation in Phase 8 and your day-to-day usage afterward.

**Estimated time:** Half a session (~2 hours)

---

## What you'll have at the end

- `docs/format-spec.md` — the canonical bundle format spec
- `docs/ai-import-prompt.md` — the prompt template you give to ChatGPT/Claude
  to convert a PDF or web page into the bundle format
- `docs/examples/sample-batch.zip` — a small reference bundle (3-5 problems)
  that you can use to test Phase 8
- `docs/examples/sample-batch/` — the unzipped contents, kept in the repo
  so they're version-controlled

---

## Why a separate phase for this

The format is the **most expensive thing to change later**. Once you have
500 imported problems and 20 batches stored, changing the format means
either supporting two formats forever or migrating old data. Locking it
down before writing parser code prevents that.

The AI prompt is also reusable forever — refining it once saves time on
every future import.

---

## Steps

### 7.1. Create `docs/format-spec.md`

Create the directory and the file:

```bash
mkdir -p docs/examples
touch docs/format-spec.md docs/ai-import-prompt.md
```

Contents of `docs/format-spec.md`:

```markdown
# Bulk Import Bundle Format — v1

A bundle is a `.zip` archive containing one or more math problems and
their associated images. The bundle is the unit of upload to the
`/admin/import` page.

## Bundle structure

```
my-batch.zip
├── manifest.yaml          (optional)
├── problems.md            (or split into problems/p001.md, p002.md, ...)
└── images/
    ├── any-image-name.png
    └── another.svg
```

### Allowed roots

Exactly one of:
- A single `problems.md` containing multiple problems, separated by `\n---\n`
- A `problems/` directory containing one `.md` file per problem

### Optional files

- `manifest.yaml` — batch-level defaults applied to every problem unless
  overridden in that problem's frontmatter

### `images/` directory

- All images referenced from problem markdown must live here
- Filenames may be anything safe for filesystems and URLs
  (alphanumerics, dashes, underscores, dots)
- Maximum 5 MB per image
- Allowed types: `.png`, `.jpg/.jpeg`, `.gif`, `.webp`, `.svg`

## `manifest.yaml`

Optional. Sets defaults applied to every problem unless that problem's
frontmatter overrides the same field.

```yaml
batch_name: "IMO 2024"
defaults:
  source: imo                    # source slug
  year: 2024
  classes: [10, 11]
  difficulty: 4
```

Anything in `defaults` is treated as if it appeared in each problem's
frontmatter, with per-problem values winning.

## Problem format

Each problem is a markdown document with YAML frontmatter at the top.

```markdown
---
source: imo                       # slug, required
year: 2024                        # int, required
problem_number: "P3"              # string, required (allow "Day 2 / 3", "A1")
classes: [10, 11]                 # array of ints 5-11, required (>= 1)
topics: [algebra, inequalities]   # array of slugs, required (>= 1)
difficulty: 4                     # int 1-5, required
tags: [induction, vieta]          # array of strings, optional
answer: "x = 3"                   # string, optional
---

# Shart

The problem statement goes here. Use **markdown** and inline math like
$f(x) = x^2$ or display math like:

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

You can include images:

![Geometry diagram](images/p3-fig1.png)

# Yechim

The full solution. Same markdown + LaTeX rules apply.

By the inequality of arithmetic and geometric means...
```

### Required headings

Every problem markdown body **must** contain a `# Shart` heading. The text
**before** `# Shart` is ignored (you can put author notes there). The text
between `# Shart` and the next top-level `#` heading becomes `body_md`.

A `# Yechim` heading is **optional**. If present, the text from there to
the next top-level `#` heading (or end of document) becomes `solution_md`.

Other headings (`## Lemma 1`, `### Step 2`) are allowed inside both sections
and stay as-is in the markdown.

### Frontmatter rules

- `source` — must be a slug (lowercase, hyphens). If the slug doesn't exist
  in the `sources` table, the importer will create it (with the slug as the
  name; you can rename it later via the admin UI). To use a custom name on
  creation, also include `source_name: "Display Name"` (optional).
- `year` — integer between 1900 and 2100, or omitted
- `problem_number` — string, max 50 chars
- `classes` — array of integers, each between 5 and 11 inclusive
- `topics` — array of slugs. Same auto-create behavior as `source`. Optional
  `topic_names: { algebra: "Algebra" }` map for display names.
- `difficulty` — integer 1-5
- `tags` — array of strings (any text). Auto-created as needed.
- `answer` — short string (typically a number or formula)

### Body rules

- Markdown supports GitHub Flavored extensions (tables, task lists,
  strikethrough)
- Math: inline `$...$`, display `$$...$$`, KaTeX-supported commands
  (see https://katex.org/docs/supported)
- Images: `![alt](images/filename.ext)` — path **must** start with `images/`
- Links: `[text](url)` — full URLs only
- HTML: not allowed (sanitized out at render time)

## Validation rules

The importer rejects a bundle (or a specific problem) if:

1. ZIP cannot be opened, or has neither `problems.md` nor `problems/*.md`
2. A problem's frontmatter is missing a required field
3. A frontmatter value is the wrong type (e.g. `year: "twenty"`)
4. `difficulty` is outside 1-5
5. A `class` value is outside 5-11
6. A markdown image references a file not present in `images/`
7. A duplicate `(source, year, problem_number)` already exists in the DB
   (warning, not error — admin can choose to skip duplicates or replace)
8. The bundle exceeds 50 MB total or 200 problems

## Example: minimal problem

```markdown
---
source: imo
year: 2024
problem_number: "1"
classes: [10, 11]
topics: [algebra]
difficulty: 3
---

# Shart

Find all positive integers $n$ such that $n^2 + 1$ is divisible by $n + 1$.
```

## Example: with solution and images

```markdown
---
source: uzbekistan-national
year: 2023
problem_number: "P2"
classes: [9, 10]
topics: [geometry]
difficulty: 4
tags: [circles, tangent-lines]
---

# Shart

In triangle $ABC$, the inscribed circle touches side $BC$ at $D$.

![Triangle diagram](images/uzn-2023-p2.png)

Prove that $AD$ bisects angle $\angle BAC$ if and only if $AB = AC$.

# Yechim

**Forward direction.** Suppose $AD$ bisects $\angle BAC$. ...

**Reverse direction.** Suppose $AB = AC$. ...
```

## Versioning

This is **format v1**. If we ever break compatibility, bumping to v2 means
the importer should detect the version (we'll add a `format_version: 2`
field at the bundle root in `manifest.yaml`) and route accordingly.

For v1, bundles do **not** need to declare a version — absence of a
`format_version` is treated as v1.
```

### 7.2. Create `docs/ai-import-prompt.md`

```markdown
# AI Prompt — Convert source material to bulk import bundle

Use this prompt with Claude or ChatGPT to convert PDFs, web pages, or
plain text problem collections into a `problems.md` file ready for bulk
import.

## How to use

1. Copy everything below the `---` line.
2. Paste it as your message.
3. Attach the PDF / paste the source text below it.
4. After the AI produces `problems.md`, review the output for accuracy.
5. Place the file in a folder with an `images/` subfolder, zip it,
   upload via `/admin/import`.

## The prompt

---

You are converting math olympiad problems into a strict markdown format
for bulk import into a database.

**Output format:** A single `problems.md` file. Each problem is a markdown
block with YAML frontmatter, separated from the next problem by a line
containing exactly `---` (with blank lines around it).

**Frontmatter fields:**
- `source`: slug of the olympiad (lowercase, hyphens). Examples: `imo`,
  `imo-shortlist`, `uzbekistan-national`, `tournament-of-towns`,
  `putnam`, `usamo`. If unsure, use a reasonable slug.
- `year`: 4-digit integer, or omit if unknown
- `problem_number`: string, e.g. `"1"`, `"P3"`, `"Day 2 / 5"`. Required.
- `classes`: array of integers in [5..11] indicating school grades.
  If unsure, default to `[10, 11]` for IMO-level, `[8, 9, 10, 11]` for
  national-level.
- `topics`: array of slugs from this list:
  `algebra`, `geometry`, `number-theory`, `combinatorics`,
  `inequalities`, `functional-equations`. Pick 1-3 most relevant.
- `difficulty`: integer 1-5, where 1 is intro, 3 is national olympiad
  median, 5 is IMO P6 level.
- `tags`: array of short strings for technique or theme. Examples:
  `induction`, `pigeonhole`, `vieta`, `am-gm`, `cauchy-schwarz`,
  `chinese-remainder`, `markov`. Optional but include 0-3 when obvious.
- `answer`: short text answer if the problem asks for a specific value
  (e.g. `"x = 3"`, `"42"`). Omit for proof-based problems.

**Body format:**
- Begin with `# Shart` heading
- Translate problem text to Uzbek if it is in another language; preserve
  meaning faithfully. If the source is already in Uzbek, keep as-is.
- Math expressions use LaTeX: inline `$...$`, display `$$...$$`
- Use KaTeX-supported commands only (no \begin{tikzpicture}, no custom
  macros)
- For figures, write `![Description](images/PROBLEM_FILENAME.png)`. Use a
  consistent naming pattern like `{source}-{year}-p{number}.png`. The
  user will provide actual image files separately; you only write the
  reference.
- If the source provides a solution, include it after `# Yechim`.
  Otherwise omit the `# Yechim` heading entirely.

**Strict rules:**
- Never invent problems or solutions. If the source is unclear, mark
  unclear sections with `[NEEDS REVIEW: ...]` so the user can fix them.
- Do not include problem numbering as part of the body — that goes in
  `problem_number`.
- Do not include the source attribution as part of the body — that goes
  in `source` and `year`.
- Output **only** the `problems.md` content. No commentary before or
  after, no code fences around the whole file (use code fences only for
  code blocks within problem solutions).

**Example output for two problems:**

\`\`\`
---
source: imo
year: 2024
problem_number: "1"
classes: [10, 11]
topics: [number-theory]
difficulty: 4
---

# Shart

Barcha musbat butun sonlar $n$ ni toping...

# Yechim

Faraz qilamiz...

---

source: imo
year: 2024
problem_number: "2"
classes: [10, 11]
topics: [algebra, inequalities]
difficulty: 5
tags: [am-gm]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib...
\`\`\`

Now process the following source material:

[paste your PDF text or paste web page content here]

---
```

### 7.3. Build the sample batch

Create the following file structure under `docs/examples/sample-batch/`:

```
docs/examples/sample-batch/
├── manifest.yaml
├── problems.md
└── images/
    ├── sample-fig1.png
    └── sample-fig2.png
```

**`manifest.yaml`:**

```yaml
batch_name: "Sample batch — Phase 7 verification"
defaults:
  source: other
  classes: [10, 11]
```

**`problems.md`:**

```markdown
---
source: imo
year: 2024
problem_number: "1"
classes: [10, 11]
topics: [number-theory]
difficulty: 4
tags: [divisibility]
---

# Shart

Barcha musbat butun sonlar $n$ ni toping, shunday qilib $n+1$ son
$n^2 + 1$ ga qoldiqsiz bo'linsin.

# Yechim

$n^2 + 1 = (n+1)(n-1) + 2$ ekanidan, $n+1 \mid 2$ bo'ladi. Demak
$n+1 \in \{1, 2\}$, ya'ni $n = 1$.

---

source: uzbekistan-national
year: 2023
problem_number: "P2"
classes: [9, 10]
topics: [algebra, inequalities]
difficulty: 3
tags: [am-gm]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib, $abc = 1$. Isbotlang:

$$a + b + c \geq 3$$

![Diagram](images/sample-fig1.png)

# Yechim

AM-GM tengsizligiga ko'ra:

$$a + b + c \geq 3\sqrt[3]{abc} = 3\sqrt[3]{1} = 3$$

---

source: imo-shortlist
year: 2022
problem_number: "C2"
classes: [10, 11]
topics: [combinatorics]
difficulty: 5
---

# Shart

$n \times n$ doskaning har bir katagiga $0$ yoki $1$ yoziladi. Doska
"yaxshi" deyiladi, agar har bir satr va har bir ustundagi sonlarning
yig'indisi juft son bo'lsa. Yaxshi doskalar sonini toping.

![Sample board](images/sample-fig2.png)
```

For the placeholder images, use any small PNG (a few KB each). You can
generate them with any tool or grab from https://placehold.co.

### 7.4. Zip the sample batch

```bash
cd docs/examples
zip -r sample-batch.zip sample-batch/
```

This `sample-batch.zip` will be your test fixture in Phase 8.

### 7.5. Add a README to the examples folder

`docs/examples/README.md`:

```markdown
# Examples

This folder contains reference bundles used to test the bulk importer.

- `sample-batch/` — unzipped contents, version controlled
- `sample-batch.zip` — packaged for upload (regenerate with
  `cd docs/examples && zip -r sample-batch.zip sample-batch/`)

To test:
1. Log in to `/admin`
2. Go to `/admin/import`
3. Upload `sample-batch.zip`
4. You should see 3 problems in the preview, all valid
```

### 7.6. Commit format docs

```bash
git add docs/
git commit -m "Phase 7: bulk import format spec, AI prompt, sample bundle"
```

---

## File structure changes

```
docs/
├── format-spec.md                          (new)
├── ai-import-prompt.md                     (new)
└── examples/
    ├── README.md                           (new)
    ├── sample-batch.zip                    (new)
    └── sample-batch/
        ├── manifest.yaml                   (new)
        ├── problems.md                     (new)
        └── images/
            ├── sample-fig1.png             (new)
            └── sample-fig2.png             (new)
```

(No app source code changes in this phase.)

---

## Acceptance criteria

- [ ] `docs/format-spec.md` covers every field, every validation rule
- [ ] `docs/ai-import-prompt.md` is a self-contained prompt that produces
      valid output when tested manually with Claude or ChatGPT
- [ ] `docs/examples/sample-batch/` exists with 3 problems, manifest, 2 images
- [ ] `docs/examples/sample-batch.zip` is the zipped bundle
- [ ] You have manually tested the AI prompt: paste a PDF page or text into
      a Claude/ChatGPT chat with the prompt, get back valid `problems.md`
- [ ] All docs are committed to git

---

## Notes for Phase 8

The parser implementation in Phase 8 will:

1. Treat the format spec as the **source of truth** for validation rules
2. Use Zod schemas that exactly mirror the frontmatter fields
3. Handle both `problems.md` and `problems/*.md` layouts
4. Process `manifest.yaml` defaults before per-problem frontmatter
5. Validate every image reference against the ZIP contents

Keep this spec doc in sync if the implementation reveals gaps. Bump the
version (v2) only if you make breaking changes; additive changes can stay v1.

---

## What's next

→ [Phase 8 — Bulk Import Implementation](./phase-08-bulk-import-implementation.md)
