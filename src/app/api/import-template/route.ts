import JSZip from "jszip";
import { requireAdmin } from "@/lib/auth";

// Route uses cookies() via requireAdmin and must never be statically
// prerendered. Force the Node.js runtime because JSZip uses Buffer.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns a minimal v2 import bundle as a ZIP. Admin-only — the template
 * isn't sensitive, but the upload page itself is admin-only so this lives
 * behind the same gate to keep the surface area consistent.
 *
 * Codes used in the sample (S000001, A000001, T000001) are placeholders.
 * Admins are expected to replace them with real codes from
 * `/admin/sources`, `/admin/age-categories`, `/admin/topics`.
 */
export async function GET() {
  await requireAdmin();

  const zip = new JSZip();

  zip.file(
    "problems.md",
    `---
source: S000001
age_categories: [A000001]
topics: [T000001]
---

# Shart

Barcha musbat butun sonlar $n$ ni topingki, $n^2 + 1$ soni $n + 1$ ga
bo'linsin.

---

source: S000001
age_categories: [A000001, A000002]
topics: [T000001, T000002]
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
Har bir masalada eng ko'pi bilan 1 ta rasm bo'lishi mumkin.

Markdown ichidan rasmga murojaat:
  ![Tavsif](images/fayl-nomi.png)

Fayl nomida bo'sh joy, kirilcha yoki maxsus belgi bo'lmasligi kerak.
`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="sadikov-kamal-import-template.zip"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
