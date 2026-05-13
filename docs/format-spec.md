# Bulk Import Bundle Format — v1

A bundle is a `.zip` archive containing one or more math problems and
their associated images. The bundle is the unit of upload to the
`/admin/import` page (Phase 8).

This document is the **source of truth** for the format. The Zod schemas
in the importer code mirror it field-for-field; if you change one, change
the other.

---

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

A bundle MUST contain exactly one of:

- A single `problems.md` file at the bundle root, holding multiple
  problems separated by `\n---\n` lines (with surrounding blank lines).
- A `problems/` directory containing one `.md` file per problem. The
  directory may have any number of files; each is treated as one problem.

If both are present, the bundle is rejected.

### Optional files

- `manifest.yaml` — batch-level defaults applied to every problem unless
  overridden in that problem's frontmatter (see below).
- Anything else at the root or under `images/` is ignored, except for a
  size cap on the whole zip.

### `images/` directory

- All images referenced from problem markdown MUST live here.
- Filenames may contain alphanumerics, dashes, underscores, dots. No
  slashes, no spaces, no Unicode-only filenames (the importer treats
  them as strings, not as locale-aware paths).
- Maximum **5 MB per image**.
- Allowed mime types: `image/png`, `image/jpeg`, `image/gif`,
  `image/webp`, `image/svg+xml` — same whitelist as the single-upload
  flow (Phase 4).

### Bundle-wide caps

- Total uncompressed size: **50 MB**.
- Number of problems: **200 per bundle**.

These caps exist so a single accidental upload doesn't pin the server.
If you have more problems, split them into multiple bundles.

---

## `manifest.yaml`

Optional. Sets defaults applied to every problem unless that problem's
frontmatter overrides the same field.

```yaml
batch_name: "IMO 2024"            # human-readable label, optional
defaults:
  source: imo                     # source slug
  year: 2024
  classes: [10]
```

### Fields

- `batch_name` — string, optional. Stored in the `import_batches.filename`
  display label only. Does not affect parsing.
- `defaults` — map. Any frontmatter field name is allowed here. Values
  are merged into each problem's frontmatter using "per-problem wins"
  semantics: if a problem has the field, manifest is ignored for that
  problem; otherwise the manifest value is applied.

If the manifest is malformed YAML, the entire bundle is rejected before
any problem is processed.

---

## Problem format

Each problem is a markdown document with YAML frontmatter at the top.

```markdown
---
source: imo                       # slug, required
year: 2024                        # int, required (or via manifest)
problem_number: "P3"              # string, required
classes: [10]                 # array, >= 1, required
topics: [algebra, inequalities]   # array, >= 1, required
answer: "x = 3"                   # string, optional
---

# Shart

The problem statement goes here. Use **markdown** and inline math like
$f(x) = x^2$ or display math like:

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

You can include images:

![Geometry diagram](images/p3-fig1.png)
```

(Any `# Yechim` heading and content after it would be dropped on import —
add the solution in the admin UI later.)

### Required headings

Every problem markdown body MUST contain a `# Shart` heading.

- Text **before** `# Shart` is ignored. Use this region for author notes
  or import-time scratch text.
- Text from `# Shart` to the end of the document (or to a `# Yechim`
  heading, see below) becomes `body_md`.

**Solutions are not imported.** If the source includes a `# Yechim`
(or `# Solution`) heading, everything from that heading onward is
**dropped** — it's not stored in the database. Admins write or paste
the solution in the admin UI after the import. The intent is to keep
bulk imports focused on the statement; solutions are too sensitive to
LaTeX/formatting issues to be inserted automatically.

Other headings (`## Lemma 1`, `### Step 2`) inside the body are allowed
and stay as-is in the markdown.

### Frontmatter rules

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string (slug) | yes | Auto-created if missing in `sources` table. Display name is derived from the slug (`"imo-shortlist"` → `"Imo Shortlist"`); rename in `/admin/sources` after import. |
| `year` | int 1900..2100 | recommended | May be omitted; stored as null. |
| `problem_number` | string, max 50 chars | yes | "1", "P3", "Day 2 / 5", "A1" — anything goes. |
| `classes` | int[] from {5..11} | yes (exactly 1) | School grade. Pass a single-element array, e.g. `[10]`. The DB junction supports many-to-many, but the admin UI is single-select and the importer enforces the same. |
| `topics` | string[] (slugs) | yes (>= 1) | Auto-created if missing in `topics` table. Same naming behavior as `source`. |
| `answer` | string | no | Short answer for non-proof problems. |

### Body rules

- Markdown supports GitHub-flavored extensions: tables, task lists,
  strikethrough.
- Math: inline `$...$`, display `$$...$$`. Only KaTeX-supported commands
  (https://katex.org/docs/supported). No TikZ, no custom macros.
- Images: `![alt](images/filename.ext)`. Path **must** start with
  `images/`. Absolute URLs and `../` paths are rejected.
- Links: `[text](https://...)`. Full URLs only; relative links other
  than `images/...` are rejected.
- Inline HTML is stripped at render time (see Phase 3 sanitizer). Don't
  bother including it.

---

## Multi-problem `problems.md`

When you choose the single-file layout, separate problems with a line
that contains exactly `---`, surrounded by blank lines:

```markdown
---
source: imo
year: 2024
problem_number: "1"
classes: [10]
topics: [number-theory]
---

# Shart

...

---

source: imo
year: 2024
problem_number: "2"
classes: [10]
topics: [algebra]
---

# Shart

...
```

The first `---` of the file opens the first frontmatter; subsequent
`---` lines that are not adjacent to a frontmatter close are problem
separators.

---

## Validation rules

The importer rejects a bundle, or marks specific problems as failed,
when any of the following holds:

1. ZIP cannot be opened, or has neither `problems.md` nor any
   `problems/*.md` files.
2. Both `problems.md` and `problems/` exist (ambiguous layout).
3. `manifest.yaml` is present but malformed.
4. A problem's frontmatter is missing a required field.
5. A frontmatter value is the wrong type (e.g. `year: "twenty"`).
6. `classes` is missing, empty, contains more than one value, or has a value outside 5..11.
7. A markdown image references a file not present under `images/`.
8. A markdown image path doesn't start with `images/`, or escapes the
   bundle root via `..`.
9. The bundle exceeds 50 MB total uncompressed, or 200 problems.
10. An image exceeds 5 MB or has a non-allowed mime type.

A duplicate `(source, year, problem_number)` already in the database
is **not** an error — it is surfaced as a warning so the admin can
choose to skip the duplicate or replace it. (See Phase 8 for the
preview UX.)

---

## Examples

### Minimal problem

```markdown
---
source: imo
year: 2024
problem_number: "1"
classes: [10]
topics: [algebra]
---

# Shart

Find all positive integers $n$ such that $n^2 + 1$ is divisible by
$n + 1$.
```

### With image and short answer

```markdown
---
source: uzbekistan-national
year: 2023
problem_number: "P2"
classes: [9]
topics: [geometry]
answer: "AB = AC"
---

# Shart

In triangle $ABC$, the inscribed circle touches side $BC$ at $D$.

![Triangle diagram](images/uzn-2023-p2.png)

Prove that $AD$ bisects angle $\angle BAC$ if and only if $AB = AC$.
```

---

## Versioning

This is **format v1**. If we ever break compatibility, bumping to v2
means the importer should detect the version (we'll add a
`format_version: 2` field at the bundle root in `manifest.yaml`) and
route accordingly.

For v1, bundles do **not** need to declare a version — the absence of
a `format_version` field is treated as v1.

Additive changes (new optional frontmatter fields, new image types) can
stay v1.

---

## See also

- `docs/ai-import-prompt.md` — prompt template that produces v1-conforming
  `problems.md` from a PDF or web page.
- `docs/examples/sample-batch/` — reference bundle used by the Phase 8
  importer test suite.
- `phase-08-bulk-import-implementation.md` — the implementation plan that
  consumes this spec.
