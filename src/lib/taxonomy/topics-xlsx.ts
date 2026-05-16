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
    // exceljs declares its own Buffer as "extends ArrayBuffer", so pass a plain ArrayBuffer.
    // Buffer.from(bytes) copies the Uint8Array and its .buffer is typed as ArrayBuffer.
    await workbook.xlsx.load(Buffer.from(bytes).buffer);
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
  parsed: ParsedBundle
): Promise<ValidationReport> {
  // Bundle errors fail the whole file before we touch the DB.
  if (parsed.bundleErrors.length > 0 || parsed.rows.length === 0) {
    return {
      bundleErrors: parsed.bundleErrors,
      rows: [],
      okCount: 0,
      errorCount: 0,
    };
  }

  // Resolve all referenced parent codes in one DB round-trip.
  const referencedCodes = Array.from(
    new Set(
      parsed.rows
        .map((r) => r.parentCode)
        .filter((c): c is string => c != null && TOPIC_CODE_REGEX.test(c))
    )
  );

  const existingParents = referencedCodes.length
    ? await db
        .select({ id: topics.id, code: topics.code })
        .from(topics)
        .where(inArray(topics.code, referencedCodes))
    : [];
  const parentIdByCode = new Map<string, string>(
    existingParents.map((p) => [p.code, p.id])
  );

  // Build the set of (lower(name), parent_id) pairs we'd be inserting.
  // We need the resolved parent UUID (or null for root) to compare against DB.
  type Key = string; // `lower(name)|<uuid-or-NULL>`
  const keyFor = (lowerName: string, parentId: string | null): Key =>
    `${lowerName}|${parentId ?? "NULL"}`;

  // Track in-file dupes by key.
  const inFileSeen = new Map<Key, number[]>();

  // First pass: catch format / length / missing-parent / in-file dup keys.
  const interim: ValidatedRow[] = parsed.rows.map((row) => {
    const errors: string[] = [];

    if (row.name === "") {
      errors.push("Nomi bo'sh");
    } else if (row.name.length > MAX_NAME_LEN) {
      errors.push(`Nomi ${MAX_NAME_LEN} belgidan oshmasligi kerak`);
    }

    let parentId: string | null = null;
    if (row.parentCode == null) {
      parentId = null;
    } else if (!TOPIC_CODE_REGEX.test(row.parentCode)) {
      errors.push("parent_id formati noto'g'ri (0 yoki T###### kutilgan)");
    } else {
      const resolved = parentIdByCode.get(row.parentCode);
      if (!resolved) {
        errors.push(`Bunday parent topilmadi: ${row.parentCode}`);
      } else {
        parentId = resolved;
      }
    }

    if (
      row.description != null &&
      row.description.length > MAX_DESCRIPTION_LEN
    ) {
      errors.push(
        `Ta'rif ${MAX_DESCRIPTION_LEN} belgidan oshmasligi kerak`
      );
    }

    return {
      excelRow: row.excelRow,
      name: row.name,
      parentCode: row.parentCode,
      parentId,
      description: row.description,
      status: errors.length === 0 ? "ok" : "error",
      errors,
    };
  });

  // Second pass: mark in-file duplicates. Only consider rows that have a
  // name and a resolved parent (or null root); other rows are already
  // errored out and skipping them avoids spurious "dublikat" noise.
  for (const r of interim) {
    if (r.name === "") continue;
    if (r.parentCode != null && r.parentId == null) continue;
    const key = keyFor(r.name.toLowerCase(), r.parentId);
    const list = inFileSeen.get(key) ?? [];
    list.push(r.excelRow);
    inFileSeen.set(key, list);
  }
  for (const [, list] of inFileSeen) {
    if (list.length > 1) {
      for (const excelRow of list) {
        const r = interim.find((x) => x.excelRow === excelRow)!;
        r.errors.push("Fayl ichida dublikat");
        r.status = "error";
      }
    }
  }

  // Third pass: cross-check against DB. Build the candidate (lower-name,
  // parent_id) pairs from rows that are still ok.
  const candidatePairs: Array<{ nameLower: string; parentId: string | null }> =
    [];
  for (const r of interim) {
    if (r.status !== "ok") continue;
    candidatePairs.push({
      nameLower: r.name.toLowerCase(),
      parentId: r.parentId,
    });
  }

  if (candidatePairs.length > 0) {
    // Postgres can't compare (text, uuid) tuples mixed with NULLs via IN.
    // Split into two queries: rows with a parent, and root rows.
    const withParent = candidatePairs.filter((p) => p.parentId != null);
    const rootOnes = candidatePairs.filter((p) => p.parentId == null);

    const hits = new Set<Key>();

    if (withParent.length > 0) {
      // Build a VALUES clause using individual scalar params — avoids the
      // postgres-js limitation where passing a JS array through drizzle's
      // sql template results in a malformed array literal on the wire.
      // Each pair becomes a properly-parameterized row.
      const valueChunks = withParent.map(
        (p) => sql`(${p.nameLower}::text, ${p.parentId as string}::uuid)`
      );
      const valuesClause = sql.join(valueChunks, sql`, `);
      const rows = (await db.execute(
        sql`
          SELECT lower(${topics.name}) AS name_lower,
                 ${topics.parentId}::text AS parent_id
          FROM ${topics}
          WHERE (lower(${topics.name}), ${topics.parentId}) IN (
            VALUES ${valuesClause}
          )
        `
      )) as unknown as Array<{ name_lower: string; parent_id: string }>;
      for (const row of rows) {
        hits.add(keyFor(row.name_lower, row.parent_id));
      }
    }

    if (rootOnes.length > 0) {
      // Use individual scalar params joined into an IN list — avoids JS
      // array serialization issues with postgres-js.
      const nameChunks = rootOnes.map((p) => sql`${p.nameLower}`);
      const inList = sql.join(nameChunks, sql`, `);
      const rows = (await db.execute(
        sql`
          SELECT lower(${topics.name}) AS name_lower
          FROM ${topics}
          WHERE ${topics.parentId} IS NULL
            AND lower(${topics.name}) IN (${inList})
        `
      )) as unknown as Array<{ name_lower: string }>;
      for (const row of rows) {
        hits.add(keyFor(row.name_lower, null));
      }
    }

    for (const r of interim) {
      if (r.status !== "ok") continue;
      const key = keyFor(r.name.toLowerCase(), r.parentId);
      if (hits.has(key)) {
        r.errors.push("Bazada allaqachon bor");
        r.status = "error";
      }
    }
  }

  let okCount = 0;
  let errorCount = 0;
  for (const r of interim) {
    if (r.status === "ok") okCount += 1;
    else errorCount += 1;
  }

  return {
    bundleErrors: [],
    rows: interim,
    okCount,
    errorCount,
  };
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
