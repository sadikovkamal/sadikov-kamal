// MUST be the first import: populates process.env before `./index` evaluates.
import "./load-env";

import bcrypt from "bcryptjs";
import { db } from "./index";
import { users, topics, sources, ageCategories } from "./schema";

async function seed() {
  console.log("Seeding database...");

  // 1. First admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: "super_admin",
    })
    .onConflictDoNothing({ target: users.email });

  console.log(`Admin user: ${adminEmail} / ${adminPassword}`);

  // 2. Default top-level topics. Codes are assigned in order so the seed
  // is reproducible: the first topic gets T000001, the second T000002,
  // and so on. Existing rows with a higher code are preserved — we only
  // fill new entries on conflict-do-nothing (by name).
  const existing = await db.select({ code: topics.code }).from(topics);
  let nextSeq = existing.reduce((max, r) => {
    const n = Number.parseInt(r.code.replace(/^T/, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const topicData = [
    "Algebra",
    "Geometriya",
    "Sonlar nazariyasi",
    "Kombinatorika",
    "Tengsizliklar",
    "Funksional tenglamalar",
  ].map((name) => ({
    name,
    code: `T${String(++nextSeq).padStart(6, "0")}`,
  }));
  // Conflict on code (only unique column left on topics). The seed
  // assigns codes sequentially after max(existing), so collisions only
  // happen on re-runs — onConflictDoNothing keeps the seed idempotent.
  await db
    .insert(topics)
    .values(topicData)
    .onConflictDoNothing({ target: topics.code });

  // 3. Default sources — nested taxonomy.
  //
  //   Olimpiadalar
  //     ├─ IMO
  //     ├─ IMO Shortlist
  //     ├─ Respublika olimpiadasi
  //     └─ Hudud olimpiadasi
  //   Kitoblar
  //   Kurslar
  //   Boshqa
  //
  // Roots are inserted first so their generated UUIDs are available for
  // the children's `parent_id`. Skipped wholesale if any source already
  // exists (idempotent on re-runs after manual DB ops).
  const existingSources = await db
    .select({ id: sources.id })
    .from(sources)
    .limit(1);
  if (existingSources.length === 0) {
    const rootData = [
      { code: "S000001", name: "Olimpiadalar" },
      { code: "S000002", name: "Kitoblar" },
      { code: "S000003", name: "Kurslar" },
      { code: "S000004", name: "Boshqa" },
    ];
    const inserted = await db
      .insert(sources)
      .values(rootData)
      .returning({ id: sources.id, name: sources.name });
    const idByName = new Map(inserted.map((r) => [r.name, r.id]));

    const olimpiadalarId = idByName.get("Olimpiadalar")!;
    await db.insert(sources).values([
      { code: "S000005", name: "IMO", parentId: olimpiadalarId },
      { code: "S000006", name: "IMO Shortlist", parentId: olimpiadalarId },
      {
        code: "S000007",
        name: "Respublika olimpiadasi",
        parentId: olimpiadalarId,
      },
      {
        code: "S000008",
        name: "Hudud olimpiadasi",
        parentId: olimpiadalarId,
      },
    ]);
  }

  // 4. Age categories — the standard ladder. Migration 0008 already
  // inserts these on a fresh DB, but seed re-runs against older dev
  // copies too, so we re-assert idempotently on `code`.
  const ageCategoryData = [
    { code: "A000001", name: "1-sinf" },
    { code: "A000002", name: "2-sinf" },
    { code: "A000003", name: "3-sinf" },
    { code: "A000004", name: "4-sinf" },
    { code: "A000005", name: "5-sinf" },
    { code: "A000006", name: "6-sinf" },
    { code: "A000007", name: "7-sinf" },
    { code: "A000008", name: "8-sinf" },
    { code: "A000009", name: "9-sinf" },
    { code: "A000010", name: "10-sinf" },
    { code: "A000011", name: "11-sinf" },
    { code: "A000012", name: "Talaba" },
  ];
  await db
    .insert(ageCategories)
    .values(ageCategoryData)
    .onConflictDoNothing({ target: ageCategories.code });

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
