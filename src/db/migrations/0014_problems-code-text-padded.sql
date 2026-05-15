-- Convert problems.code from integer IDENTITY to text P####### format,
-- aligning with the rest of the taxonomy (topics T######, sources S######,
-- age_categories A######). Problems use 7 digits instead of 6 because
-- they can grow much larger than the admin-managed taxonomies.
--
-- Going text loses Postgres-native atomic increment, but the codebase
-- already uses the read-max + format-next pattern for topics/sources,
-- so problem creation falls back to UNIQUE-constraint-driven retries
-- on the rare race. For a low-volume admin app this is acceptable.

-- 1. Drop IDENTITY (releases the underlying sequence).
ALTER TABLE "problems" ALTER COLUMN "code" DROP IDENTITY IF EXISTS;

-- 2. Drop the unique constraint and index — the column type change
-- below needs them gone first.
ALTER TABLE "problems" DROP CONSTRAINT IF EXISTS "problems_code_unique";
DROP INDEX IF EXISTS "problems_code_idx";

-- 3. Convert column type, formatting existing integer values into
-- zero-padded P####### text. lpad ensures a 7-digit numeric tail.
ALTER TABLE "problems"
  ALTER COLUMN "code" TYPE text
  USING 'P' || lpad("code"::text, 7, '0');

-- 4. Re-add the unique constraint + index on the new text column.
ALTER TABLE "problems"
  ADD CONSTRAINT "problems_code_unique" UNIQUE ("code");
CREATE INDEX "problems_code_idx" ON "problems" ("code");
