// Build a small sample ZIP at docs/examples/sample-batch.zip with 5
// problems matching the v2 format. Images are referenced but not bundled
// — the user drops them into images/ themselves and re-zips.
//
// Run: npx tsx scripts/build-sample-zip.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";

const PROBLEMS_MD = `---
source: S000005
age_categories: [A000011]
topics: [T000003]
---

# Shart

Barcha musbat butun sonlar $n$ ni topingki, $n^2 + 1$ soni $n + 1$ ga
qoldiqsiz bo'linsin.

---

source: S000005
age_categories: [A000010, A000011]
topics: [T000001, T000005]
---

# Shart

$a, b, c$ musbat haqiqiy sonlar bo'lib, $abc = 1$ shartni qanoatlantiradi.
Quyidagini isbotlang:

$$\\frac{1}{a} + \\frac{1}{b} + \\frac{1}{c} \\geq a + b + c$$

---

source: S000007
age_categories: [A000009]
topics: [T000002]
---

# Shart

$ABC$ uchburchakka ichki chizilgan aylana $BC$ tomonga $D$ nuqtada,
$CA$ tomonga $E$ nuqtada va $AB$ tomonga $F$ nuqtada tegadi. Isbotlangki,
$AD$, $BE$ va $CF$ kesmalar bitta nuqtada kesishadi.

![Uchburchakka chizilgan ichki aylana](images/problem-3.png)

---

source: S000006
age_categories: [A000011]
topics: [T000004]
---

# Shart

$8 \\times 8$ shaxmat doskasidan ikkita qarama-qarshi burchak katakchasi
olib tashlangan. Qolgan $62$ ta katakni $1 \\times 2$ o'lchamli domino
toshlari bilan to'liq qoplash mumkinmi? Javobni asoslang.

![Shaxmat doskasidan ikkita katak olib tashlangan](images/problem-4.png)

---

source: S000008
age_categories: [A000007, A000008]
topics: [T000001]
---

# Shart

Tenglamani yeching:

$$x^2 - 5x + 6 = 0$$

Yechimlarning yig'indisi va ko'paytmasi Viet teoremasiga mos kelishini
tekshiring.
`;

const IMAGES_README = `Shu papkaga rasm fayllarini joylang.

Hozirgi problems.md quyidagilarni izlaydi:
  - problem-3.png  (3-masala: uchburchakka chizilgan ichki aylana)
  - problem-4.png  (4-masala: shaxmat doskasi)

Qo'llab-quvvatlanadigan formatlar: PNG, JPG, GIF, WebP, SVG.
Har bir rasm uchun maksimal hajm: 5 MB.

Eslatma: har bir masalada eng ko'pi bilan 1 ta rasm bo'lishi mumkin.
`;

async function main() {
  const zip = new JSZip();
  zip.file("problems.md", PROBLEMS_MD);
  zip.file("images/README.txt", IMAGES_README);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const outPath = resolve(
    __dirname,
    "..",
    "docs",
    "examples",
    "sample-batch.zip"
  );
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
