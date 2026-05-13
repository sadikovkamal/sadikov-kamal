-- Add stable human-readable code to topics.
--
-- Format: `T######` (six zero-padded digits). Admin-facing identifier
-- referenced in conversations and admin URLs (/admin/topics/T000042).
-- UUID stays as the internal PK; this column is parallel, never reused.
--
-- Migration is two-stage so existing rows pass the NOT NULL + UNIQUE
-- constraints:
--   1. ADD COLUMN nullable + backfill in tree-friendly order.
--   2. SET NOT NULL and add the UNIQUE index.

-- 1. Add the column nullable
ALTER TABLE "topics" ADD COLUMN "code" text;

-- 2. Backfill. Walk roots first, then deeper levels, ordered by created
-- timestamp would be ideal but we don't have one — fall back to name.
-- The sequence number runs across the whole table, depth-first by parent.
WITH RECURSIVE tree AS (
  -- Roots: order by name
  SELECT
    id,
    name,
    parent_id,
    1 AS depth,
    LPAD(name, 256, ' ') AS sort_key
  FROM "topics"
  WHERE parent_id IS NULL

  UNION ALL

  -- Children: append to parent's sort key so depth-first order is preserved
  SELECT
    t.id,
    t.name,
    t.parent_id,
    tree.depth + 1,
    tree.sort_key || '|' || LPAD(t.name, 256, ' ')
  FROM "topics" t
  INNER JOIN tree ON tree.id = t.parent_id
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_key) AS rn FROM tree
)
UPDATE "topics" t
SET code = 'T' || LPAD(ranked.rn::text, 6, '0')
FROM ranked
WHERE t.id = ranked.id;

-- 3. Lock it down
ALTER TABLE "topics" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "topics" ADD CONSTRAINT "topics_code_unique" UNIQUE ("code");
CREATE INDEX "topics_code_idx" ON "topics" USING btree ("code");
