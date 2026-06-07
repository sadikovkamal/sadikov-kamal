/**
 * Portable image references for problem bodies.
 *
 * PROBLEM this solves: image markdown in `body_md` used to embed the ABSOLUTE
 * R2 public URL (`![alt](https://pub-xxx.r2.dev/problems/…)`). That hard-wires
 * every problem to one storage host — change the R2 public URL, attach a
 * custom domain, or migrate provider, and thousands of body URLs break.
 *
 * THE FIX: store a host-independent reference instead — `r2:<storageKey>`
 * (e.g. `r2:problems/imported/123/abc.png`). The absolute URL is reconstructed
 * at the LAST moment, from the current `R2_PUBLIC_URL`, only where bytes are
 * actually displayed/fetched (preview, editor, docx). Migrating storage then
 * means changing ONE env var — no database rewrite.
 *
 * These helpers are pure string transforms (no I/O, no env) so they're safe in
 * both server and client bundles. The caller supplies the base URL.
 */

/** Scheme marking a body image ref as an R2 storage key. */
export const IMAGE_REF_SCHEME = "r2:";

/** Build the portable body ref for a storage key: `problems/x.png` → `r2:problems/x.png`. */
export function toImageRef(storageKey: string): string {
  return `${IMAGE_REF_SCHEME}${storageKey}`;
}

/** Strip the scheme if present: `r2:problems/x.png` → `problems/x.png`; else null. */
export function imageRefToStorageKey(ref: string): string | null {
  return ref.startsWith(IMAGE_REF_SCHEME)
    ? ref.slice(IMAGE_REF_SCHEME.length)
    : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Trim trailing slashes so concatenation with `/${key}` is clean. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * DISPLAY direction: rewrite `![alt](r2:KEY)` → `![alt](BASE/KEY)` so a
 * browser/markdown renderer loads the image. Non-`r2:` refs (already-absolute
 * URLs, e.g. legacy rows) are left untouched. No-op when `baseUrl` is empty
 * (unconfigured env) — better a broken image than a malformed `/KEY` URL.
 */
export function resolveImageRefs(md: string, baseUrl: string): string {
  const base = trimBase(baseUrl);
  if (!base) return md;
  // Match the URL slot of any markdown link/image whose target uses `r2:`.
  return md.replace(
    /(\]\(\s*)r2:([^)\s]+)/g,
    (_m, lead: string, key: string) => `${lead}${base}/${key}`
  );
}

/**
 * STORAGE direction (inverse of {@link resolveImageRefs}): rewrite
 * `![alt](BASE/KEY)` → `![alt](r2:KEY)` so what we persist is host-independent.
 * Only URLs under the CURRENT base are relativised; foreign URLs pass through.
 * No-op when `baseUrl` is empty.
 */
export function relativizeImageRefs(md: string, baseUrl: string): string {
  const base = trimBase(baseUrl);
  if (!base) return md;
  const re = new RegExp(
    `(\\]\\(\\s*)${escapeRegExp(base)}/([^)\\s]+)`,
    "g"
  );
  return md.replace(re, (_m, lead: string, key: string) => `${lead}r2:${key}`);
}

/**
 * Does `body_md` reference this storage key as an inline image? Checks both
 * the portable `r2:` form and (defensively, for not-yet-migrated rows) the
 * absolute-URL form. Used to avoid rendering a body image twice on the
 * detail page (inline + standalone figure).
 */
export function bodyReferencesStorageKey(
  md: string,
  storageKey: string,
  baseUrl?: string
): boolean {
  if (md.includes(toImageRef(storageKey))) return true;
  const base = baseUrl ? trimBase(baseUrl) : "";
  return base ? md.includes(`${base}/${storageKey}`) : false;
}
