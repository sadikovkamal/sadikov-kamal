-- Drop import_batches feature.
--
-- The "Bulk import" page used to keep a row per upload in `import_batches`
-- and let admins revisit each batch's success/error breakdown via
-- /admin/import/{batchId}. That page was removed: bulk import now lives
-- inline on /admin/problems/new and history is no longer surfaced
-- anywhere in the UI.
--
-- Migration order:
--   1. Drop the FK column from `problems` (must come before the table
--      drop since the FK constraint blocks it).
--   2. Drop the `import_batches` table.
--   3. Drop the `import_status` enum (no other table uses it).

ALTER TABLE "problems" DROP COLUMN IF EXISTS "import_batch_id";

DROP TABLE IF EXISTS "import_batches";

DROP TYPE IF EXISTS "import_status";
