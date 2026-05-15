/**
 * Source identifier conventions.
 *
 * Mirror of `topic-codes.ts` and `age-category-codes.ts` for the
 * `sources` table. Stable `S######` handle assigned at create time,
 * never reused or re-numbered. The slug column was dropped — `name`
 * is the display label, `code` is the stable handle, internal UUID
 * `id` drives joins.
 */

export const SOURCE_CODE_PREFIX = "S";
export const SOURCE_CODE_PAD = 6;
export const SOURCE_CODE_REGEX = /^S\d{6,}$/;

export function formatSourceCode(seq: number): string {
  return `${SOURCE_CODE_PREFIX}${String(seq).padStart(SOURCE_CODE_PAD, "0")}`;
}

export function parseSourceCodeSeq(code: string): number {
  if (!SOURCE_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(SOURCE_CODE_PREFIX.length), 10);
}

/**
 * Next sequential code given the existing set. UNIQUE constraint on
 * `code` turns a race between parallel creates into a clean error,
 * which the caller can retry — no pre-lock.
 */
export function nextSourceCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const n = parseSourceCodeSeq(code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatSourceCode(max + 1);
}

// --- Hierarchy ---------------------------------------------------------------

export interface SourceTreeNode<
  T extends { id: string; parentId: string | null; code: string; name: string },
> {
  source: T;
  children: SourceTreeNode<T>[];
}

/**
 * Build a forest from a flat list. Siblings are sorted by code so the
 * traversal order matches the stable insertion sequence — admins reading
 * the tree top-to-bottom see the same order they created.
 */
export function buildSourceTree<
  T extends { id: string; parentId: string | null; code: string; name: string },
>(rows: T[]): SourceTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const key = r.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(r);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  }

  function build(parentId: string | null): SourceTreeNode<T>[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((source) => ({
      source,
      children: build(source.id),
    }));
  }

  return build(null);
}

/**
 * Depth-first flatten with `depth` annotation — handy for indented
 * dropdowns (parent picker), CSVs, etc.
 */
export function flattenSourceTree<
  T extends { id: string; parentId: string | null; code: string; name: string },
>(roots: SourceTreeNode<T>[]): Array<{ source: T; depth: number }> {
  const out: Array<{ source: T; depth: number }> = [];
  function walk(nodes: SourceTreeNode<T>[], depth: number) {
    for (const n of nodes) {
      out.push({ source: n.source, depth });
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}
