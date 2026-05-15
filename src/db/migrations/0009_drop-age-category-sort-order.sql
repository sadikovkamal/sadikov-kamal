-- Drop sort_order from age_categories.
--
-- The column was a precaution for admin-driven reordering, but in
-- practice the seeded ladder (1-sinf → 11-sinf → Talaba) is fine in
-- insertion order, and new categories naturally land at the end via
-- their A###### code. Showing a "Tartib" number in the admin table
-- was confusing without a real reorder UX, so we drop the column
-- entirely. If reordering becomes a need, we'll re-add it together
-- with a drag-and-drop affordance.

DROP INDEX IF EXISTS "age_categories_sort_order_idx";
ALTER TABLE "age_categories" DROP COLUMN IF EXISTS "sort_order";
