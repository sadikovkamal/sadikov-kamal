/**
 * Pure tree helpers shared by mutation guards, import validation, and
 * the filter expansion in listProblems. No React, no DB — feed it the
 * `(id, parentId)` rows you already have in scope and it answers the
 * three questions we ask everywhere:
 *
 *  - Which ids have a child? (parentIdSet)
 *  - Is this specific id a leaf? (isLeaf)
 *  - What's the full subtree under these ancestors? (withDescendants)
 */

export interface NodeRef {
  id: string;
  parentId: string | null;
}

/**
 * Return every id that appears as someone else's parentId — i.e. the
 * non-leaf set. Built once per caller and reused with O(1) lookups.
 */
export function parentIdSet(nodes: Iterable<NodeRef>): Set<string> {
  const parents = new Set<string>();
  for (const n of nodes) {
    if (n.parentId) parents.add(n.parentId);
  }
  return parents;
}

/** Convenience wrapper — true if `id` has no children in the given set. */
export function isLeaf(id: string, parents: Set<string>): boolean {
  return !parents.has(id);
}

/**
 * Expand a list of ancestor ids into the full set of ids in their
 * subtrees, *including the ancestors themselves*. Ids in `ancestorIds`
 * that don't appear in `nodes` are still returned (so an unknown id
 * doesn't silently disappear from the caller's filter).
 *
 * Result is in insertion order (BFS-ish, but order isn't guaranteed —
 * callers use this for `IN (...)` clauses where order doesn't matter).
 */
export function withDescendants(
  ancestorIds: Iterable<string>,
  nodes: Iterable<NodeRef>
): string[] {
  // Build children-of map once.
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
  }

  const out = new Set<string>();
  const queue: string[] = [];
  for (const id of ancestorIds) {
    if (!out.has(id)) {
      out.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const next = queue.shift()!;
    const kids = childrenOf.get(next);
    if (!kids) continue;
    for (const child of kids) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return Array.from(out);
}
