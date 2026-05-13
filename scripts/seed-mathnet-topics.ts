/**
 * Seed the MathNet MIT topic taxonomy (translated to Uzbek) into our
 * topics table.
 *
 * Roots match the four already in the DB by name (case-insensitive);
 * everything below is inserted recursively with a freshly assigned
 * T-code. Idempotent at the (parent, name) level — running twice
 * doesn't create duplicates. Names are no longer globally unique, so
 * generic labels like "Boshqa" can live under multiple parents.
 *
 * What we skipped from the MathNet listing:
 *  - "All X" rows (they're summary aggregators of their parent, not
 *    actual classification buckets).
 *  - Visibly-duplicated rows (MathNet shows e.g. "Cyclic quadrilaterals"
 *    4 times with count 2106/1/1/1 — clearly a tagging artifact).
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/seed-mathnet-topics.ts
 */

import "../src/db/load-env";

import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { topics } from "../src/db/schema";
import { nextTopicCode } from "../src/lib/taxonomy/topic-codes";

interface Node {
  name: string;
  children?: Node[];
}

const TREE: Node[] = [
  // ============================ ALGEBRA ============================
  {
    name: "Algebra",
    children: [
      {
        name: "Algebraik ifodalar",
        children: [
          {
            name: "Ko'phadlar",
            children: [
              { name: "Ko'phad amallari" },
              { name: "Viet formulalari" },
              { name: "Simmetrik funksiyalar" },
              { name: "Birlik ildizlari" },
              { name: "Qaytarilmaslik teoremalari" },
              { name: "Oraliq qiymat teoremasi" },
              { name: "Ko'phad interpolyatsiyasi" },
              { name: "Chebishev ko'phadlari" },
              { name: "Dekart belgilari qoidasi" },
            ],
          },
          {
            name: "Ketma-ketliklar va qatorlar",
            children: [
              { name: "Yig'indilar va ko'paytmalar" },
              { name: "Rekurrent munosabatlar" },
              { name: "Butun va kasr qismlar" },
              { name: "Teleskopik qatorlar" },
              { name: "Abel summatsiyasi" },
            ],
          },
          {
            name: "Funksional tenglamalar",
            children: [
              { name: "In'eksiyalik va suryeksiyalik" },
              { name: "Mavjudlik kvantorlari" },
            ],
          },
        ],
      },
      {
        name: "Tenglamalar va tengsizliklar",
        children: [
          { name: "Chiziqli va kvadrat tengsizliklar" },
          { name: "O'rtacha qiymatlar (QM-AM-GM-HM)" },
          { name: "Koshi-Shvarts tengsizligi" },
          { name: "Jensen tengsizligi" },
          { name: "Kombinatorik optimallash" },
          { name: "Muirhead va mayorizatsiya" },
        ],
      },
      {
        name: "Boshlang'ich algebra",
        children: [
          { name: "Butun sonlar" },
          { name: "Oddiy tenglamalar" },
          { name: "Kasrlar" },
          { name: "O'nlik kasrlar" },
          { name: "Boshqa" },
        ],
      },
      {
        name: "Oraliq algebra",
        children: [
          { name: "Kvadrat funksiyalar" },
          { name: "Kompleks sonlar" },
          { name: "Eksponensial funksiyalar" },
          { name: "Logarifmik funksiyalar" },
          { name: "Boshqa" },
        ],
      },
      {
        name: "Chiziqli algebra",
        children: [
          { name: "Matritsalar" },
          { name: "Vektorlar" },
          { name: "Determinantlar" },
          { name: "Chiziqli o'zgartirishlar" },
        ],
      },
      {
        name: "Abstrakt algebra",
        children: [
          { name: "O'rin almashtirishlar va asosiy guruh nazariyasi" },
          { name: "Guruh nazariyasi" },
          { name: "Halqalar nazariyasi" },
          { name: "Maydonlar nazariyasi" },
          { name: "Boshqa" },
        ],
      },
    ],
  },

  // =========================== GEOMETRIYA ===========================
  {
    name: "Geometriya",
    children: [
      {
        name: "Planimetriya",
        children: [
          {
            name: "Aralash mavzular",
            children: [
              { name: "Burchaklar" },
              { name: "Masofalar" },
              { name: "Yasashlar va geometrik o'rinlar" },
            ],
          },
          {
            name: "Uchburchaklar",
            children: [
              { name: "Uchburchak markazlari" },
              { name: "Uchburchak trigonometriyasi" },
              { name: "Uchburchak tengsizliklari" },
            ],
          },
          {
            name: "To'rtburchaklar",
            children: [
              { name: "Aylanaga chizilgan to'rtburchaklar" },
              { name: "Ichki va tashqi chizilgan to'rtburchaklar" },
              { name: "Perpendikulyar diagonali to'rtburchaklar" },
            ],
          },
          {
            name: "Aylanalar",
            children: [
              { name: "Urinmalar" },
              { name: "Radikal o'q teoremasi" },
              { name: "Koaksial aylanalar" },
              { name: "Apolloniy aylanasi" },
            ],
          },
          {
            name: "Analitik va koordinata metodlari",
            children: [
              { name: "Dekart koordinatalari" },
              { name: "Trigonometriya" },
              { name: "Vektorlar" },
              { name: "Geometriyada kompleks sonlar" },
            ],
          },
          {
            name: "Geometrik o'zgartirishlar",
            children: [
              { name: "Gomotetiya" },
              { name: "Aylanish" },
              { name: "Inversiya" },
              { name: "Spiral o'xshashlik" },
              { name: "Parallel ko'chirish" },
              { name: "Aks ettirish" },
            ],
          },
          {
            name: "Geometrik tengsizliklar",
            children: [
              { name: "Geometriyada optimallash" },
              { name: "Uchburchak tengsizliklari" },
              { name: "Jensen va silliqlash" },
            ],
          },
          {
            name: "Murakkab konfiguratsiyalar",
            children: [
              { name: "Polyar uchburchaklar va harmonik qo'shma" },
              { name: "Izogonal va izotomik qo'shma, barisentrik koordinatalar" },
              { name: "Brokar nuqtasi va simmediana" },
              { name: "Mikel nuqtasi" },
              { name: "Simson chizig'i" },
              { name: "Napoleon va Fermat nuqtalari" },
            ],
          },
          {
            name: "Kombinatorik geometriya",
            children: [
              { name: "Qavariq qobiqlar" },
              { name: "Pik teoremasi" },
              { name: "Helli teoremasi" },
              { name: "Minkovskiy teoremasi" },
              { name: "Silvestr teoremasi" },
            ],
          },
          {
            name: "Kollinearlik va konkurrentlik",
            children: [
              { name: "Cheva teoremasi" },
              { name: "Menelaus teoremasi" },
              { name: "Dezarg teoremasi" },
              { name: "Papp teoremasi" },
            ],
          },
        ],
      },
      {
        name: "Stereometriya",
        children: [
          { name: "Boshqa 3D masalalar" },
          { name: "3D shakllar" },
          { name: "Hajm" },
          { name: "Sirt yuzasi" },
        ],
      },
      {
        name: "Noevklid geometriya",
        children: [
          { name: "Sferik geometriya" },
          { name: "Giperbolik geometriya" },
        ],
      },
      {
        name: "Differensial geometriya",
        children: [
          { name: "Ko'pburchakli ko'rinishlar" },
          { name: "Egrilik" },
        ],
      },
    ],
  },

  // ======================= SONLAR NAZARIYASI =======================
  {
    name: "Sonlar nazariyasi",
    children: [
      {
        name: "Bo'linish va faktorlash",
        children: [
          { name: "Faktorlash usullari" },
          { name: "Tub sonlar" },
          { name: "Eng katta umumiy bo'luvchi (EKUB)" },
          { name: "Eng kichik umumiy karrali (EKUK)" },
        ],
      },
      {
        name: "Diofant tenglamalari",
        children: [
          { name: "Diofant tahlil usullari" },
          { name: "Cheksiz pasayish va ildiz aylantirish" },
          { name: "Pell tenglamalari" },
          { name: "Pifagor uchliklari" },
        ],
      },
      {
        name: "Modular arifmetika",
        children: [
          { name: "Ferma, Eyler va Vilson teoremalari" },
          { name: "Modul bo'yicha teskari elementlar" },
          { name: "Xitoy qoldiqlar teoremasi" },
          { name: "Modul bo'yicha ko'phadlar" },
        ],
      },
      { name: "Boshqa" },
      {
        name: "Qoldiqlar va boshlang'ich ildizlar",
        children: [
          { name: "Ko'paytirma tartibi" },
          { name: "Kvadrat qoldiqlar" },
          { name: "Boshlang'ich ildizlar" },
          { name: "Kvadrat o'zaro munosabat" },
        ],
      },
      {
        name: "Sonlar-nazariy funksiyalar",
        children: [
          { name: "τ (bo'luvchilar soni)" },
          { name: "φ (Eyler totienti)" },
          { name: "σ (bo'luvchilar yig'indisi)" },
          { name: "Möbius inversiyasi" },
        ],
      },
      {
        name: "Algebraik sonlar nazariyasi",
        children: [
          { name: "Kvadrat shakllar" },
          { name: "Kvadrat maydonlar" },
          { name: "Algebraik sonlar" },
          { name: "Yagona faktorlash" },
          { name: "Kombinatorik sonlar nazariyasi" },
        ],
      },
    ],
  },

  // ====================== DISKRET MATEMATIKA ======================
  {
    name: "Diskret matematika",
    children: [
      {
        name: "Kombinatorika",
        children: [
          { name: "Bo'yash sxemalari va ekstremal argumentlar" },
          { name: "Invariantlar va monovariantlar" },
          { name: "Ikki yo'l bilan sanash" },
          { name: "Induksiya va silliqlash" },
          { name: "Dirixle prinsipi" },
          { name: "O'yinlar va ochko'z algoritmlar" },
          { name: "Rekursiya va biyeksiya" },
          { name: "Simmetriyali sanash" },
          { name: "Binomial koeffitsientlarning algebraik xossalari" },
          { name: "Qo'shish-ayirish prinsipi" },
          { name: "Kutilayotgan qiymatlar" },
          { name: "Generatsiya funksiyalari" },
          { name: "Katalan sonlari va bo'linishlar" },
          { name: "Funksional tenglamalar" },
        ],
      },
      {
        name: "Graf nazariyasi",
        children: [
          { name: "Mosliklar, nikoh lemmasi, Tutte teoremasi" },
          { name: "Eyler xarakteristikasi (V-E+F)" },
          { name: "Turan teoremasi" },
          { name: "Menger teoremasi va maks-oqim min-kesim" },
        ],
      },
      { name: "Boshqa" },
      { name: "Algoritmlar" },
      { name: "Mantiq" },
    ],
  },
];

async function main() {
  // Snapshot all codes once so the seeder can compute the next sequence
  // locally without a per-row roundtrip.
  const existing = await db
    .select({ code: topics.code })
    .from(topics);
  const allCodes = existing.map((r) => r.code);

  let inserted = 0;
  let skipped = 0;

  async function findChild(
    parentId: string | null,
    name: string
  ): Promise<string | null> {
    const lower = name.toLowerCase();
    const where = parentId
      ? eq(topics.parentId, parentId)
      : isNull(topics.parentId);
    const rows = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(where);
    const hit = rows.find((r) => r.name.toLowerCase() === lower);
    return hit?.id ?? null;
  }

  async function walk(nodes: Node[], parentId: string | null, depth: number) {
    for (const node of nodes) {
      const existingId = await findChild(parentId, node.name);
      let nodeId: string;
      if (existingId) {
        nodeId = existingId;
        skipped++;
        console.log(`${"  ".repeat(depth)}· ${node.name} (mavjud)`);
      } else {
        const code = nextTopicCode(allCodes);
        allCodes.push(code);
        const [row] = await db
          .insert(topics)
          .values({ name: node.name, code, parentId, description: null })
          .returning({ id: topics.id });
        nodeId = row.id;
        inserted++;
        console.log(`${"  ".repeat(depth)}+ ${code} ${node.name}`);
      }
      if (node.children?.length) {
        await walk(node.children, nodeId, depth + 1);
      }
    }
  }

  await walk(TREE, null, 0);

  console.log("");
  console.log(
    `Done. Inserted ${inserted} topics, skipped ${skipped} already in place.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
