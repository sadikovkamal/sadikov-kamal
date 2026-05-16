# Topics XLSX import — design

**Date:** 2026-05-16
**Scope:** Admin can bulk-add topics under existing parents (or as new roots) by uploading an `.xlsx` file from the `/admin/topics` page.

## Goal

Today an admin creates topics one at a time through the "Yangi mavzu" dialog. Seeding a real curriculum that way is slow. This adds an XLSX upload path: pick a file → see what will be created and what's wrong → confirm → done. The flow mirrors the existing problem ZIP import (`/admin/problems/new`).

## Non-goals

- Editing or deleting existing topics via XLSX. Import is **insert-only**.
- Multi-level new subtree in a single file. Every row's `parent_id` is either `0` (root) or an existing DB topic code. Multi-level new trees = multiple imports.
- Bulk import of sources, age categories, or problems. Only topics.

## XLSX schema

First sheet only. Header row required; column order doesn't matter (lookup by name, case-insensitive).

| Column        | Type | Rule                                                         |
| ------------- | ---- | ------------------------------------------------------------ |
| `name`        | text | 1–100 chars, non-empty after trim                            |
| `parent_id`   | text | `0` or empty cell = root; otherwise an existing `T######` code |
| `description` | text | Optional, ≤1000 chars                                        |

Example:

| name                  | parent_id | description           |
| --------------------- | --------- | --------------------- |
| Kvadrat tenglama      | T000001   |                       |
| Ayniyatlar            | T000001   | Algebraik ayniyatlar  |
| Geometriya            | 0         |                       |

### Validation rules

Bundle-level (any one of these fails the whole file, no row-level report):

- File can be parsed as XLSX
- File is non-empty (≥ 1 data row)
- Header row contains `name`, `parent_id`, `description` (case-insensitive)
- Data row count ≤ 500

Row-level (each row checked independently; any error excludes the row):

| Check                                                       | Message (uz)                          |
| ----------------------------------------------------------- | ------------------------------------- |
| `name` empty / whitespace only                              | "Nomi bo'sh"                          |
| `name.length > 100`                                         | "Nomi 100 belgidan oshmasligi kerak"  |
| `parent_id` format ≠ `0`, empty, or `T######`               | "parent_id formati noto'g'ri"         |
| `parent_id = T######` not present in DB                     | "Bunday parent topilmadi: T000999"    |
| `description.length > 1000`                                 | "Ta'rif 1000 belgidan oshmasligi kerak" |
| `(name, parent_id)` duplicated within the file              | "Fayl ichida dublikat"                |
| `(name, parent_id)` already exists in DB                    | "Bazada allaqachon bor"               |

**Hard stop:** if there are any bundle errors or any row-level errors, `executeTopicsImportAction` refuses to write anything. Admin fixes the file and re-uploads. This matches the existing problem-import behavior.

## UI

Lives entirely on `/admin/topics` — no new page.

**Trigger:** new "XLSX import" button next to "Yangi mavzu" in [topics-tree.tsx](src/app/admin/topics/topics-tree.tsx).

**Modal (3 stages):**

1. **File pick.** Drag-drop or click to choose `.xlsx`. Below the picker: link "Namuna yuklab olish" → `/admin/topics/import-template` route handler. Short format hint. `[Tekshirish]` button.
2. **Validation result.** Summary chips (Jami / To'g'ri / Xato). If bundle errors → red panel listing them, only `[Yopish]`. Otherwise: row-level errors listed with Excel cell reference (e.g. `A5`), topic name, and reasons. If `errorCount === 0` → green header "Tayyor" + `[Importni boshlash]` → confirm dialog → execute.
3. **Result.** "N ta mavzu qo'shildi" + chips for each new `T######`. `[Yana yuklash]` resets the modal; `[Yopish]` closes and revalidates the page.

UX mirrors [import-uploader.tsx](src/app/admin/problems/new/import-uploader.tsx) — same dialog skeleton, same chip styling, same hard-stop policy.

## Architecture

### Files (new)

| File                                                        | Purpose                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/taxonomy/topics-xlsx.ts`                           | Pure server-only `parseTopicsXlsx` + `validateTopicsBundle`. Testable.  |
| `src/app/admin/topics/_import-actions.ts`                   | `previewTopicsImportAction` + `executeTopicsImportAction` server actions. |
| `src/app/admin/topics/topic-import-dialog.tsx`              | Client component, 3-stage modal.                                        |
| `src/app/admin/topics/import-template/route.ts`             | GET route, on-the-fly XLSX template generation.                         |

### Files (modified)

| File                                                        | Change                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/app/admin/topics/topics-tree.tsx`                      | Add "XLSX import" button + open-state for the import dialog.          |
| `src/lib/taxonomy/mutations.ts`                             | Add `bulkCreateTopics(inputs)` — transactional, sequential codes.     |
| `package.json`                                              | Add `exceljs` dependency.                                             |

### Module shapes

```ts
// src/lib/taxonomy/topics-xlsx.ts

export interface ParsedRow {
  excelRow: number;            // 2, 3, 4… (1 = header)
  name: string;
  parentCode: string | null;   // null = root, else "T######"
  description: string | null;
}

export interface ParsedBundle {
  rows: ParsedRow[];
  bundleErrors: string[];
}

export async function parseTopicsXlsx(bytes: Uint8Array): Promise<ParsedBundle>;

export interface ValidatedRow {
  excelRow: number;
  name: string;
  parentCode: string | null;
  parentId: string | null;     // resolved DB UUID (null when parentCode is null)
  description: string | null;
  status: "ok" | "error";
  errors: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  rows: ValidatedRow[];
  okCount: number;
  errorCount: number;
}

export async function validateTopicsBundle(
  parsed: ParsedBundle,
): Promise<ValidationReport>;
```

```ts
// src/lib/taxonomy/mutations.ts (addition)

export interface BulkTopicInput {
  name: string;
  parentId: string | null;
  description: string | null;
}

export async function bulkCreateTopics(
  inputs: BulkTopicInput[],
): Promise<{ createdCodes: string[] }>;
```

```ts
// src/app/admin/topics/_import-actions.ts

export interface PreviewSuccess {
  success: true;
  filename: string;
  size: number;
  validation: ValidationReport;
  parsedSummary: { rowCount: number };
}
export type PreviewResult = PreviewSuccess | { error: string };

export interface ExecuteSuccess {
  success: true;
  successCount: number;
  createdCodes: string[];
}
export type ExecuteResult = ExecuteSuccess | { error: string };

export async function previewTopicsImportAction(formData: FormData): Promise<PreviewResult>;
export async function executeTopicsImportAction(formData: FormData): Promise<ExecuteResult>;
```

### Validation: DB round-trips

To stay O(1) regardless of file size, `validateTopicsBundle` issues **one** read per concern:

1. Collect all referenced `parent_id` codes from `rows` (deduplicated). `SELECT id, code FROM topics WHERE code = ANY($1)`. Returns the resolution map; codes not in the result set are flagged as "parent not found".
2. Build the set of `(name_lower, parent_id)` pairs that would be inserted (resolved UUIDs). `SELECT lower(name), parent_id FROM topics WHERE (lower(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000')) IN (...)`. Any hit → "bazada allaqachon bor" on the matching row.

In-file duplicates are caught with a `Map<key, excelRow[]>` before either DB call.

### Bulk insert

`bulkCreateTopics` runs in a single transaction:

1. `SELECT max(code) FROM topics` once.
2. Use `nextTopicCode` ([src/lib/taxonomy/topic-codes.ts:40](src/lib/taxonomy/topic-codes.ts:40)) to mint sequential codes for the batch in memory.
3. One `INSERT INTO topics (code, name, parent_id, description) VALUES (…), (…) RETURNING code`.
4. On UNIQUE violation (parallel import racing) → transaction rolls back; action returns the friendly error and the admin retries. We do not pre-lock the table.

### Template route

`GET /admin/topics/import-template`:

- `requireAdmin()` gate.
- Builds the workbook with `exceljs`, two example rows (`Geometriya` / `0` and `Misol mavzu` / `T000001`), serves as `attachment; filename="mavzular-namuna.xlsx"`.
- Generated on every request — the schema and the template stay in sync.

## Dependency

Add `exceljs` (MIT). Used server-side only: parsing in the action, template generation in the route. Not imported from any client component, so it never enters the client bundle.

`xlsx` (SheetJS) considered and skipped — npm publication has historically been off-cycle and types ship separately. `exceljs` is a single package with first-class TypeScript types.

## Error handling

| Failure                                  | Behavior                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| Parse fails (corrupt file)               | `bundleErrors: ["XLSX fayl o'qib bo'lmadi"]`, `rows: []` |
| Any bundle error                         | Modal shows red panel; only `[Yopish]`                |
| Any row error                            | Modal lists rows + reasons; no `[Importni boshlash]`  |
| Validation passes, execute starts        | `executeTopicsImportAction` re-validates from scratch (never trusts the client-sent preview) |
| Race condition on UNIQUE code            | Transaction rolls back; surface "Saqlash muvaffaqiyatsiz tugadi" |
| `revalidatePath` after success           | `/admin/topics` and `/admin` invalidated; modal shows new codes |

## Open questions

None at design time. Listed for context if implementation surfaces something:

- If admins regularly want multi-level new-tree imports, extend `parent_id` to accept `#N` (in-file row reference) without breaking the existing `0` / `T######` format.
- If 500 rows turns out too low or too high in practice, the cap lives in one place (`parseTopicsXlsx`).
