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
  _bytes: Uint8Array
): Promise<ParsedBundle> {
  throw new Error("not implemented");
}

export async function validateTopicsBundle(
  _parsed: ParsedBundle
): Promise<ValidationReport> {
  throw new Error("not implemented");
}
