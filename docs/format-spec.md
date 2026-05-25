# Bulk Import Bundle Format — v2

A bundle is a `.zip` archive containing one or more math problems and
their associated images. The bundle is the unit of upload to the
`/admin/problems/new` page.

This document is the **source of truth** for the format. The Zod schemas
in the importer code mirror it field-for-field; if you change one, change
the other.

---

## Bundle structure

```
my-batch.zip
├── problems.md            (or split into problems/p001.md, p002.md, ...)
└── images/
    ├── any-image-name.png
    └── another.svg
```

### Allowed roots

A bundle MUST contain exactly one of:

- A single `problems.md` file at the bundle root, holding multiple
  problems separated by `\n---\n` lines.
- A `problems/` directory containing one `.md` file per problem.

If both are present, the bundle is rejected.

### `images/` directory

- All images referenced from problem markdown MUST live here.
- Filenames may contain alphanumerics, dashes, underscores, dots. No
  slashes, no spaces.
- No per-image cap — individual images are bounded only by the
  bundle-wide 50 MB limit.
- Allowed mime types: `image/png`, `image/jpeg`, `image/gif`,
  `image/webp`, `image/svg+xml`.
- **At most one image per problem.** Multiple `![](...)` references in
  the same problem markdown are rejected.

### Bundle-wide caps

- Total size: **50 MB**.
- Number of problems: **500 per bundle**.

---

## Problem format

Each problem is a markdown document with YAML frontmatter at the top.
Every value in the frontmatter is a **stable code** that already exists
in the database — the importer never auto-creates taxonomy rows.

```markdown
---
source: S000001
age_categories: [A000010, A000011]
topics: [T000042, T000043]
---

# Shart

The problem statement goes here. Use **markdown** and inline math like
$f(x) = x^2$ or display math like:

$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$

You can include one image:

![Geometry diagram](images/p3-fig1.png)
```

### Frontmatter rules

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | `S######` | yes | Single code. Must exist in `/admin/sources`. |
| `age_categories` | `A######[]` | yes (≥ 1) | One or more codes. Each must exist in `/admin/age-categories`. |
| `topics` | `T######[]` | yes (≥ 1) | One or more codes. Each must exist in `/admin/topics`. |

If any code doesn't exist in the database, **the entire import is
rejected** — fix the code (or add the missing taxonomy row in the
relevant admin section) and re-upload.

### Body rules

- Every problem MUST start its body with a `# Shart` heading. Text
  above it is ignored. Everything from `# Shart` to the end of the
  document becomes `body_md`.
- Markdown supports GitHub-flavored extensions: tables, task lists,
  strikethrough.
- Math: inline `$...$`, display `$$...$$`. KaTeX-supported commands
  only (https://katex.org/docs/supported).
- Images: `![alt](images/filename.ext)`. Path must start with `images/`.
- Solutions are NOT imported. The previous `# Yechim` convention was
  removed in v2 — admins add solutions in the UI after import (or in a
  future solution-specific flow).

---

## Multi-problem `problems.md`

When you choose the single-file layout, separate problems with a line
that contains exactly `---`:

```markdown
---
source: S000001
age_categories: [A000011]
topics: [T000001]
---

# Shart
...

---
source: S000001
age_categories: [A000010]
topics: [T000002]
---

# Shart
...
```

The first `---` opens the first frontmatter; each subsequent `---` line
that is NOT closing the current frontmatter opens the next problem's
frontmatter.

---

## Validation rules

The importer rejects the bundle, or marks specific problems as failed,
when any of the following holds:

1. ZIP cannot be opened, or has neither `problems.md` nor any
   `problems/*.md` files.
2. Both `problems.md` and `problems/` exist (ambiguous layout).
3. A problem's frontmatter is missing a required field or has a wrong
   shape (e.g. `source: [S000001]` instead of `source: S000001`).
4. A code doesn't match its expected pattern (`S######`, `A######`,
   `T######`).
5. A code is well-shaped but not present in the database.
6. A problem body is empty (`# Shart` missing).
7. A problem references more than one image.
8. A markdown image references a file not present under `images/`.
9. The bundle exceeds 50 MB total, or 500 problems.
10. An image has a non-allowed mime type.

**There is no dedupe check.** Re-uploading the same problem creates a
new row with a fresh `P#######` code. Admins are responsible for
spotting duplicates.

---

## What you get back

For every successful import the server returns the auto-assigned
`P#######` codes of the new problems. The UI shows them in a success
modal — write them down or click through to the problems list.

---

## Versioning

This is **format v2**. v1 (slug-based identifiers, optional
`manifest.yaml`, multi-image bodies, `year` / `problem_number` /
`answer` frontmatter fields, auto-creation of sources and topics) is
no longer supported.

---

## See also

- `docs/examples/sample-batch/` — reference bundle. Replace its
  placeholder codes (`S000001` etc.) with real values from your DB
  before uploading.
- `docs/ai-import-prompt.md` — prompt template that produces a
  v2-conforming `problems.md` from a PDF or web page.
