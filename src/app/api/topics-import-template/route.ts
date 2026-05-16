import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";

// Generated on every request so the template stays in sync with the
// import contract; the file is tiny so caching isn't worth the staleness
// risk. exceljs uses Buffer → force the Node runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns a starter `.xlsx` for the topics importer. Admin-only — matches
 * the gating on `/admin/topics`. Two example rows show both a root entry
 * and a child under an existing parent code; admins replace them.
 */
export async function GET() {
  await requireAdmin();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mavzular");
  sheet.columns = [
    { header: "name", key: "name", width: 40 },
    { header: "parent_id", key: "parent_id", width: 16 },
    { header: "description", key: "description", width: 60 },
  ];
  sheet.addRow({
    name: "Misol: Geometriya",
    parent_id: 0,
    description: "Yangi root mavzu",
  });
  sheet.addRow({
    name: "Misol: Uchburchaklar",
    parent_id: "T000001",
    description: "Mavjud T000001 ostiga bola",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="mavzular-namuna.xlsx"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
