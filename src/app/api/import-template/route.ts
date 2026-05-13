import JSZip from "jszip";
import { requireAdmin } from "@/lib/auth";

/**
 * Returns a minimal v1 import bundle as a ZIP. Admin-only — the template
 * isn't sensitive, but the upload page itself is admin-only so this lives
 * behind the same gate to keep the surface area consistent.
 */
export async function GET() {
  await requireAdmin();

  const zip = new JSZip();

  zip.file(
    "manifest.yaml",
    `# Batch-level defaults (har bir masala uchun, agar frontmatter da
# qayta belgilanmagan bo'lsa, ushbu qiymatlar qo'llaniladi).
batch_name: "Namuna to'plam"
defaults:
  source: namuna
  year: 2024
  # Aniq bitta sinf — admin paneldagi yagona-tanlov bilan mos.
  classes: [10]
`
  );

  zip.file(
    "problems.md",
    `---
source: namuna
year: 2024
problem_number: "1"
classes: [10]
topics: ["Algebra"]
---

# Shart

Barcha musbat butun sonlar $n$ ni topingki, $n^2 + 1$ soni $n + 1$ ga
bo'linsin.

---

source: namuna
year: 2024
problem_number: "2"
classes: [9]
topics: ["Geometriya"]
answer: "AB = AC"
---

# Shart

$ABC$ uchburchakka ichki chizilgan aylana $BC$ tomonga $D$ nuqtada
tegadi.

![Uchburchak chizmasi](images/namuna-2.png)

Isbotlangki, $AD$ kesma $\\angle BAC$ burchakni teng ikkiga bo'ladi,
agar va faqat agar $AB = AC$ bo'lsa.
`
  );

  zip.file(
    "images/README.txt",
    `Barcha rasm fayllarini shu papkaga joylang.

Qo'llaniladigan formatlar: PNG, JPG, GIF, WebP, SVG.
Har bir rasm uchun maksimal hajm: 5 MB.

Markdown ichidan rasmga murojaat:
  ![Tavsif](images/fayl-nomi.png)

Fayl nomida bo'sh joy, kirilcha yoki maxsus belgi bo'lmasligi kerak.
`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="provia-import-template.zip"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
