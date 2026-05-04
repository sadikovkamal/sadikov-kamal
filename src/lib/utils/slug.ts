/**
 * Convert a name to a URL-safe slug.
 *
 * ASCII-only output: this is intentional. Slugs travel through URLs,
 * filenames, R2 keys, and DB unique constraints; keeping them in the
 * `[a-z0-9-]+` alphabet sidesteps every encoding gotcha. Admins type
 * English/transliterated slugs; we don't auto-translate Cyrillic, so
 * Cyrillic-only input collapses to an empty string and the caller's
 * unique-constraint or required-field check surfaces it.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
