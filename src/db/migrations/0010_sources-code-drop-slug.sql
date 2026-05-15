-- Add `code` to sources, backfill in deterministic order, drop `slug`.
--
-- Same pattern as migration 0005 (topics-code) + 0006 (drop-topics-slug),
-- consolidated into one step since `sources` has many fewer rows and we
-- don't need the WITH RECURSIVE walk (sources are flat). Backfill order
-- is by name so codes are reproducible against the seed.
--
-- URL filters previously used UUIDs, not slugs, so dropping `slug` has
-- no UI fallout. Import internals will switch to a case-insensitive
-- name lookup (mirrors topics) in the same patch.

-- 1. Nullable column first so existing rows survive the ADD.
ALTER TABLE "sources" ADD COLUMN "code" text;

-- 2. Backfill sequential S###### codes in alphabetical name order so
--    the seeded set ("IMO", "IMO Shortlist", …) maps deterministically.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS seq
  FROM "sources"
)
UPDATE "sources" s
SET "code" = 'S' || lpad(o.seq::text, 6, '0')
FROM ordered o
WHERE s.id = o.id;

-- 3. Enforce NOT NULL + UNIQUE now that every row has a code.
ALTER TABLE "sources" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "sources" ADD CONSTRAINT "sources_code_unique" UNIQUE ("code");

CREATE INDEX "sources_code_idx" ON "sources" ("code");
CREATE INDEX "sources_name_lower_idx" ON "sources" (lower("name"));

-- 4. Drop the slug column + its index. Sources are now identified by
--    code (stable handle) or name (case-insensitive lookup at import).
DROP INDEX IF EXISTS "sources_slug_idx";
ALTER TABLE "sources" DROP COLUMN "slug";
