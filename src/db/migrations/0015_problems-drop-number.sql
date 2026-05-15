-- Drop problem_number from problems.
--
-- With auto-assigned `code` (P#######) the system already gives every
-- problem a unique, stable, human-readable identifier. The free-form
-- `problem_number` field ("Day 2 / 3", "P6") was kept as a way to
-- record external olympiad numbering, but it forced admins to type
-- something for every entry and duplicated the role of `code`.
--
-- Going forward, nested sources carry the contextual numbering
-- ("IMO 2024" → "IMO 2024 P6" as a child source) when admins want
-- that grouping, and `code` serves as the system-wide identifier.

-- 1. Drop the partial unique index that depended on problem_number.
DROP INDEX IF EXISTS "problems_source_number_unique";

-- 2. Drop the column itself.
ALTER TABLE "problems" DROP COLUMN IF EXISTS "problem_number";
