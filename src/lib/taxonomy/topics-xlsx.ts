import "server-only";

import ExcelJS from "exceljs";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/schema";
import { TOPIC_CODE_REGEX } from "./topic-codes";

/** Per-row shape after raw parsing. parentCode is null for root rows. */
export interface ParsedRow {
  /** 1-based Excel row number (header is 1, first data row is 2). */
  excelRow: number;
  name: string;
  parentCode: string | null;
  description: string | null;
}

export interface ParsedBundle {
  rows: ParsedRow[];
  bundleErrors: string[];
}

/** Row after validation, with resolved parentId (UUID) when applicable. */
export interface ValidatedRow {
  excelRow: number;
  name: string;
  parentCode: string | null;
  parentId: string | null;
  description: string | null;
  status: "ok" | "error";
  errors: string[];
}

export interface ValidationReport {
  bundleErrors: string[];
  rows: ValidatedRow[];
  okCount: number;
  errorCount: number;
}

export const MAX_ROWS = 500;
export const MAX_NAME_LEN = 100;
export const MAX_DESCRIPTION_LEN = 1000;
export const REQUIRED_HEADERS = ["name", "parent_id", "description"] as const;

export async function parseTopicsXlsx(
  bytes: Uint8Array
): Promise<ParsedBundle> {
  const bundleErrors: string[] = [];
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs .load() expects a Node.js Buffer; double-cast to satisfy stale typings.
    await workbook.xlsx.load(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as any
    );
  } catch {
    return { rows: [], bundleErrors: ["XLSX fayl o'qib bo'lmadi"] };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], bundleErrors: ["Faylda hech qanday sheet topilmadi"] };
  }

  const headerRow = sheet.getRow(1);
  const headerToCol = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const raw = cell.value;
    if (typeof raw === "string") {
      headerToCol.set(raw.trim().toLowerCase(), col);
    }
  });

  for (const required of REQUIRED_HEADERS) {
    if (!headerToCol.has(required)) {
      bundleErrors.push(`Header topilmadi: ${required}`);
    }
  }
  if (bundleErrors.length > 0) {
    return { rows: [], bundleErrors };
  }

  const nameCol = headerToCol.get("name")!;
  const parentCol = headerToCol.get("parent_id")!;
  const descCol = headerToCol.get("description")!;

  const rows: ParsedRow[] = [];
  // exceljs row numbers are 1-based; row 1 is the header.
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const nameRaw = cellToString(row.getCell(nameCol).value);
    const parentRaw = cellToString(row.getCell(parentCol).value);
    const descRaw = cellToString(row.getCell(descCol).value);

    const name = nameRaw.trim();
    const parentTrim = parentRaw.trim();
    const description = descRaw.trim();

    // Treat fully blank rows as absent — Excel often pads trailing rows.
    if (name === "" && parentTrim === "" && description === "") continue;

    const parentCode =
      parentTrim === "" || parentTrim === "0" ? null : parentTrim;

    rows.push({
      excelRow: r,
      name,
      parentCode,
      description: description === "" ? null : description,
    });
  }

  if (rows.length === 0) {
    bundleErrors.push("Faylda hech qanday qator topilmadi");
  } else if (rows.length > MAX_ROWS) {
    bundleErrors.push(
      `Maksimum ${MAX_ROWS} qator. Faylda ${rows.length} qator bor.`
    );
  }

  return { rows, bundleErrors };
}

export async function validateTopicsBundle(
  _parsed: ParsedBundle
): Promise<ValidationReport> {
  throw new Error("not implemented");
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // exceljs sometimes returns { richText: [...] } or { result: ... } for formulas.
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text ?? "").join("");
    }
    if ("result" in value && value.result != null) {
      return String(value.result);
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
  }
  return "";
}
