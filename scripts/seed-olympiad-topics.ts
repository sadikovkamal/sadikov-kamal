/**
 * One-off seeder: populate the topic tree with the standard olympiad
 * taxonomy in Uzbek, modeled on what MathNet MIT and AoPS use to
 * classify problems. Idempotent — anything that already exists by name
 * is left alone, missing rows are inserted with a freshly assigned
 * T-code.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-olympiad-topics.ts
 */

import "../src/db/load-env";

import { db } from "../src/db";
import { topics } from "../src/db/schema";
import { nextTopicCode } from "../src/lib/taxonomy/topic-codes";

interface SubTopic {
  name: string;
}

interface RootTopic {
  name: string;
  children: SubTopic[];
}

// Standard competition-math taxonomy (Algebra / Geometry / Number Theory /
// Combinatorics) with the sub-topics most commonly tagged on olympiad
// problems. Names mirror Uzbek olympiad vocabulary used in school
// textbooks; rename in the admin UI later if any one feels off.
const TAXONOMY: RootTopic[] = [
  {
    name: "Algebra",
    children: [
      { name: "Ko'phadlar" },
      { name: "Tengsizliklar" },
      { name: "Funksional tenglamalar" },
      { name: "Ketma-ketliklar va qatorlar" },
      { name: "Tenglamalar va sistemalar" },
      { name: "Logarifmlar" },
      { name: "Daraja va eksponentalar" },
    ],
  },
  {
    name: "Geometriya",
    children: [
      { name: "Planimetriya" },
      { name: "Stereometriya" },
      { name: "Trigonometriya" },
      { name: "Koordinata geometriyasi" },
      { name: "Aylanalar" },
      { name: "Uchburchaklar" },
      { name: "To'rtburchaklar" },
      { name: "Ko'pburchaklar" },
      { name: "Geometrik o'zgartirishlar" },
      { name: "Vektorlar" },
    ],
  },
  {
    name: "Sonlar nazariyasi",
    children: [
      { name: "Bo'linish" },
      { name: "Modular arifmetika" },
      { name: "Diofant tenglamalari" },
      { name: "Tub sonlar" },
      { name: "EKUB va EKUK" },
      { name: "Sanoq sistemalari" },
      { name: "Butun sonlar ketma-ketligi" },
    ],
  },
  {
    name: "Kombinatorika",
    children: [
      { name: "Sanash" },
      { name: "Graf nazariyasi" },
      { name: "Dirixle prinsipi" },
      { name: "Ehtimollik" },
      { name: "O'yinlar nazariyasi" },
      { name: "Kombinatorik geometriya" },
      { name: "Rekurrent munosabatlar" },
      { name: "Generatsiya funksiyalari" },
    ],
  },
];

async function main() {
  // Snapshot existing rows so we can dedup by name and track the next
  // available code in a single pass.
  const existing = await db
    .select({ id: topics.id, name: topics.name, code: topics.code })
    .from(topics);

  const byName = new Map<string, { id: string; code: string }>();
  for (const r of existing) {
    byName.set(r.name.toLowerCase(), { id: r.id, code: r.code });
  }

  const allCodes = existing.map((r) => r.code);
  let insertedRoots = 0;
  let insertedChildren = 0;
  let skipped = 0;

  for (const root of TAXONOMY) {
    let rootId: string;
    const rootKey = root.name.toLowerCase();

    if (byName.has(rootKey)) {
      rootId = byName.get(rootKey)!.id;
      skipped++;
      console.log(`  · ${root.name} — already exists`);
    } else {
      const code = nextTopicCode(allCodes);
      allCodes.push(code);
      const [inserted] = await db
        .insert(topics)
        .values({ name: root.name, code, parentId: null, description: null })
        .returning({ id: topics.id });
      rootId = inserted.id;
      byName.set(rootKey, { id: rootId, code });
      insertedRoots++;
      console.log(`  + ${code} ${root.name}`);
    }

    for (const child of root.children) {
      const childKey = child.name.toLowerCase();
      if (byName.has(childKey)) {
        skipped++;
        console.log(`    · ${child.name} — already exists`);
        continue;
      }
      const code = nextTopicCode(allCodes);
      allCodes.push(code);
      const [inserted] = await db
        .insert(topics)
        .values({
          name: child.name,
          code,
          parentId: rootId,
          description: null,
        })
        .returning({ id: topics.id });
      byName.set(childKey, { id: inserted.id, code });
      insertedChildren++;
      console.log(`    + ${code} ${child.name}`);
    }
  }

  console.log("");
  console.log(`Done. Inserted ${insertedRoots} roots + ${insertedChildren} children. Skipped ${skipped} pre-existing.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
