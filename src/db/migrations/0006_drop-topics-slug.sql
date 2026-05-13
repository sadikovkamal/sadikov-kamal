-- Drop the slug column from topics. The original purpose of slug
-- (portable identifier for URLs + import bundles) is now served by
-- `name` directly with case-insensitive matching, and the `code`
-- column already covers the "stable admin-facing identifier" role.
--
-- Order:
--   1. Drop the unique constraint on slug + its index.
--   2. Drop the slug column.
--   3. Make `name` unique and add a lower(name) index so import lookup
--      and the new UNIQUE constraint stay cheap.

ALTER TABLE "topics" DROP CONSTRAINT IF EXISTS "topics_slug_unique";
DROP INDEX IF EXISTS "topics_slug_idx";

ALTER TABLE "topics" DROP COLUMN IF EXISTS "slug";

-- name is the new portable identifier. We don't expect duplicate names
-- in practice — backfill should already be clean from the seed.
ALTER TABLE "topics" ADD CONSTRAINT "topics_name_unique" UNIQUE ("name");

CREATE INDEX IF NOT EXISTS "topics_name_lower_idx"
  ON "topics" USING btree (lower("name"));
