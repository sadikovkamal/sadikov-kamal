import JSZip from "jszip";
import matter from "gray-matter";
import yaml from "js-yaml";
import { manifestSchema, BUNDLE_LIMITS, type Manifest } from "./schema";

export interface ParsedProblem {
  /** 1-indexed position in the batch — used for error reporting. */
  index: number;
  /** Filename it came from, e.g. "problems.md (block 3)" or "problems/p001.md". */
  sourcePath: string;
  /** Raw YAML object before validation. May be null if frontmatter parse failed. */
  rawFrontmatter: Record<string, unknown> | null;
  /** Markdown between # Shart and the next top-level heading. */
  bodyMd: string;
  /** Markdown after # Yechim, or null if no Yechim heading. */
  solutionMd: string | null;
  /** Image filenames referenced in body/solution, relative to images/. */
  imageRefs: string[];
}

export interface ParsedBundle {
  manifest: Manifest | null;
  problems: ParsedProblem[];
  /** All entries under images/ found in the ZIP (filename → bytes). */
  images: Map<string, Uint8Array>;
  /** Errors at the bundle level, before per-problem validation. */
  bundleErrors: string[];
}

/**
 * Parse a ZIP bundle into a structured shape. Pure function (no DB, no R2).
 * Bundle-level rejections (oversize, broken zip, missing problems entry)
 * surface in `bundleErrors`. Per-problem issues are deferred to `validate.ts`.
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

  // 1. Manifest (optional)
  let manifest: Manifest | null = null;
  const manifestFile = zip.file("manifest.yaml") ?? zip.file("manifest.yml");
  if (manifestFile) {
    try {
      const text = await manifestFile.async("string");
      const raw = yaml.load(text);
      const parsed = manifestSchema.safeParse(raw);
      if (parsed.success) {
        manifest = parsed.data;
      } else {
        bundleErrors.push(
          `manifest.yaml invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
        );
      }
    } catch (e) {
      bundleErrors.push(
        `manifest.yaml unreadable: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // 2. Images — anything under images/ at the root, no subdirectories.
  const images = new Map<string, Uint8Array>();
  const imageEntries = zip.file(/^images\/[^/]+$/);
  for (const entry of imageEntries) {
    const filename = entry.name.replace(/^images\//, "");
    const bytes = await entry.async("uint8array");
    if (bytes.byteLength > BUNDLE_LIMITS.maxImageBytes) {
      bundleErrors.push(
        `Image too large: images/${filename} (${bytes.byteLength} bytes, max ${BUNDLE_LIMITS.maxImageBytes})`
      );
      continue;
    }
    images.set(filename, bytes);
  }

  // 3. Problems — exactly one of problems.md or problems/*.md.
  const singleFile = zip.file("problems.md");
  const dirEntries = zip.file(/^problems\/[^/]+\.md$/);

  if (singleFile && dirEntries.length > 0) {
    bundleErrors.push(
      "Bundle contains both problems.md and problems/*.md — pick one layout"
    );
    return { manifest, problems: [], images, bundleErrors };
  }

  const problems: ParsedProblem[] = [];

  if (singleFile) {
    const text = await singleFile.async("string");
    const blocks = splitProblemBlocks(text);
    blocks.forEach((block, i) => {
      const parsed = parseProblemMarkdown(
        block,
        `problems.md (block ${i + 1})`,
        i + 1
      );
      if (parsed) problems.push(parsed);
    });
  } else if (dirEntries.length > 0) {
    const sorted = [...dirEntries].sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < sorted.length; i++) {
      const text = await sorted[i].async("string");
      const parsed = parseProblemMarkdown(text, sorted[i].name, i + 1);
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

  return { manifest, problems, images, bundleErrors };
}

function emptyBundle(bundleErrors: string[]): ParsedBundle {
  return { manifest: null, problems: [], images: new Map(), bundleErrors };
}

/**
 * Split a multi-problem `problems.md` into individual problem blocks.
 *
 * Per the format spec: a line containing exactly `---` ALWAYS opens a
 * frontmatter (when we're not already inside one) — it serves double
 * duty as both the separator between problems and the opener of the
 * next problem's YAML frontmatter. The closing `---` of a frontmatter
 * is the only `---` that doesn't start a new block.
 *
 * Edge cases:
 * - Document begins with `---`: treated as opener of block 1.
 * - Trailing body with no final separator: emitted as the last block.
 * - Leading non-frontmatter text (rare): kept as a leading block — the
 *   per-problem parser will then surface a "missing frontmatter" error
 *   rather than silently dropping content.
 */
export function splitProblemBlocks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  let inFm = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFm) {
        // Opening a frontmatter. Anything currently in `current`
        // belonged to the previous block — flush it.
        if (current.some((l) => l.trim())) {
          blocks.push(current.join("\n"));
        }
        current = [line];
        inFm = true;
      } else {
        // Closing the frontmatter we're inside.
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
    // Frontmatter unreadable — return a stub so the validator surfaces it.
    return {
      index,
      sourcePath,
      rawFrontmatter: null,
      bodyMd: text.trim(),
      solutionMd: null,
      imageRefs: [],
    };
  }

  const rawFrontmatter =
    parsed.data && typeof parsed.data === "object"
      ? (parsed.data as Record<string, unknown>)
      : null;

  const { bodyMd, solutionMd } = splitBodyAndSolution(parsed.content);
  const imageRefs = extractImageRefs(parsed.content);

  return {
    index,
    sourcePath,
    rawFrontmatter,
    bodyMd,
    solutionMd,
    imageRefs,
  };
}

/**
 * Cut the markdown body at top-level `# Shart` and `# Yechim` headings.
 * Text outside those sections (preamble, between sections beyond a third
 * heading) is dropped — it's typically author scratch.
 */
export function splitBodyAndSolution(content: string): {
  bodyMd: string;
  solutionMd: string | null;
} {
  const lines = content.split(/\r?\n/);
  let shartStart = -1;
  let yechimStart = -1;
  let nextTopLevelAfterYechim = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Top-level `#` followed by space, not `##`
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      if (shartStart === -1 && /^#\s+Shart\b/i.test(line)) {
        shartStart = i;
      } else if (yechimStart === -1 && /^#\s+(Yechim|Solution)\b/i.test(line)) {
        yechimStart = i;
      } else if (yechimStart !== -1 && i > yechimStart && nextTopLevelAfterYechim === -1) {
        nextTopLevelAfterYechim = i;
      }
    }
  }

  if (shartStart === -1) {
    // Per format spec, every problem MUST have a `# Shart` heading. If
    // none is present, return an empty body so the validator surfaces a
    // clear "body is empty" error instead of silently accepting whatever
    // text was below the frontmatter.
    return { bodyMd: "", solutionMd: null };
  }

  const bodyEnd = yechimStart === -1 ? lines.length : yechimStart;
  const bodyMd = lines.slice(shartStart + 1, bodyEnd).join("\n").trim();

  let solutionMd: string | null = null;
  if (yechimStart !== -1) {
    const solutionEnd =
      nextTopLevelAfterYechim === -1 ? lines.length : nextTopLevelAfterYechim;
    const text = lines.slice(yechimStart + 1, solutionEnd).join("\n").trim();
    solutionMd = text.length > 0 ? text : null;
  }

  return { bodyMd, solutionMd };
}

/**
 * Pull every `images/<name>` reference from a markdown body. Used both
 * for validation (every ref must be present in the bundle) and for
 * rewriting at execute time.
 */
export function extractImageRefs(content: string): string[] {
  const refs: string[] = [];
  const regex = /!\[[^\]]*\]\(images\/([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}
