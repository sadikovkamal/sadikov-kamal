-- Drop the UNIQUE constraint on topics.name.
--
-- The stable identifier role is fully covered by `code` (T######) now,
-- so `name` no longer has to be unique — and we actively want it not to
-- be, so generic buckets like "Boshqa" can exist under multiple parents
-- (e.g. one under Algebra, one under Geometriya).
--
-- The lower(name) functional index stays in place — it's still useful
-- for case-insensitive lookups and doesn't depend on uniqueness.

ALTER TABLE "topics" DROP CONSTRAINT IF EXISTS "topics_name_unique";
