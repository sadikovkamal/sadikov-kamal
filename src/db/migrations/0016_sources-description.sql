-- Add optional `description` to sources so admins can store extra
-- context (a link, a short note about scope, etc.) per source. Shown
-- in the source info modal on /admin/sources; not surfaced in the
-- card itself to keep the grid scannable.

ALTER TABLE "sources"
  ADD COLUMN "description" text;
