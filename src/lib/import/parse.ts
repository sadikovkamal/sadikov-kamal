import JSZip from "jszip";
import matter from "gray-matter";
import { BUNDLE_LIMITS } from "./schema";

export interface ParsedProblem {
  /** 1-indexed position in the batch — used for error reporting. */
  index: number;
  /** Filename it came from, e.g. "problems.md (block 3)" or "problems/p001.md". */
  sourcePath: string;
  /** Raw YAML object before validation. May be null if frontmatter parse failed. */
  rawFrontmatter: Record<string, unknown> | null;
  /** Markdown between # Shart and end of document. */
  bodyMd: string;
  /** Image filenames referenced in body, relative to images/. */
  imageRefs: string[];
}

export interface ParsedBundle {
  problems: ParsedProblem[];
  /** All entries under images/ found in the ZIP (filename → bytes). */
  images: Map<string, Uint8Array>;
  /** Errors at the bundle level, before per-problem validation. */
  bundleErrors: string[];
}

/**
 * Parse a ZIP bundle into a structured shape. Pure function (no DB, no R2).
 *
 * The v2 layout is intentionally minimal:
 *
 *   my-batch.zip
 *   ├── problems.md   (or problems/*.md)
 *   └── images/
 *       └── *.png
 *
 * There is no manifest.yaml in v2 — every taxonomy reference is an
 * explicit stable code in each problem's frontmatter (validate.ts
 * resolves them against the DB).
 */
export async function parseBundle(zipBytes: Uint8Array): Promise<ParsedBundle> {
  const bundleErrors: string[] = [];

  if (zipBytes.byteLength > BUNDLE_LIMITS.maxBytes) {
    return emptyBundle([
      `Bundle exceeds ${BUNDLE_LIMITS.maxBytes / 1024 / 1024} MB limit (got ${
        Math.round(zipBytes.byteLength / 1024 / 1024)
      } MB)`,
    ]);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (e) {
    return emptyBundle([
      `Cannot open ZIP: ${e instanceof Error ? e.message : "unknown error"}`,
    ]);
  }

  // 1. Images — anything under images/ at the root, no subdirectories.
  //    No per-image cap: the bundle-wide maxBytes already bounds the
  //    largest possible image to the ZIP size.
  const images = new Map<string, Uint8Array>();
  const imageEntries = zip.file(/^images\/[^/]+$/);
  for (const entry of imageEntries) {
    const filename = entry.name.replace(/^images\//, "");
    const bytes = await entry.async("uint8array");
    images.set(filename, bytes);
  }

  // 2. Problems — exactly one of problems.md or problems/*.md.
  const singleFile = zip.file("problems.md");
  const dirEntries = zip.file(/^problems\/[^/]+\.md$/);

  if (singleFile && dirEntries.length > 0) {
    bundleErrors.push(
      "Bundle contains both problems.md and problems/*.md — pick one layout"
    );
    return { problems: [], images, bundleErrors };
  }

  const problems: ParsedProblem[] = [];

  if (singleFile) {
    const text = await singleFile.async("string");
    const blocks = splitProblemBlocks(text);
    blocks.forEach((block, i) => {
      const parsed = parseProblemMarkdown(
        block,
        `problems.md (#${i + 1})`,
        i + 1
      );
      if (parsed) problems.push(parsed);
    });
  } else if (dirEntries.length > 0) {
    const sorted = [...dirEntries].sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]!;
      const text = await entry.async("string");
      const parsed = parseProblemMarkdown(text, entry.name, i + 1);
      if (parsed) problems.push(parsed);
    }
  } else {
    bundleErrors.push(
      "Bundle must contain either problems.md or problems/*.md"
    );
  }

  if (problems.length > BUNDLE_LIMITS.maxProblems) {
    bundleErrors.push(
      `Bundle has ${problems.length} problems, max is ${BUNDLE_LIMITS.maxProblems}`
    );
  }

  return { problems, images, bundleErrors };
}

function emptyBundle(bundleErrors: string[]): ParsedBundle {
  return { problems: [], images: new Map(), bundleErrors };
}

/**
 * Split a multi-problem `problems.md` into individual problem blocks.
 *
 * A line containing exactly `---` opens a frontmatter when we're not
 * already inside one, and closes it when we are. The opening `---`
 * also implicitly marks the start of a new problem block — the lines
 * accumulated so far belong to the previous block.
 */
export function splitProblemBlocks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  let inFm = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFm) {
        if (current.some((l) => l.trim())) {
          blocks.push(current.join("\n"));
        }
        current = [line];
        inFm = true;
      } else {
        current.push(line);
        inFm = false;
      }
    } else {
      current.push(line);
    }
  }

  if (current.some((l) => l.trim())) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

function parseProblemMarkdown(
  text: string,
  sourcePath: string,
  index: number
): ParsedProblem | null {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(text);
  } catch {
    return {
      index,
      sourcePath,
      rawFrontmatter: null,
      bodyMd: text.trim(),
      imageRefs: [],
    };
  }

  const rawFrontmatter =
    parsed.data && typeof parsed.data === "object"
      ? (parsed.data as Record<string, unknown>)
      : null;

  const bodyMd = extractShartBody(parsed.content);
  const imageRefs = extractImageRefs(parsed.content);

  return {
    index,
    sourcePath,
    rawFrontmatter,
    bodyMd,
    imageRefs,
  };
}

/**
 * Cut the markdown body at the top-level `# Shart` heading and return
 * everything after it.
 *
 * v2 dropped solution import, so there's no `# Yechim` handling — the
 * body runs to the end of the document. If `# Shart` is missing, the
 * validator surfaces the empty body as an error.
 */
export function extractShartBody(content: string): string {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+Shart\b/i.test((lines[i] ?? "").trim())) {
      return lines.slice(i + 1).join("\n").trim();
    }
  }
  return "";
}

/**
 * Pull every `images/<name>` reference from a markdown body. Used both
 * for validation (every ref must be present in the bundle and per
 * problem there's at most one) and for rewriting at execute time.
 */
export function extractImageRefs(content: string): string[] {
  const refs: string[] = [];
  const regex = /!\[[^\]]*\]\(images\/([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    refs.push(m[1]!);
  }
  return refs;
}
