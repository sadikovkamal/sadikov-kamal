// E2E smoke for Phase 6 list query + URL-state parsing.
// Inserts ~10 problems with a mix of source/year/topic/class,
// then exercises listProblems with each filter dimension and verifies counts.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/list-smoke.ts

import "../src/db/load-env";

import { inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  problems,
  ageCategories,
} from "../src/db/schema";
import {
  createProblemTx,
} from "../src/lib/problems/mutations";
import {
  listProblems,
  type ProblemListFilters,
} from "../src/lib/problems/queries";
import { parseSearchParams } from "../src/app/admin/problems/_url-state";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  const admin = (await db.query.users.findMany()).find(
    (u) => u.email === "admin@example.com"
  );
  assert(admin, "admin missing");

  const algebra = (await db.query.topics.findMany()).find((t) => t.name === "Algebra")!;
  const inequalities = (await db.query.topics.findMany()).find((t) => t.name === "Tengsizliklar")!;
  const geometry = (await db.query.topics.findMany()).find((t) => t.name === "Geometriya")!;
  const imo = (await db.query.sources.findMany()).find((s) => s.name === "IMO")!;
  const national = (await db.query.sources.findMany()).find(
    (s) => s.name === "Respublika olimpiadasi"
  )!;

  // Age-category lookup: tests build fixtures with grade numbers, we
  // translate to codes via the seeded "N-sinf" labels.
  const allCategories = await db.select().from(ageCategories);
  const catByGrade = new Map<number, { id: string; code: string }>();
  for (const c of allCategories) {
    const m = c.name.match(/^(\d+)-sinf$/);
    if (m) catByGrade.set(Number(m[1]), { id: c.id, code: c.code });
  }
  const cat = (n: number): { id: string; code: string } => {
    const entry = catByGrade.get(n);
    if (!entry) throw new Error(`age category for grade ${n} not seeded`);
    return entry;
  };

  // --- Seed test fixtures ---------------------------------------------------
  // Generate a deterministic body using a unique marker so we can clean up
  // afterwards by exact match.
  const MARKER = "PHASE6_SMOKE_MARKER";
  const fixtures = [
    { topic: algebra, source: imo, grades: [9], body: `${MARKER} cauchy-schwarz problem` },
    { topic: algebra, source: imo, grades: [9, 10], body: `${MARKER} algebra basic` },
    { topic: algebra, source: imo, grades: [10], body: `${MARKER} prove inequality cauchy` },
    { topic: inequalities, source: imo, grades: [10, 11], body: `${MARKER} hard inequality` },
    { topic: inequalities, source: national, grades: [11], body: `${MARKER} extremely hard cauchy schwarz` },
    { topic: geometry, source: national, grades: [7, 8], body: `${MARKER} triangle area` },
    { topic: geometry, source: national, grades: [9], body: `${MARKER} circle inscribed` },
    { topic: algebra, source: imo, grades: [11], body: `${MARKER} polynomial roots` },
  ];

  const created: string[] = [];
  for (const f of fixtures) {
    const { id } = await createProblemTx(
      {
        bodyMd: f.body,
        sourceId: f.source.id,
        topicIds: [f.topic.id],
        ageCategoryIds: f.grades.map((g) => cat(g).id),
      },
      admin.id
    );
    created.push(id);
  }
  console.log(`[setup] inserted ${created.length} fixtures`);

  // Helper: filters that always restrict to our marker (so other DB rows
  // — left over from manual testing — don't leak in).
  function withMarker(filters: ProblemListFilters): ProblemListFilters {
    return { ...filters, search: `${MARKER}${filters.search ? " " + filters.search : ""}` };
  }

  try {
    // --- No filters: count == fixtures.length (within marker scope) -------
    {
      const r = await listProblems(
        withMarker({}),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === fixtures.length, `total=${r.total}, want ${fixtures.length}`);
      assert(r.rows.length === fixtures.length, `rows=${r.rows.length}, want ${fixtures.length}`);
      assert(r.rows[0].bodyPreview.includes("PHASE6"), "marker not in preview");
      console.log(`[1] FTS marker filter -> ${r.total} rows`);
    }

    // --- FTS search: "cauchy" matches 3 fixtures ---------------------------
    {
      const r = await listProblems(
        withMarker({ search: "cauchy" }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === 3, `cauchy search total=${r.total}, want 3`);
      console.log(`[2] FTS "cauchy" -> ${r.total} rows`);
    }

    // --- Sort by code (asc) -------------------------------------------------
    {
      const r = await listProblems(
        withMarker({}),
        { field: "code", direction: "asc" },
        1,
        25
      );
      assert(r.total === fixtures.length, `code-sort total=${r.total}`);
      for (let i = 1; i < r.rows.length; i++) {
        assert(
          r.rows[i].code > r.rows[i - 1].code,
          `code-sort asc broken at idx ${i}`
        );
      }
      console.log(`[3] sort by code asc -> ${r.rows.length} rows`);
    }

    // --- Source filter ------------------------------------------------------
    {
      const r = await listProblems(
        withMarker({ sourceCodes: [national.code] }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === 3, `national total=${r.total}, want 3`);
      assert(r.rows.every((row) => row.sourceName === national.name), "source leaked");
      console.log(`[4] source=national -> ${r.total} rows`);
    }

    // --- Topic filter (EXISTS subquery, no duplicates) ---------------------
    {
      const r = await listProblems(
        withMarker({ topicCodes: [algebra.code] }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === 4, `algebra topic total=${r.total}, want 4`);
      // Verify no duplicate ids
      const ids = new Set(r.rows.map((row) => row.id));
      assert(ids.size === r.rows.length, "duplicate rows from topic join");
      console.log(`[5] topic=algebra -> ${r.total} rows, no dupes`);
    }

    // --- Age category filter ----------------------------------------------
    {
      const cat11 = cat(11);
      const r = await listProblems(
        withMarker({ ageCategoryCodes: [cat11.code] }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === 3, `11-sinf total=${r.total}, want 3`);
      assert(
        r.rows.every((row) => row.ageCategories.some((c) => c.id === cat11.id)),
        "age category filter leaked"
      );
      console.log(`[6] ageCategory=11-sinf -> ${r.total} rows`);
    }

    // --- Combined filters ---------------------------------------------------
    {
      const r = await listProblems(
        withMarker({
          topicCodes: [algebra.code],
          sourceCodes: [imo.code],
        }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      // Algebra problems from IMO: 4 fixtures.
      assert(r.total === 4, `combined total=${r.total}, want 4`);
      assert(
        r.rows.every((row) => row.sourceName === imo.name),
        "combined source leaked"
      );
      console.log(`[7] combined filters (algebra + imo) -> ${r.total} rows`);
    }

    // --- Pagination ---------------------------------------------------------
    {
      const r1 = await listProblems(
        withMarker({}),
        { field: "createdAt", direction: "desc" },
        1,
        3
      );
      const r2 = await listProblems(
        withMarker({}),
        { field: "createdAt", direction: "desc" },
        2,
        3
      );
      assert(r1.rows.length === 3, `page 1 size=${r1.rows.length}`);
      assert(r2.rows.length === 3, `page 2 size=${r2.rows.length}`);
      // Pages must not overlap
      const ids1 = new Set(r1.rows.map((r) => r.id));
      const ids2 = new Set(r2.rows.map((r) => r.id));
      const overlap = [...ids1].filter((id) => ids2.has(id));
      assert(overlap.length === 0, `pagination overlap: ${overlap.length}`);
      console.log(`[8] pagination ok (page 1 + page 2 distinct)`);
    }

    // --- URL state parser ---------------------------------------------------
    {
      const cat10 = cat(10);
      const cat11 = cat(11);
      const sp = new URLSearchParams(
        `q=cauchy&ageCategory=${cat10.code},${cat11.code}&sortField=code&sortDir=asc&page=2`
      );
      const parsed = parseSearchParams(sp);
      assert(parsed.filters.search === "cauchy", "search not parsed");
      assert(
        JSON.stringify(parsed.filters.ageCategoryCodes) ===
          JSON.stringify([cat10.code, cat11.code]),
        "ageCategory csv parse"
      );
      assert(parsed.sort.field === "code", "sortField parse");
      assert(parsed.sort.direction === "asc", "sortDir parse");
      assert(parsed.page === 2, "page parse");
      console.log(`[9] parseSearchParams ok`);
    }

    // --- FTS index plan -----------------------------------------------------
    // With our tiny seed dataset Postgres picks Seq Scan over the GIN index
    // (cheaper at 8 rows). Run EXPLAIN inside a transaction with seqscan
    // disabled so the planner is forced to be honest about whether the
    // index is actually reachable for this expression. Catches a schema
    // change that accidentally drops the FTS expression match.
    {
      const usesIndex = await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL enable_seqscan = off`);
        const plan = await tx.execute(
          sql`EXPLAIN SELECT id FROM problems WHERE to_tsvector('simple', body_md) @@ websearch_to_tsquery('simple', 'cauchy')`
        );
        const planText = plan.map((r) => Object.values(r)[0]).join("\n");
        return /problems_body_fts_idx/i.test(planText);
      });
      assert(usesIndex, "FTS plan did not pick problems_body_fts_idx even with seqscan disabled");
      console.log(`[10] EXPLAIN (with seqscan off) confirms problems_body_fts_idx is reachable`);
    }
  } finally {
    // --- Cleanup -----------------------------------------------------------
    if (created.length) {
      await db.delete(problems).where(inArray(problems.id, created));
    }
    console.log(`[cleanup] deleted ${created.length} fixtures`);
  }

  console.log(`\nList query smoke: PASSED`);
  process.exit(0);
}

main().catch((e) => {
  console.error("List smoke FAILED:", e);
  process.exit(1);
});
