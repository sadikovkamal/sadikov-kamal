import { z } from "zod";

/**
 * Shared types and runtime validators for the Print feature.
 *
 * This module is pure — no React, no DB, no I/O. Every other Print-feature
 * module (server actions, dialog, docx generator, preview) imports its
 * config and problem shapes from here.
 */

// ---------------------------------------------------------------------------
// PrintConfig
// ---------------------------------------------------------------------------

/**
 * User-tweakable knobs that drive both the live HTML preview and the
 * generated .docx worksheet. See `docs/superpowers/specs/2026-05-25-print-
 * feature-design.md` Part 3 for the rationale behind each field.
 */
export interface PrintConfig {
  /** Document title at the top of page 1. Empty string = no title block. */
  title: string;
  fontSize: 10 | 11 | 12 | 14;
  /** Word multiplies single-line height by this value. */
  lineHeight: 1.0 | 1.15 | 1.5;
  /** Maps to 1.27cm / 2.54cm / 3.18cm at docx-build time. */
  margins: "narrow" | "normal" | "wide";
  /** "1." / "1)" / "Masala 1." */
  numberStyle: "dot" | "paren" | "masala";
  showFields: {
    code: boolean;
    source: boolean;
    topics: boolean;
    ageCategories: boolean;
    methods: boolean;
  };
}

/**
 * Clean handout defaults — no title, no metadata, body only. The dialog
 * initialises its local config state from this constant on every open.
 */
export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  title: "",
  fontSize: 12,
  lineHeight: 1.15,
  margins: "normal",
  numberStyle: "dot",
  showFields: {
    code: false,
    source: false,
    topics: false,
    ageCategories: false,
    methods: false,
  },
};

// ---------------------------------------------------------------------------
// PrintProblem
// ---------------------------------------------------------------------------

/**
 * Server-loaded problem shape consumed by both the preview and the docx
 * generator. `storageKey` is the R2 object key (used by the server-side
 * docx generator to fetch image bytes directly through the S3 client);
 * `url` is the public CDN URL (used by the HTML preview to render the
 * image in the browser). Carrying both keeps neither path responsible
 * for deriving the other.
 */
export interface PrintProblem {
  id: string;
  /** Stable display code, e.g. "P0000123". */
  code: string;
  /** Full markdown — no truncation. */
  bodyMd: string;
  images: { storageKey: string; url: string; altText: string | null }[];
  source: { code: string; name: string } | null;
  topics: { code: string; name: string }[];
  ageCategories: { code: string; name: string }[];
  methods: { code: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Runtime validator for `PrintConfig`. Enums are modelled as `z.literal`
 * unions so the inferred type stays strict (matches the interface). The
 * outer object is `.strict()` — unknown keys reject, which protects the
 * server action from stale/forged clients.
 */
export const printConfigSchema = z
  .object({
    title: z.string().trim().max(200),
    fontSize: z.union([
      z.literal(10),
      z.literal(11),
      z.literal(12),
      z.literal(14),
    ]),
    lineHeight: z.union([z.literal(1.0), z.literal(1.15), z.literal(1.5)]),
    margins: z.union([
      z.literal("narrow"),
      z.literal("normal"),
      z.literal("wide"),
    ]),
    numberStyle: z.union([
      z.literal("dot"),
      z.literal("paren"),
      z.literal("masala"),
    ]),
    showFields: z
      .object({
        code: z.boolean(),
        source: z.boolean(),
        topics: z.boolean(),
        ageCategories: z.boolean(),
        methods: z.boolean(),
      })
      .strict(),
  })
  .strict();

/** Runtime validator for `PrintProblem`. */
export const printProblemSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    bodyMd: z.string(),
    images: z.array(
      z
        .object({
          storageKey: z.string(),
          url: z.string(),
          altText: z.union([z.string(), z.null()]),
        })
        .strict(),
    ),
    source: z.union([
      z
        .object({
          code: z.string(),
          name: z.string(),
        })
        .strict(),
      z.null(),
    ]),
    topics: z.array(
      z.object({ code: z.string(), name: z.string() }).strict(),
    ),
    ageCategories: z.array(
      z.object({ code: z.string(), name: z.string() }).strict(),
    ),
    methods: z.array(
      z.object({ code: z.string(), name: z.string() }).strict(),
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Compile-time drift guard
// ---------------------------------------------------------------------------

// If the Zod schema ever drifts from the interface (e.g. someone adds a
// field to one but not the other) these assignments stop type-checking
// and `npx tsc --noEmit` fails. Cheap insurance.
const _checkConfig: PrintConfig = {} as z.infer<typeof printConfigSchema>;
const _checkProblem: PrintProblem = {} as z.infer<typeof printProblemSchema>;
void _checkConfig;
void _checkProblem;
