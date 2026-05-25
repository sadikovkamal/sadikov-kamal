/**
 * Method identifier conventions.
 *
 * Mirror of `topic-codes.ts` but for the `methods` taxonomy.
 * Two parallel identifiers, both human-facing:
 *
 *   code    →  `M000042`     stable, sequential, assigned at create time,
 *                            never reused or re-numbered.
 *
 *   path    →  `1.2.3`       computed from tree position. Changes when
 *                            siblings reorder. Display-only — don't store.
 *
 * The internal UUID `id` still drives joins; these two are for humans.
 */

import type { Method } from "@/db/schema";

export const METHOD_CODE_PREFIX = "M";
export const METHOD_CODE_PAD = 6;
export const METHOD_CODE_REGEX = /^M\d{6,}$/;

export function formatMethodCode(seq: number): string {
  return `${METHOD_CODE_PREFIX}${String(seq).padStart(METHOD_CODE_PAD, "0")}`;
}

export function parseMethodCodeSeq(code: string): number {
  if (!METHOD_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(METHOD_CODE_PREFIX.length), 10);
}

export function nextMethodCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const n = parseMethodCodeSeq(code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatMethodCode(max + 1);
}

// --- Hierarchy path -------------------------------------------------------

export interface MethodTreeNode<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
> {
  method: T;
  /** Hierarchical position like "1.2.3" — empty string for orphans. */
  path: string;
  children: MethodTreeNode<T>[];
}

export function buildMethodTree<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
>(methodsList: T[]): MethodTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const m of methodsList) {
    const key = m.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(m);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  }

  function build(
    parentId: string | null,
    parentPath: string
  ): MethodTreeNode<T>[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((method, i) => {
      const path = parentPath ? `${parentPath}.${i + 1}` : String(i + 1);
      return {
        method,
        path,
        children: build(method.id, path),
      };
    });
  }

  return build(null, "");
}

export function flattenMethodTree<
  T extends Pick<Method, "id" | "parentId" | "code" | "name">,
>(
  roots: MethodTreeNode<T>[]
): Array<{ method: T; path: string; depth: number }> {
  const out: Array<{ method: T; path: string; depth: number }> = [];
  function walk(nodes: MethodTreeNode<T>[], depth: number) {
    for (const n of nodes) {
      out.push({ method: n.method, path: n.path, depth });
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}
