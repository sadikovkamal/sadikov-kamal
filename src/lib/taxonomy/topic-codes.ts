/**
 * Topic identifier conventions.
 *
 * Two parallel identifiers, both human-facing:
 *
 *   code    →  `T000042`     stable, sequential, assigned at create time,
 *                            never reused or re-numbered.
 *
 *   path    →  `1.2.3`       computed from tree position. Changes when
 *                            siblings reorder. Display-only — don't store.
 *
 * The internal UUID `id` still drives joins; these two are for humans.
 */

import type { Topic } from "@/db/schema";

export const TOPIC_CODE_PREFIX = "T";
export const TOPIC_CODE_PAD = 6;
export const TOPIC_CODE_REGEX = /^T\d{6,}$/;

export function formatTopicCode(seq: number): string {
  return `${TOPIC_CODE_PREFIX}${String(seq).padStart(TOPIC_CODE_PAD, "0")}`;
}

/**
 * Pull the numeric part out of a `T######` code. Returns NaN if the input
 * doesn't match the expected shape — callers should treat NaN as "skip".
 */
export function parseTopicCodeSeq(code: string): number {
  if (!TOPIC_CODE_REGEX.test(code)) return Number.NaN;
  return Number.parseInt(code.slice(TOPIC_CODE_PREFIX.length), 10);
}

/**
 * Given the current set of topics, return the next code in sequence.
 * Reads max(seq) and adds one. The DB has a UNIQUE constraint on `code`,
 * so even if two creates race we'll get a clean constraint violation
 * rather than two topics with the same code.
 */
export function nextTopicCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const n = parseTopicCodeSeq(code);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatTopicCode(max + 1);
}

// --- Hierarchy path -------------------------------------------------------

export interface TopicTreeNode<T extends Pick<Topic, "id" | "parentId" | "code" | "name">> {
  topic: T;
  /** Hierarchical position like "1.2.3" — empty string for orphans (shouldn't happen with FK). */
  path: string;
  children: TopicTreeNode<T>[];
}

/**
 * Build a forest from a flat list, computing the `path` for every node
 * based on its position among its siblings. Siblings are sorted by code
 * so the path matches the stable sequence (T000001 → "1", T000002 → "2").
 *
 * Returns roots. Walk `children` recursively to render a tree.
 */
export function buildTopicTree<
  T extends Pick<Topic, "id" | "parentId" | "code" | "name">,
>(topics: T[]): TopicTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const t of topics) {
    const key = t.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(t);
    byParent.set(key, arr);
  }
  // Stable sort by code within each parent group.
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
  }

  function build(parentId: string | null, parentPath: string): TopicTreeNode<T>[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((topic, i) => {
      const path = parentPath ? `${parentPath}.${i + 1}` : String(i + 1);
      return {
        topic,
        path,
        children: build(topic.id, path),
      };
    });
  }

  return build(null, "");
}

/**
 * Flatten the tree back into a list, preserving depth-first order and
 * carrying `path` + `depth` alongside each topic. Useful for table-style
 * rendering where each row needs to know its indent level.
 */
export function flattenTopicTree<
  T extends Pick<Topic, "id" | "parentId" | "code" | "name">,
>(roots: TopicTreeNode<T>[]): Array<{ topic: T; path: string; depth: number }> {
  const out: Array<{ topic: T; path: string; depth: number }> = [];
  function walk(nodes: TopicTreeNode<T>[], depth: number) {
    for (const n of nodes) {
      out.push({ topic: n.topic, path: n.path, depth });
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}
