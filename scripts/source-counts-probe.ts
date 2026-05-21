// Diagnostic: dump every source with its direct problem count, the
// computed rollup (own + descendants), and flag anything weird.
//
// Run against any DATABASE_URL — e.g. set DATABASE_URL=postgres://prod...
// in your shell, then:
//
//   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/source-counts-probe.ts
//
// Prints a tree-shaped listing plus three sanity checks:
//   1) sum(direct) across all sources == count(problems) — every
//      problem must hit exactly one source row (FK is NOT NULL).
//   2) Any source whose direct > 0 AND which is a parent — leaf-only
//      rule says this shouldn't exist.
//   3) Any duplicate source names — surfaces "two rows look the same
//      in the UI but only one carries problems" confusion.

import "../src/db/load-env";

import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { sources, problems } from "../src/db/schema";
import { rollupCounts, parentIdSet } from "../src/lib/taxonomy/hierarchy";

async function main() {
  const rows = await db
    .select({
      id: sources.id,
      code: sources.code,
      name: sources.name,
      parentId: sources.parentId,
      problemCount: sql<number>`(
        SELECT count(*)::int
        FROM ${problems}
        WHERE ${problems.sourceId} = ${sources.id}
      )`,
    })
    .from(sources)
    .orderBy(sources.code);

  const rollup = rollupCounts(rows);
  const parents = parentIdSet(rows);

  // Tree print.
  const childrenOf = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const arr = childrenOf.get(r.parentId) ?? [];
    arr.push(r);
    childrenOf.set(r.parentId, arr);
  }
  console.log("\n=== Source tree (direct / rollup) ===\n");
  function walk(parentId: string | null, depth: number) {
    for (const k of childrenOf.get(parentId) ?? []) {
      const indent = "  ".repeat(depth);
      const isParent = parents.has(k.id);
      const tag = isParent ? "[parent]" : "[leaf]  ";
      console.log(
        `${indent}${k.code}  ${tag} ${k.name.padEnd(40)}  direct=${String(k.problemCount).padStart(4)}  rollup=${rollup.get(k.id)}`
      );
      walk(k.id, depth + 1);
    }
  }
  walk(null, 0);

  // Sanity 1: direct sum vs problems count.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(problems);
  const sumDirect = rows.reduce((a, r) => a + r.problemCount, 0);
  console.log(`\n=== Sanity checks ===\n`);
  console.log(`  problems table count : ${total}`);
  console.log(`  sum(direct counts)   : ${sumDirect}`);
  if (total !== sumDirect) {
    console.log(
      `  ! mismatch — some problems either have source_id pointing at a non-existent row, or the count-per-source SQL is off`
    );
  } else {
    console.log(`  ✓ matches`);
  }

  // Sanity 2: parents holding problems.
  const parentsWithDirect = rows.filter(
    (r) => parents.has(r.id) && r.problemCount > 0
  );
  console.log(
    `\n  parents with direct > 0 (should be 0 under leaf-only rule): ${parentsWithDirect.length}`
  );
  for (const r of parentsWithDirect) {
    console.log(`    ${r.code}  ${r.name}  (direct=${r.problemCount})`);
  }

  // Sanity 3: duplicate names.
  const byName = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }
  const dupes = [...byName.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`\n  duplicate source names: ${dupes.length}`);
  for (const [name, arr] of dupes) {
    console.log(`    "${name}":`);
    for (const r of arr) {
      console.log(`      ${r.code}  direct=${r.problemCount}  rollup=${rollup.get(r.id)}`);
    }
  }

  // Top-5 sources by rollup so the user can spot where the 769 lives.
  console.log(`\n  Top 10 sources by rollup count:`);
  const sorted = [...rows].sort(
    (a, b) => (rollup.get(b.id) ?? 0) - (rollup.get(a.id) ?? 0)
  );
  for (const r of sorted.slice(0, 10)) {
    console.log(
      `    ${r.code}  ${r.name.padEnd(40)}  rollup=${rollup.get(r.id)}  direct=${r.problemCount}`
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
