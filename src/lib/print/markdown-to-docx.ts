import "server-only";

import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { mathToOmml } from "@/lib/print/math-omml";

import type {
  BlockContent,
  Blockquote,
  Code,
  DefinitionContent,
  Delete,
  Emphasis,
  Heading,
  Image as MdImage,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph as MdParagraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table as MdTable,
  TableCell as MdTableCell,
  TableRow as MdTableRow,
  Text as MdText,
  ThematicBreak,
} from "mdast";
import type { InlineMath, Math as BlockMath } from "mdast-util-math";

/**
 * Markdown -> docx walker.
 *
 * Parses a markdown body with `remark-parse + remark-math + remark-gfm`,
 * then turns the resulting mdast root into a flat list of docx block
 * children (`Paragraph` or `Table`) that the assembler in `docx.ts`
 * splices into the document body.
 *
 * The function NEVER throws. Unknown nodes fall back to plain text via
 * `mdast-util-to-string` — problem bodies are user-controlled markdown,
 * so a fail-soft renderer is safer than a strict one.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RenderContext {
  /** Prefix prepended to the first top-level paragraph (e.g. `"1. "`). */
  numberPrefix: string;
  /**
   * Pre-fetched image bytes keyed by the markdown image URL (the same
   * URL that appears inside `![alt](URL)` in the body). The caller is
   * the server action which fetches R2 bytes ahead of time.
   */
  images: Map<string, { bytes: Uint8Array; mime: string }>;
  /**
   * Width cap on rendered images, in "docx pixels" (= inches × 96).
   *
   * The `docx` library's `ImageRun.transformation.width` is documented
   * as "EMU" in some places but the implementation multiplies the value
   * by 9525 internally to produce the final `cx` attribute on
   * `<wp:extent>`. Passing real EMU here is a 9525× error that makes
   * Word reject the file. We use the same unit the library expects:
   * screen pixels at 96 DPI.
   */
  maxImageWidthPx: number;
  /** Optional height cap in the same docx-pixel unit as `maxImageWidthPx`. */
  maxImageHeightPx?: number;
  /** Body font size in pt (half-pt size = fontSize * 2 on every TextRun). */
  fontSize: number;
  /**
   * Set of image URLs that the markdown walker has already emitted, so
   * the caller can know which `problem.images[]` entries need a trailing
   * paragraph appended (none of the body markdown referenced them).
   */
  usedImageUrls?: Set<string>;
  /**
   * When true, every top-level Paragraph the walker produces is created
   * with `keepNext: true`. The caller (buildDocx) uses this to glue all
   * paragraphs of a single problem together — Word then refuses to
   * split them across a page break, moving the whole problem to the
   * next page if it doesn't fit. The spacer paragraph the caller
   * appends *between* problems has no keepNext, which is what releases
   * the chain so the next problem can start on a new page.
   *
   * Explicit `keepNext` already on the Paragraph options wins over this
   * default — most call sites don't set it, so the override does what
   * you'd expect.
   */
  keepWithNext?: boolean;
}

/**
 * Construct a `Paragraph` that honours `ctx.keepWithNext` unless the
 * caller explicitly set `keepNext` themselves. Centralising the merge
 * here keeps every `new Paragraph(...)` site uniform without each one
 * having to remember the flag.
 */
type ParagraphInit = Extract<
  ConstructorParameters<typeof Paragraph>[0],
  object
>;

function makeParagraph(opts: ParagraphInit, ctx: RenderContext): Paragraph {
  if (ctx.keepWithNext && opts.keepNext === undefined) {
    return new Paragraph({ ...opts, keepNext: true });
  }
  return new Paragraph(opts);
}

/**
 * Walker entry point. Returns a mixed list of `Paragraph` and `Table`
 * because GFM tables are top-level docx blocks (not paragraphs).
 */
export function renderProblemBodyToParagraphs(
  bodyMd: string,
  ctx: RenderContext,
): (Paragraph | Table)[] {
  const root = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .parse(bodyMd) as Root;

  const blocks: (Paragraph | Table)[] = [];
  let firstTopLevelParagraphSeen = false;

  for (const node of root.children) {
    const needsPrefix =
      !firstTopLevelParagraphSeen && ctx.numberPrefix.length > 0;
    const prefix = needsPrefix ? ctx.numberPrefix : "";
    if (needsPrefix) firstTopLevelParagraphSeen = true;
    const rendered = renderTopLevel(node, ctx, prefix);
    for (const block of rendered) {
      blocks.push(block);
    }
  }

  // Edge case: empty body but the caller wants a numbered placeholder
  // — emit a paragraph that still carries the number prefix.
  if (!firstTopLevelParagraphSeen && ctx.numberPrefix.length > 0) {
    blocks.push(
      makeParagraph(
        {
          children: [
            new TextRun({ text: ctx.numberPrefix, size: ctx.fontSize * 2 }),
          ],
        },
        ctx,
      ),
    );
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Top-level node dispatch
// ---------------------------------------------------------------------------

function renderTopLevel(
  node: RootContent,
  ctx: RenderContext,
  prefix: string,
): (Paragraph | Table)[] {
  switch (node.type) {
    case "paragraph":
      return [renderParagraph(node, ctx, prefix)];
    case "heading":
      return [renderHeading(node, ctx, prefix)];
    case "list":
      return renderList(node, ctx, 0);
    case "code":
      return renderCodeBlock(node, ctx);
    case "math":
      return [renderBlockMath(node, ctx)];
    case "image":
      return [renderImageParagraph(node, ctx)];
    case "blockquote":
      return renderBlockquote(node, ctx);
    case "thematicBreak":
      return [renderThematicBreak(node, ctx)];
    case "table":
      return [renderTable(node, ctx)];
    case "html":
    case "definition":
    case "footnoteDefinition":
    case "yaml":
      // Ignored / not meaningful in a printed worksheet.
      return [];
    default:
      return [renderFallback(node, ctx, prefix)];
  }
}

// ---------------------------------------------------------------------------
// Paragraph + inline walker
// ---------------------------------------------------------------------------

function renderParagraph(
  node: MdParagraph,
  ctx: RenderContext,
  prefix: string,
): Paragraph {
  const children: ParagraphChild[] = [];
  if (prefix) {
    children.push(new TextRun({ text: prefix, size: ctx.fontSize * 2 }));
  }
  for (const child of node.children) {
    appendInlineChildren(child, ctx, {}, children);
  }
  return makeParagraph({ children }, ctx);
}

function renderHeading(
  node: Heading,
  ctx: RenderContext,
  prefix: string,
): Paragraph {
  const children: ParagraphChild[] = [];
  if (prefix) {
    children.push(new TextRun({ text: prefix, bold: true }));
  }
  for (const child of node.children) {
    appendInlineChildren(child, ctx, { bold: true }, children);
  }
  return makeParagraph(
    {
      heading: HEADING_LEVEL_BY_DEPTH[node.depth],
      children,
    },
    ctx,
  );
}

const HEADING_LEVEL_BY_DEPTH: Record<
  Heading["depth"],
  (typeof HeadingLevel)[keyof typeof HeadingLevel]
> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// ---------------------------------------------------------------------------
// Inline walker
// ---------------------------------------------------------------------------

type ParagraphChild = TextRun | ImageRun | ImportedXmlComponent;

/**
 * Wrapper around `ImportedXmlComponent.fromXmlString` that works around a
 * bug in `docx@9.7.x`.
 *
 * Internally the library does roughly:
 *
 *   convertToXmlComponent(xml2js(content, { compact: false }))
 *
 * `xml2js` returns the *document* node — an object with no `type` and an
 * `elements` array holding the real root. `convertToXmlComponent` hits the
 * `case undefined` branch, constructs `new ImportedXmlComponent(undefined,
 * undefined)` for that document node, and pushes the actual root in as a
 * CHILD. The resulting tree serialises to `<undefined><m:oMath>…</m:oMath>
 * </undefined>` in `word/document.xml`, which Word refuses to open
 * ("Word experienced an error trying to open the file").
 *
 * We can't reach `convertToXmlComponent` directly (it isn't re-exported
 * from the package's barrel), so we use the broken `fromXmlString`,
 * walk its internal `root` array, and return the first real child — the
 * actual `<m:oMath>` component with the correct tag name.
 */
function importOmathXml(xml: string): ImportedXmlComponent {
  const wrapper = ImportedXmlComponent.fromXmlString(xml);
  // The wrapper is an ImportedXmlComponent whose internal `root` array
  // holds an attribute component (if any) plus the parsed child elements.
  // The first ImportedXmlComponent inside is our actual root.
  const root = (wrapper as unknown as { root: unknown[] }).root;
  for (const child of root) {
    if (child instanceof ImportedXmlComponent) {
      return child;
    }
  }
  // Defensive: shouldn't happen for well-formed input, but if the XML
  // didn't yield any element child, hand back the wrapper so callers
  // still receive a value of the expected type. It will serialise as
  // `<undefined/>` and downstream tests should catch it.
  return wrapper;
}

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

function appendInlineChildren(
  node: PhrasingContent,
  ctx: RenderContext,
  style: InlineStyle,
  out: ParagraphChild[],
): void {
  switch (node.type) {
    case "text":
      out.push(makeStyledText((node as MdText).value, style, ctx));
      return;
    case "strong": {
      const next = { ...style, bold: true };
      for (const child of (node as Strong).children) {
        appendInlineChildren(child, ctx, next, out);
      }
      return;
    }
    case "emphasis": {
      const next = { ...style, italics: true };
      for (const child of (node as Emphasis).children) {
        appendInlineChildren(child, ctx, next, out);
      }
      return;
    }
    case "delete": {
      const next = { ...style, strike: true };
      for (const child of (node as Delete).children) {
        appendInlineChildren(child, ctx, next, out);
      }
      return;
    }
    case "inlineCode": {
      out.push(
        makeStyledText((node as InlineCode).value, { ...style, code: true }, ctx),
      );
      return;
    }
    case "link": {
      // URL discarded for handout output — just emit the visible children.
      for (const child of (node as Link).children) {
        appendInlineChildren(child, ctx, style, out);
      }
      return;
    }
    case "inlineMath": {
      const omml = mathToOmml((node as InlineMath).value);
      out.push(importOmathXml(omml));
      return;
    }
    case "break":
      out.push(new TextRun({ break: 1 }));
      return;
    case "image": {
      // Inline images are unusual but legal; emit as an inline image run
      // so the surrounding paragraph keeps its other content intact.
      const inline = makeImageRunIfAvailable(node as MdImage, ctx);
      if (inline) {
        out.push(inline);
      } else {
        out.push(
          makeStyledText("[rasm yuklanmadi]", { ...style, italics: true }, ctx),
        );
      }
      return;
    }
    default: {
      // Footnote refs, html, image/link references — best-effort text fallback.
      const text = toString(node).trim();
      if (text) out.push(makeStyledText(text, style, ctx));
      return;
    }
  }
}

function makeStyledText(
  text: string,
  style: InlineStyle,
  ctx: RenderContext,
): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? "Consolas" : undefined,
    size: ctx.fontSize * 2,
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/**
 * Shared numbering reference declared on the docx Document. The walker
 * just emits `numbering: { reference, level }` and lets the document-level
 * config supply the actual format. Keep in sync with `docx.ts`.
 */
export const ORDERED_LIST_REFERENCE = "provia-print-ordered";

function renderList(
  node: List,
  ctx: RenderContext,
  level: number,
): (Paragraph | Table)[] {
  const ordered = node.ordered === true;
  const out: (Paragraph | Table)[] = [];
  for (const item of node.children) {
    if (item.type !== "listItem") continue;
    for (const para of renderListItem(item, ctx, level, ordered)) {
      out.push(para);
    }
  }
  return out;
}

function renderListItem(
  item: ListItem,
  ctx: RenderContext,
  level: number,
  ordered: boolean,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let firstParaConverted = false;
  for (const child of item.children) {
    if (child.type === "paragraph" && !firstParaConverted) {
      firstParaConverted = true;
      const children: ParagraphChild[] = [];
      for (const c of child.children) {
        appendInlineChildren(c, ctx, {}, children);
      }
      out.push(
        makeParagraph(
          {
            children,
            ...(ordered
              ? { numbering: { reference: ORDERED_LIST_REFERENCE, level } }
              : { bullet: { level } }),
          },
          ctx,
        ),
      );
    } else if (child.type === "list") {
      // Nested list.
      for (const sub of renderList(child, ctx, level + 1)) {
        out.push(sub);
      }
    } else {
      // Continuation paragraph / blockquote / code etc inside a list item:
      // render through the top-level path with an indent.
      const rendered = renderTopLevel(child as RootContent, ctx, "");
      for (const r of rendered) {
        out.push(r);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Code, math, image, blockquote, hr, table
// ---------------------------------------------------------------------------

function renderCodeBlock(node: Code, ctx: RenderContext): Paragraph[] {
  // Preserve line breaks by splitting into TextRuns separated by break runs.
  const lines = node.value.split("\n");
  const children: TextRun[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) children.push(new TextRun({ break: 1 }));
    children.push(
      new TextRun({
        text: line,
        font: "Consolas",
        size: ctx.fontSize * 2,
      }),
    );
  });
  return [makeParagraph({ children }, ctx)];
}

function renderBlockMath(node: BlockMath, ctx: RenderContext): Paragraph {
  const omml = mathToOmml(node.value, { display: true });
  return makeParagraph(
    {
      alignment: AlignmentType.CENTER,
      children: [importOmathXml(omml)],
    },
    ctx,
  );
}

function renderImageParagraph(
  node: MdImage,
  ctx: RenderContext,
): Paragraph {
  const run = makeImageRunIfAvailable(node, ctx);
  if (!run) {
    return makeParagraph(
      {
        children: [
          new TextRun({
            text: "[rasm yuklanmadi]",
            italics: true,
            size: ctx.fontSize * 2,
          }),
        ],
      },
      ctx,
    );
  }
  return makeParagraph({ children: [run] }, ctx);
}

/**
 * Translate a source image's pixel dimensions into an on-page rendering
 * size, returned in **docx-pixel** units (the `docx` library multiplies
 * these by 9525 to produce EMU in the final `<wp:extent>`).
 *
 * The naive "1 src px = 1 display px" rule turned olympiad-diagram crops
 * (often 1000–2000 px square) into images that filled the entire A4
 * page. We pick a display DPI bucketed by total pixel area instead:
 *
 *   - Small thumbnails (<500 K px²): 250 DPI → small on-page size
 *     (matches their information density).
 *   - Typical diagrams (500 K – 2 M px²): 200 DPI → ~10 cm wide.
 *   - Large/detailed scans (>2 M px²): 150 DPI → big enough to read
 *     every label, then clipped by the width/height caps below.
 *
 * The "display DPI" is the resolution at which the source's pixels will
 * render on paper. Higher DPI ⇒ smaller printed image; lower DPI ⇒
 * larger. We translate to docx's screen-pixel unit (96 DPI) by
 * `srcPx × 96 / targetDpi`.
 *
 * After translation we apply width + height caps proportionally so the
 * aspect ratio is preserved and no image dominates the page.
 */
function computeImageRenderPixels(
  pxW: number,
  pxH: number,
  maxWidthPx: number,
  maxHeightPx: number | undefined,
): { width: number; height: number } {
  const area = pxW * pxH;
  let targetDpi: number;
  if (area < 500_000) {
    targetDpi = 250;
  } else if (area < 2_000_000) {
    targetDpi = 200;
  } else {
    targetDpi = 150;
  }

  let width = Math.round((pxW * 96) / targetDpi);
  let height = Math.round((pxH * 96) / targetDpi);

  // Floor: never display larger than the source's intrinsic 96-DPI size.
  // Tiny icons stay tiny even if the DPI bucket would enlarge them.
  if (width > pxW) {
    width = pxW;
    height = pxH;
  }

  // Width cap.
  if (width > maxWidthPx) {
    const ratio = maxWidthPx / width;
    width = maxWidthPx;
    height = Math.max(1, Math.round(height * ratio));
  }

  // Height cap — preserves aspect by scaling both dimensions equally.
  if (maxHeightPx !== undefined && height > maxHeightPx) {
    const ratio = maxHeightPx / height;
    height = maxHeightPx;
    width = Math.max(1, Math.round(width * ratio));
  }

  return { width, height };
}

function makeImageRunIfAvailable(
  node: MdImage,
  ctx: RenderContext,
): ImageRun | null {
  const entry = ctx.images.get(node.url);
  if (!entry) return null;
  if (ctx.usedImageUrls) ctx.usedImageUrls.add(node.url);

  const { bytes, mime } = entry;
  const { width: pxW, height: pxH } = getImageDimensions(bytes, mime);
  const { width, height } = computeImageRenderPixels(
    pxW,
    pxH,
    ctx.maxImageWidthPx,
    ctx.maxImageHeightPx,
  );

  const type = imageRunTypeFor(mime);

  // `transformation` is in docx-pixels — the library multiplies by 9525
  // to emit the `cx` / `cy` EMU attributes. Passing EMU here would
  // produce values in the billions and Word would refuse to open the
  // file. The unit is documented as "EMU" in some places but the
  // implementation (see docx@9 internals: `Math.round(width * 9525)`)
  // makes the contract clear.
  return new ImageRun({
    type,
    data: bytes,
    transformation: { width, height },
    altText: node.alt
      ? { name: node.alt, title: node.alt, description: node.alt }
      : undefined,
  });
}

function imageRunTypeFor(mime: string): "jpg" | "png" | "gif" | "bmp" {
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("bmp")) return "bmp";
  // WEBP/SVG/etc aren't a first-class `type` in docx v9; treat as png as a
  // best-effort fallback. Word still renders most webp blobs even when the
  // declared type is png, and this avoids a hard reject of the whole doc.
  return "png";
}

function renderBlockquote(
  node: Blockquote,
  ctx: RenderContext,
): Paragraph[] {
  const out: Paragraph[] = [];
  for (const child of node.children) {
    if (child.type === "paragraph") {
      const children: ParagraphChild[] = [];
      for (const c of child.children) {
        appendInlineChildren(c, ctx, { italics: true }, children);
      }
      out.push(
        new Paragraph({
          indent: { left: 720 },
          children,
        }),
      );
    } else {
      // Best-effort: extract plain text for non-paragraph blockquote children.
      const text = toString(child as BlockContent | DefinitionContent).trim();
      if (!text) continue;
      out.push(
        makeParagraph(
          {
            indent: { left: 720 },
            children: [makeStyledText(text, { italics: true }, ctx)],
          },
          ctx,
        ),
      );
    }
  }
  return out;
}

function renderThematicBreak(
  _node: ThematicBreak,
  ctx: RenderContext,
): Paragraph {
  // eslint warns on the param even with the underscore; we keep the
  // signature uniform with the other `render*` helpers so the dispatcher
  // stays readable.
  void _node;
  return makeParagraph(
    {
      border: {
        bottom: {
          color: "auto",
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
    },
    ctx,
  );
}

function renderTable(node: MdTable, ctx: RenderContext): Table {
  const rows: TableRow[] = node.children.map((row: MdTableRow) =>
    renderTableRow(row, ctx),
  );
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function renderTableRow(row: MdTableRow, ctx: RenderContext): TableRow {
  const cells: TableCell[] = row.children.map((cell: MdTableCell) =>
    renderTableCell(cell, ctx),
  );
  return new TableRow({ children: cells });
}

function renderTableCell(cell: MdTableCell, ctx: RenderContext): TableCell {
  const children: ParagraphChild[] = [];
  for (const child of cell.children) {
    appendInlineChildren(child, ctx, {}, children);
  }
  return new TableCell({
    children: [new Paragraph({ children })],
  });
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function renderFallback(
  node: RootContent,
  ctx: RenderContext,
  prefix: string,
): Paragraph {
  const text = toString(node).trim();
  const children: ParagraphChild[] = [];
  if (prefix) {
    children.push(new TextRun({ text: prefix, size: ctx.fontSize * 2 }));
  }
  if (text) {
    children.push(makeStyledText(text, {}, ctx));
  }
  return makeParagraph({ children }, ctx);
}

// ---------------------------------------------------------------------------
// getImageDimensions — pure-JS sniffer
// ---------------------------------------------------------------------------

const FALLBACK_DIMENSIONS = { width: 400, height: 400 } as const;

/**
 * Sniff image dimensions in pixels by inspecting the file header.
 * Recognises PNG, JPEG, GIF, and WEBP. Any unparseable input returns a
 * 400x400 fallback so the docx generator never trips on exotic blobs.
 *
 * `mime` is consulted as a hint but the actual format detection uses
 * the magic bytes so a wrongly-labelled blob still works.
 */
export function getImageDimensions(
  bytes: Uint8Array,
  mime?: string,
): { width: number; height: number } {
  try {
    if (bytes.length < 12) return { ...FALLBACK_DIMENSIONS };

    if (isPng(bytes)) {
      const w = readUint32BE(bytes, 16);
      const h = readUint32BE(bytes, 20);
      if (w > 0 && h > 0) return { width: w, height: h };
    }

    if (isGif(bytes)) {
      const w = readUint16LE(bytes, 6);
      const h = readUint16LE(bytes, 8);
      if (w > 0 && h > 0) return { width: w, height: h };
    }

    if (isWebp(bytes)) {
      const dims = readWebpDimensions(bytes);
      if (dims) return dims;
    }

    if (isJpeg(bytes)) {
      const dims = readJpegDimensions(bytes);
      if (dims) return dims;
    }

    // mime is a soft hint; if magic-byte detection failed and the caller
    // still trusts the mime, we don't have a better answer than the
    // fallback square.
    void mime;
    return { ...FALLBACK_DIMENSIONS };
  } catch {
    return { ...FALLBACK_DIMENSIONS };
  }
}

function isPng(b: Uint8Array): boolean {
  return (
    b.length >= 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function isGif(b: Uint8Array): boolean {
  return (
    b.length >= 10 &&
    b[0] === 0x47 && // G
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x38 && // 8
    (b[4] === 0x37 || b[4] === 0x39) && // 7 | 9
    b[5] === 0x61 // a
  );
}

function isWebp(b: Uint8Array): boolean {
  return (
    b.length >= 16 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  );
}

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function readUint32BE(b: Uint8Array, offset: number): number {
  if (offset + 3 >= b.length) return 0;
  const a = b[offset];
  const c = b[offset + 1];
  const d = b[offset + 2];
  const e = b[offset + 3];
  if (
    a === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined
  ) {
    return 0;
  }
  return ((a << 24) | (c << 16) | (d << 8) | e) >>> 0;
}

function readUint16LE(b: Uint8Array, offset: number): number {
  if (offset + 1 >= b.length) return 0;
  const a = b[offset];
  const c = b[offset + 1];
  if (a === undefined || c === undefined) return 0;
  return (c << 8) | a;
}

function readUint16BE(b: Uint8Array, offset: number): number {
  if (offset + 1 >= b.length) return 0;
  const a = b[offset];
  const c = b[offset + 1];
  if (a === undefined || c === undefined) return 0;
  return (a << 8) | c;
}

function readUint24LE(b: Uint8Array, offset: number): number {
  if (offset + 2 >= b.length) return 0;
  const a = b[offset];
  const c = b[offset + 1];
  const d = b[offset + 2];
  if (a === undefined || c === undefined || d === undefined) return 0;
  return (d << 16) | (c << 8) | a;
}

/**
 * WEBP supports three sub-chunks for the actual bitstream:
 *  - "VP8 " (simple lossy)
 *  - "VP8L" (lossless)
 *  - "VP8X" (extended; carries 24-bit width-1/height-1 directly)
 */
function readWebpDimensions(
  b: Uint8Array,
): { width: number; height: number } | null {
  if (b.length < 30) return null;
  // FourCC at offset 12.
  const c1 = b[12];
  const c2 = b[13];
  const c3 = b[14];
  const c4 = b[15];
  const tag = String.fromCharCode(
    c1 ?? 0,
    c2 ?? 0,
    c3 ?? 0,
    c4 ?? 0,
  );

  if (tag === "VP8X") {
    const w = readUint24LE(b, 24) + 1;
    const h = readUint24LE(b, 27) + 1;
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  if (tag === "VP8 ") {
    // 26: 16-bit LE width (lower 14 bits), 28: 16-bit LE height (lower 14).
    const wRaw = readUint16LE(b, 26);
    const hRaw = readUint16LE(b, 28);
    const w = wRaw & 0x3fff;
    const h = hRaw & 0x3fff;
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  }

  if (tag === "VP8L") {
    // Signature byte 0x2f at offset 20, then 32 bits packed LE:
    // 14 bits width-1, 14 bits height-1.
    if (b[20] !== 0x2f) return null;
    const b21 = b[21];
    const b22 = b[22];
    const b23 = b[23];
    const b24 = b[24];
    if (
      b21 === undefined ||
      b22 === undefined ||
      b23 === undefined ||
      b24 === undefined
    ) {
      return null;
    }
    const w = ((b22 & 0x3f) << 8) | b21;
    const h = ((b24 & 0x0f) << 10) | (b23 << 2) | ((b22 & 0xc0) >> 6);
    return { width: w + 1, height: h + 1 };
  }

  return null;
}

/**
 * Walk JPEG segments and find an SOF (Start Of Frame) marker, which
 * carries the precision byte (skipped) plus 16-bit BE height and width.
 */
function readJpegDimensions(
  b: Uint8Array,
): { width: number; height: number } | null {
  let i = 2; // skip SOI
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    // Skip 0xFF padding bytes.
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return null;
    const marker = b[i];
    if (marker === undefined) return null;
    i++;

    // Standalone markers without a length field — none we care about reach
    // here. SOI/EOI are 0xD8/0xD9, RSTn 0xD0..0xD7. Treat any non-SOF
    // standalone as "no length, advance" only for these explicit cases.
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;

    // SOF markers: 0xC0..0xCF excluding DHT(C4), JPG(C8), DAC(CC).
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    const segLen = readUint16BE(b, i);
    if (segLen < 2 || i + segLen > b.length) return null;

    if (isSof && i + 7 < b.length) {
      const h = readUint16BE(b, i + 3);
      const w = readUint16BE(b, i + 5);
      if (w > 0 && h > 0) return { width: w, height: h };
      return null;
    }
    i += segLen;
  }
  return null;
}
