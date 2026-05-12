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

  const algebra = (await db.query.topics.findMany()).find((t) => t.slug === "algebra")!;
  const inequalities = (await db.query.topics.findMany()).find((t) => t.slug === "inequalities")!;
  const geometry = (await db.query.topics.findMany()).find((t) => t.slug === "geometry")!;
  const imo = (await db.query.sources.findMany()).find((s) => s.slug === "imo")!;
  const national = (await db.query.sources.findMany()).find((s) => s.slug === "uzbekistan-national")!;

  // --- Seed test fixtures ---------------------------------------------------
  // Generate a deterministic body using a unique marker so we can clean up
  // afterwards by exact match.
  const MARKER = "PHASE6_SMOKE_MARKER";
  const fixtures = [
    { topic: algebra, source: imo, year: 2020, diff: 1, classes: [9], body: `${MARKER} cauchy-schwarz problem` },
    { topic: algebra, source: imo, year: 2021, diff: 2, classes: [9, 10], body: `${MARKER} algebra basic` },
    { topic: algebra, source: imo, year: 2022, diff: 3, classes: [10], body: `${MARKER} prove inequality cauchy` },
    { topic: inequalities, source: imo, year: 2023, diff: 4, classes: [10, 11], body: `${MARKER} hard inequality` },
    { topic: inequalities, source: national, year: 2024, diff: 5, classes: [11], body: `${MARKER} extremely hard cauchy schwarz` },
    { topic: geometry, source: national, year: 2020, diff: 2, classes: [7, 8], body: `${MARKER} triangle area` },
    { topic: geometry, source: national, year: null, diff: 3, classes: [9], body: `${MARKER} circle inscribed` },
    { topic: algebra, source: imo, year: 2024, diff: 5, classes: [11], body: `${MARKER} polynomial roots` },
  ];

  const created: string[] = [];
  for (const f of fixtures) {
    const id = await createProblemTx(
      {
        bodyMd: f.body,
        solutionMd: null,
        answer: null,
        sourceId: f.source.id,
        year: f.year,
        problemNumber: null,
        topicIds: [f.topic.id],
        classes: f.classes,
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

    // --- Year range ---------------------------------------------------------
    {
      const r = await listProblems(
        withMarker({ yearFrom: 2021, yearTo: 2023 }),
        { field: "year", direction: "asc" },
        1,
        25
      );
      assert(r.total === 3, `year 2021-2023 total=${r.total}, want 3`);
      assert(
        r.rows.every((row) => row.year !== null && row.year >= 2021 && row.year <= 2023),
        "year range leaked"
      );
      console.log(`[3] year 2021..2023 asc -> ${r.total} rows`);
    }

    // --- Source filter ------------------------------------------------------
    {
      const r = await listProblems(
        withMarker({ sourceIds: [national.id] }),
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
        withMarker({ topicIds: [algebra.id] }),
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

    // --- Class filter -------------------------------------------------------
    {
      const r = await listProblems(
        withMarker({ classes: [11] }),
        { field: "createdAt", direction: "desc" },
        1,
        25
      );
      assert(r.total === 3, `class 11 total=${r.total}, want 3`);
      assert(r.rows.every((row) => row.classes.includes(11)), "class filter leaked");
      console.log(`[6] class=11 -> ${r.total} rows`);
    }

    // --- Combined filters ---------------------------------------------------
    {
      const r = await listProblems(
        withMarker({
          topicIds: [algebra.id],
          yearFrom: 2022,
        }),
        { field: "year", direction: "desc" },
        1,
        25
      );
      // Algebra problems with year >= 2022:
      // 2022, 2024 → 2 rows
      assert(r.total === 2, `combined total=${r.total}, want 2`);
      assert(r.rows[0].year === 2024, `first year=${r.rows[0].year}, want 2024`);
      console.log(`[7] combined filters -> ${r.total} rows, first year=${r.rows[0].year}`);
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
      const sp = new URLSearchParams(
        "q=cauchy&class=10,11&yearFrom=2020&yearTo=2024&sortField=year&sortDir=asc&page=2"
      );
      const parsed = parseSearchParams(sp);
      assert(parsed.filters.search === "cauchy", "search not parsed");
      assert(JSON.stringify(parsed.filters.classes) === "[10,11]", "class csv parse");
      assert(parsed.filters.yearFrom === 2020 && parsed.filters.yearTo === 2024, "year range parse");
      assert(parsed.sort.field === "year", "sortField parse");
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
