-- Add optional logo to sources.
--
-- Logos are uploaded to the same R2 bucket as problem images, under
-- `sources/<source-id>/logo.<ext>`. The column stores the storage_key
-- (relative path inside the bucket); the public URL is reconstructed
-- at read time via R2_PUBLIC_URL + the key.
--
-- Sources without a logo render a deterministic abbreviation card
-- (e.g. "IMO Shortlist" → "IS") on the explorer page.

ALTER TABLE "sources"
  ADD COLUMN "logo_storage_key" text;
