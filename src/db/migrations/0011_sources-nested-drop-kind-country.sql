-- Restructure sources: drop `kind` + `country`, add `parent_id` for
-- nested taxonomy.
--
-- The flat enum-based `kind` ("olympiad", "book", "course", "other") is
-- replaced by parent-child grouping: admins now organize sources as a
-- tree, e.g.
--
--   Olimpiadalar
--     ├─ IMO
--     │   └─ IMO 2025
--     ├─ Respublika olimpiadasi
--     └─ Hudud olimpiadasi
--   Kitoblar
--     └─ Skanavi
--   Kurslar
--   Boshqa
--
-- Same self-referencing FK pattern as `topics.parent_id` — ON DELETE
-- SET NULL so deleting a parent doesn't cascade into problems via
-- restricted child FKs.

-- 1. Drop sources_slug_idx if still present (sanity for older copies).
DROP INDEX IF EXISTS "sources_slug_idx";

-- 2. Drop the kind + country columns. Data loss is intentional — the
-- replacement is parent_id, which admins assign in the UI.
ALTER TABLE "sources" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "sources" DROP COLUMN IF EXISTS "country";

-- 3. Drop the now-unused enum type.
DROP TYPE IF EXISTS "source_kind";

-- 4. Add parent_id. ON DELETE SET NULL so children become roots if the
-- parent is deleted, mirroring topics.
ALTER TABLE "sources"
  ADD COLUMN "parent_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL;

CREATE INDEX "sources_parent_id_idx" ON "sources" ("parent_id");
