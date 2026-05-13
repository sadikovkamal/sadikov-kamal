// MUST be the first import: populates process.env before `./index` evaluates.
import "./load-env";

import bcrypt from "bcryptjs";
import { db } from "./index";
import { users, topics, sources } from "./schema";

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

  // 2. Default top-level topics (Uzbek + slug + auto-assigned code).
  // Codes are assigned in order so the seed is reproducible: the first
  // topic in the list gets T000001, the second gets T000002, and so on.
  // Existing topics with a higher code are preserved — we only fill new
  // entries on conflict-do-nothing.
  const existing = await db.select({ code: topics.code }).from(topics);
  let nextSeq = existing.reduce((max, r) => {
    const n = Number.parseInt(r.code.replace(/^T/, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const topicData = [
    { name: "Algebra", slug: "algebra" },
    { name: "Geometriya", slug: "geometry" },
    { name: "Sonlar nazariyasi", slug: "number-theory" },
    { name: "Kombinatorika", slug: "combinatorics" },
    { name: "Tengsizliklar", slug: "inequalities" },
    { name: "Funksional tenglamalar", slug: "functional-equations" },
  ].map((t) => ({
    ...t,
    code: `T${String(++nextSeq).padStart(6, "0")}`,
  }));
  await db
    .insert(topics)
    .values(topicData)
    .onConflictDoNothing({ target: topics.slug });

  // 3. Default sources
  const sourceData = [
    { name: "IMO", slug: "imo", kind: "olympiad" as const },
    { name: "IMO Shortlist", slug: "imo-shortlist", kind: "olympiad" as const },
    {
      name: "Respublika olimpiadasi",
      slug: "uzbekistan-national",
      kind: "olympiad" as const,
      country: "UZ",
    },
    {
      name: "Hudud olimpiadasi",
      slug: "regional-olympiad",
      kind: "olympiad" as const,
      country: "UZ",
    },
    { name: "Boshqa", slug: "other", kind: "other" as const },
  ];
  await db
    .insert(sources)
    .values(sourceData)
    .onConflictDoNothing({ target: sources.slug });

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
