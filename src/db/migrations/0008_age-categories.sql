-- Replace the integer-range `problem_classes` table with a proper
-- taxonomy: `age_categories` (admin-editable) + `problem_age_categories`
-- junction. The old CHECK-constrained 5..11 column couldn't represent
-- non-grade buckets like "Talaba" or "Professional" without an enum
-- migration each time.
--
-- Dev DB is clean per the team — we drop existing class data rather
-- than back-mapping integers to UUIDs. Seed below inserts the standard
-- ladder (1-sinf … 11-sinf + Talaba) so the UI is functional after
-- migrate.

-- 1. Drop the old junction (and its CHECK constraint by extension).
DROP TABLE IF EXISTS "problem_classes";

-- 2. Create the new taxonomy table.
CREATE TABLE "age_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "description" text
);
CREATE INDEX "age_categories_code_idx" ON "age_categories" ("code");
CREATE INDEX "age_categories_sort_order_idx" ON "age_categories" ("sort_order");

-- 3. Create the new junction. ON DELETE RESTRICT on age_category_id
--    matches the topics convention: deleting a bucket that's still in
--    use should fail loudly.
CREATE TABLE "problem_age_categories" (
  "problem_id" uuid NOT NULL REFERENCES "problems"("id") ON DELETE CASCADE,
  "age_category_id" uuid NOT NULL REFERENCES "age_categories"("id") ON DELETE RESTRICT,
  PRIMARY KEY ("problem_id", "age_category_id")
);
CREATE INDEX "problem_age_categories_age_category_id_idx"
  ON "problem_age_categories" ("age_category_id");

-- 4. Seed the standard ladder. Sort orders are 10, 20, … so admins
--    can wedge new rows between existing ones later without renumbering.
INSERT INTO "age_categories" ("code", "name", "sort_order") VALUES
  ('A000001', '1-sinf', 10),
  ('A000002', '2-sinf', 20),
  ('A000003', '3-sinf', 30),
  ('A000004', '4-sinf', 40),
  ('A000005', '5-sinf', 50),
  ('A000006', '6-sinf', 60),
  ('A000007', '7-sinf', 70),
  ('A000008', '8-sinf', 80),
  ('A000009', '9-sinf', 90),
  ('A000010', '10-sinf', 100),
  ('A000011', '11-sinf', 110),
  ('A000012', 'Talaba', 120);
