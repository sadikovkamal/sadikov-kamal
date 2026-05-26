import "server-only";

import {
  AlignmentType,
  Document,
  LevelFormat,
  Paragraph,
  Table,
  TextRun,
} from "docx";

import {
  ORDERED_LIST_REFERENCE,
  renderProblemBodyToParagraphs,
  type RenderContext,
} from "@/lib/print/markdown-to-docx";

import type { PrintConfig, PrintProblem } from "@/lib/print/types";

/**
 * Top-level docx assembler.
 *
 * Builds a single `Document` with one `Section` from the in-order list of
 * problems + the per-document config. Math comes through the markdown
 * walker via `mathToOmml`; images are looked up in the pre-fetched
 * `images` map (keyed by the markdown image URL — same string that
 * appears in the body's `![alt](url)` source).
 *
 * The function is synchronous — `Packer.toBuffer(doc)` happens in the
 * server action so callers can control the serialisation strategy.
 */

// ---------------------------------------------------------------------------
// Constants — units derived from the docx OOXML spec.
// ---------------------------------------------------------------------------

// 1 inch = 1440 twips. A4 = 8.27" x 11.69" = 11906 x 16838 twips.
const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;
// 96 px (at the canonical 96 DPI display) per inch ⇒ 15 twips per px.
const TWIPS_PER_PX = 15;

const MARGIN_TWIPS: Record<PrintConfig["margins"], number> = {
  narrow: 720,
  normal: 1440,
  wide: 1800,
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildDocx(
  problems: PrintProblem[],
  config: PrintConfig,
  images: Map<string, { bytes: Uint8Array; mime: string }>,
): Document {
  const marginTwips = MARGIN_TWIPS[config.margins];
  // Image caps in **docx-pixels** (= inches × 96). `docx@9` multiplies
  // `ImageRun.transformation.width/height` by 9525 internally to produce
  // the `cx`/`cy` EMU attributes; passing EMU here would yield values in
  // the billions (~9525×) and Word would refuse to open the file. This
  // contract is documented in the comment near `computeImageRenderPixels`
  // in markdown-to-docx.ts.
  const contentWidthPx = Math.round((A4_WIDTH_TWIPS - 2 * marginTwips) / TWIPS_PER_PX);
  const contentHeightPx = Math.round((A4_HEIGHT_TWIPS - 2 * marginTwips) / TWIPS_PER_PX);
  // 50 % on each axis matches the preview's IMAGE_*_FRACTION constants,
  // so what the teacher sees lines up with the .docx output.
  const maxImageWidthPx = Math.round(contentWidthPx * 0.5);
  const maxImageHeightPx = Math.round(contentHeightPx * 0.5);

  const halfPointSize = config.fontSize * 2;
  // `line` is in twentieths-of-a-point; lineHeight = multiplier × 240 (12pt baseline).
  const lineTwentieths = Math.round(config.lineHeight * 240);

  const body: (Paragraph | Table)[] = [];

  // -------------------------------------------------------------------------
  // Optional title block
  // -------------------------------------------------------------------------
  const trimmedTitle = config.title.trim();
  if (trimmedTitle.length > 0) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: trimmedTitle,
            bold: true,
            // 32 half-points = 16pt.
            size: 32,
          }),
        ],
      }),
    );
    // Extra breathing room before the first problem.
    body.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [],
      }),
    );
  }

  // -------------------------------------------------------------------------
  // One block per problem (in supplied order)
  // -------------------------------------------------------------------------
  problems.forEach((problem, index) => {
    const number = index + 1;
    const numberPrefix = formatNumberPrefix(number, config.numberStyle);

    // Metadata header.
    const metaLine = buildMetadataLine(problem, config);
    if (metaLine) {
      body.push(
        new Paragraph({
          keepNext: true,
          children: [
            new TextRun({
              text: metaLine,
              // 18 half-points = 9pt.
              size: 18,
              color: "808080",
            }),
          ],
        }),
      );
    }

    // Body via the markdown walker. Pass `keepWithNext: true` so every
    // paragraph the walker produces is glued to the next via Word's
    // `keepNext` flag — Word then refuses to split the chain across a
    // page break and moves the whole problem to the next page when it
    // doesn't fit. The empty spacer paragraph at the end of the problem
    // has no `keepNext`, which releases the chain so the *next* problem
    // can start on a fresh page if needed.
    const usedImageUrls = new Set<string>();
    const ctx: RenderContext = {
      numberPrefix,
      images,
      maxImageWidthPx,
      maxImageHeightPx,
      fontSize: config.fontSize,
      usedImageUrls,
      keepWithNext: true,
    };
    const bodyBlocks = renderProblemBodyToParagraphs(problem.bodyMd, ctx);
    for (const block of bodyBlocks) body.push(block);

    // Trailing images that the markdown didn't reference.
    for (const image of problem.images) {
      if (usedImageUrls.has(image.url)) continue;
      const entry = images.get(image.url);
      if (!entry) {
        body.push(
          new Paragraph({
            keepNext: true,
            children: [
              new TextRun({
                text: "[rasm yuklanmadi]",
                italics: true,
                size: halfPointSize,
              }),
            ],
          }),
        );
        continue;
      }
      // Reuse the walker's image path by synthesising a tiny markdown
      // fragment isn't worth it; emit a single-image paragraph inline.
      const trailing = renderProblemBodyToParagraphs(`![](${image.url})`, {
        numberPrefix: "",
        images,
        maxImageWidthPx,
        maxImageHeightPx,
        fontSize: config.fontSize,
        usedImageUrls,
        keepWithNext: true,
      });
      for (const block of trailing) body.push(block);
    }

    // 12pt after-spacing between problems via a small spacer paragraph
    // that explicitly does NOT carry `keepNext`, breaking the chain that
    // the body paragraphs above built up and letting Word start a new
    // page here when the next problem doesn't fit.
    body.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [],
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Document wrapper
  // -------------------------------------------------------------------------
  return new Document({
    creator: "Provia",
    title: trimmedTitle.length > 0 ? trimmedTitle : undefined,
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: halfPointSize,
          },
          paragraph: {
            spacing: { line: lineTwentieths, lineRule: "auto" },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: "%2)",
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: 1440, hanging: 360 } },
              },
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: "%3.",
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: 2160, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
            },
          },
        },
        children: body,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumberPrefix(
  n: number,
  style: PrintConfig["numberStyle"],
): string {
  switch (style) {
    case "dot":
      return `${n}. `;
    case "paren":
      return `${n}) `;
    case "masala":
      return `Masala ${n}. `;
    default:
      return `${n}. `;
  }
}

function buildMetadataLine(
  problem: PrintProblem,
  config: PrintConfig,
): string | null {
  const parts: string[] = [];
  const { showFields } = config;

  if (showFields.code) parts.push(`Kod: ${problem.code}`);
  if (showFields.source && problem.source) {
    parts.push(`Manba: ${problem.source.name}`);
  }
  if (showFields.ageCategories && problem.ageCategories.length > 0) {
    parts.push(
      `Yosh: ${problem.ageCategories.map((a) => a.name).join(", ")}`,
    );
  }
  if (showFields.topics && problem.topics.length > 0) {
    parts.push(`Mavzu: ${problem.topics.map((t) => t.name).join(", ")}`);
  }
  if (showFields.methods && problem.methods.length > 0) {
    parts.push(`Metod: ${problem.methods.map((m) => m.name).join(", ")}`);
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
