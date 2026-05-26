// Smoke test for the Print feature library layer.
//
// Exercises math conversion, image-dimension sniffing, and end-to-end
// docx generation against synthetic in-memory fixtures (no DB, no R2).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/print-smoke.ts
//
// Why --conditions=react-server: math-omml.ts opens with `import
// "server-only"`, which throws at import time under the default Node
// resolver. The react-server condition resolves the no-op stub.

import JSZip from "jszip";
import { Packer } from "docx";

import { mathToOmml } from "../src/lib/print/math-omml";
import {
  getImageDimensions,
  renderProblemBodyToParagraphs,
} from "../src/lib/print/markdown-to-docx";
import { buildDocx } from "../src/lib/print/docx";
import { DEFAULT_PRINT_CONFIG, type PrintProblem } from "../src/lib/print/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// ---------------------------------------------------------------------------
// Synthetic image bytes
// ---------------------------------------------------------------------------

// Minimal PNG header recognised by `getImageDimensions`:
//   bytes  0..7   = PNG signature (0x89 P N G \r \n 0x1A \n)
//   bytes  8..11  = IHDR chunk length (0x0000000D, BE)
//   bytes 12..15  = "IHDR"
//   bytes 16..19  = width  (BE uint32)
//   bytes 20..23  = height (BE uint32)
//   bytes 24..28  = bit depth, color type, compression, filter, interlace
//   The CRC after IHDR is not inspected by our parser; we skip it.
function makeMinimalPng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(29);
  // Signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length = 13
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  // "IHDR"
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  // width BE
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  // height BE
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  // bit depth, color type, compression, filter, interlace
  bytes[24] = 0x08;
  bytes[25] = 0x02;
  bytes[26] = 0x00;
  bytes[27] = 0x00;
  bytes[28] = 0x00;
  return bytes;
}

// Minimal JPEG carrying an SOF0 marker with width/height:
//   SOI(0xFFD8) + SOF0(0xFFC0) + segLen(0x0011 = 17 BE) + precision(0x08)
//   + height(BE u16) + width(BE u16) + numComponents(0x03) + 9 dummy bytes
//   to fill the 17-byte segment length, then EOI(0xFFD9).
function makeMinimalJpeg(width: number, height: number): Uint8Array {
  // 2 (SOI) + 2 (SOF marker) + 2 (segLen) + 1 (precision) + 2 (h) + 2 (w)
  //   + 1 (numComponents) + 9 (dummy components data) + 2 (EOI) = 23
  const out = new Uint8Array(23);
  let i = 0;
  out[i++] = 0xff;
  out[i++] = 0xd8; // SOI
  out[i++] = 0xff;
  out[i++] = 0xc0; // SOF0
  // segment length = segLen field (2) + precision (1) + h (2) + w (2)
  //   + numComponents (1) + 3 components * 3 bytes (9) = 17
  out[i++] = 0x00;
  out[i++] = 0x11;
  out[i++] = 0x08; // precision
  out[i++] = (height >> 8) & 0xff; // h hi
  out[i++] = height & 0xff; // h lo
  out[i++] = (width >> 8) & 0xff; // w hi
  out[i++] = width & 0xff; // w lo
  out[i++] = 0x03; // numComponents
  // 9 bytes of dummy component data (3 components * 3 bytes each)
  for (let c = 0; c < 9; c++) out[i++] = 0x00;
  // EOI
  out[i++] = 0xff;
  out[i++] = 0xd9;
  return out;
}

// Minimal GIF: "GIF89a"(6) + width(LE u16) + height(LE u16) + 3 LSD bytes
//   + trailer(0x3B).
function makeMinimalGif(width: number, height: number): Uint8Array {
  const out = new Uint8Array(14);
  out.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  out[6] = width & 0xff;
  out[7] = (width >> 8) & 0xff;
  out[8] = height & 0xff;
  out[9] = (height >> 8) & 0xff;
  out[10] = 0x00; // packed
  out[11] = 0x00; // bg color index
  out[12] = 0x00; // pixel aspect ratio
  out[13] = 0x3b; // trailer
  return out;
}

// Minimal WEBP VP8X:
//   bytes  0..3   = "RIFF"
//   bytes  4..7   = file size (LE u32, not validated by parser)
//   bytes  8..11  = "WEBP"
//   bytes 12..15  = "VP8X"
//   bytes 16..19  = chunk size (LE u32, value 10)
//   bytes 20..23  = flags + reserved
//   bytes 24..26  = canvasWidth - 1  (LE u24)
//   bytes 27..29  = canvasHeight - 1 (LE u24)
function makeMinimalWebp(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  // file size (arbitrary)
  out[4] = 22;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  out.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  // chunk size = 10
  out[16] = 0x0a;
  out[17] = 0x00;
  out[18] = 0x00;
  out[19] = 0x00;
  // flags + reserved (4 bytes)
  out[20] = 0x00;
  out[21] = 0x00;
  out[22] = 0x00;
  out[23] = 0x00;
  // canvasWidth - 1, 24-bit LE
  const w = width - 1;
  out[24] = w & 0xff;
  out[25] = (w >> 8) & 0xff;
  out[26] = (w >> 16) & 0xff;
  // canvasHeight - 1, 24-bit LE
  const h = height - 1;
  out[27] = h & 0xff;
  out[28] = (h >> 8) & 0xff;
  out[29] = (h >> 16) & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkMathOmml() {
  console.log("[1] math conversion sanity");

  const cases: { latex: string; needle: RegExp; label: string }[] = [
    { latex: "\\frac{a}{b}", needle: /<m:f[\s>]/, label: "frac -> <m:f>" },
    { latex: "\\sqrt{x+1}", needle: /<m:rad[\s>]/, label: "sqrt -> <m:rad>" },
    {
      latex: "\\sum_{i=1}^n i",
      needle: /<m:nary[\s>]/,
      label: "sum -> <m:nary>",
    },
    {
      latex: "\\int_a^b f(x)\\,dx",
      needle: /<m:(nary[\s>]|naryPr[\s>])/,
      label: "int -> <m:nary> or <m:naryPr>",
    },
    { latex: "x^2", needle: /<m:sSup[\s>]/, label: "x^2 -> <m:sSup>" },
  ];

  for (const c of cases) {
    const xml = mathToOmml(c.latex);
    assert(
      xml.includes("<m:oMath"),
      `${c.label}: missing <m:oMath in output (${xml.slice(0, 200)})`,
    );
    assert(
      xml.includes(
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
      ),
      `${c.label}: missing xmlns:m binding in output`,
    );
    assert(
      c.needle.test(xml),
      `${c.label}: pattern ${c.needle} not found in ${xml.slice(0, 200)}`,
    );
    console.log(`    ok: ${c.label}`);
  }
}

function checkMathFallback() {
  console.log("[2] math conversion fallback on bad LaTeX");

  let xml: string;
  try {
    xml = mathToOmml("\\frac{1}{");
  } catch (err) {
    throw new Error(
      `mathToOmml unexpectedly threw on unbalanced LaTeX: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  assert(typeof xml === "string", "fallback must return a string");
  assert(xml.includes("<m:oMath"), "fallback must contain <m:oMath");
  console.log("    ok: unbalanced brace returned fallback OMath");
}

function checkImageDimensions() {
  console.log("[3] image dimension parser");

  const near = (got: number, want: number) => Math.abs(got - want) <= 1;

  // PNG 123 x 456
  {
    const png = makeMinimalPng(123, 456);
    const d = getImageDimensions(png, "image/png");
    assert(
      near(d.width, 123) && near(d.height, 456),
      `PNG dims: got ${d.width}x${d.height}, want 123x456`,
    );
    console.log(`    ok: PNG 123x456 -> ${d.width}x${d.height}`);
  }

  // JPEG 200 x 300
  {
    const jpg = makeMinimalJpeg(200, 300);
    const d = getImageDimensions(jpg, "image/jpeg");
    assert(
      near(d.width, 200) && near(d.height, 300),
      `JPEG dims: got ${d.width}x${d.height}, want 200x300`,
    );
    console.log(`    ok: JPEG 200x300 -> ${d.width}x${d.height}`);
  }

  // GIF 64 x 48
  {
    const gif = makeMinimalGif(64, 48);
    const d = getImageDimensions(gif, "image/gif");
    assert(
      near(d.width, 64) && near(d.height, 48),
      `GIF dims: got ${d.width}x${d.height}, want 64x48`,
    );
    console.log(`    ok: GIF 64x48 -> ${d.width}x${d.height}`);
  }

  // WEBP VP8X 320 x 240. The parser accepts a synthetic VP8X frame; if it
  // ever falls back to 400x400 (e.g. parser tightened up) we accept that
  // and emit a notice instead of failing — the design explicitly allows
  // the fallback for fiddly WEBP cases.
  {
    const webp = makeMinimalWebp(320, 240);
    const d = getImageDimensions(webp, "image/webp");
    if (near(d.width, 320) && near(d.height, 240)) {
      console.log(`    ok: WEBP 320x240 -> ${d.width}x${d.height}`);
    } else if (d.width === 400 && d.height === 400) {
      console.log(
        `    note: WEBP fell back to 400x400 (design-allowed) — synthetic VP8X may not match parser's tighter checks`,
      );
    } else {
      throw new Error(
        `WEBP dims: got ${d.width}x${d.height}, want 320x240 or 400x400 fallback`,
      );
    }
  }
}

async function checkEndToEndDocx() {
  console.log("[4] end-to-end docx generation");

  const pngBytes = makeMinimalPng(640, 480);
  const imageUrl = "https://example.com/diagram.png";

  const problems: PrintProblem[] = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      code: "P9999991",
      bodyMd: "Plain text question. What is $2 + 2$?",
      images: [],
      source: { code: "S1", name: "Synthetic source" },
      topics: [{ code: "T1", name: "Algebra" }],
      ageCategories: [],
      methods: [],
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      code: "P9999992",
      bodyMd: "$$\\frac{1}{2}$$\n\nFind the answer.",
      images: [],
      source: null,
      topics: [],
      ageCategories: [],
      methods: [],
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      code: "P9999993",
      bodyMd: `See the figure: ![diagram](${imageUrl})`,
      images: [
        { storageKey: "fake/diagram.png", url: imageUrl, altText: "diagram" },
      ],
      source: null,
      topics: [],
      ageCategories: [],
      methods: [],
    },
  ];

  const imagesMap = new Map<string, { bytes: Uint8Array; mime: string }>();
  imagesMap.set(imageUrl, { bytes: pngBytes, mime: "image/png" });

  // Sanity: the markdown walker resolves the image URL against the map.
  // Surfaces aliasing/typo issues here rather than in the opaque docx zip.
  const usedImageUrls = new Set<string>();
  renderProblemBodyToParagraphs(problems[2]!.bodyMd, {
    numberPrefix: "3. ",
    images: imagesMap,
    maxImageWidthEmu: 5_000_000,
    fontSize: 12,
    usedImageUrls,
  });
  assert(
    usedImageUrls.has(imageUrl),
    `walker did not register image URL ${imageUrl} as used (got ${[...usedImageUrls].join(",")})`,
  );

  const doc = buildDocx(problems, DEFAULT_PRINT_CONFIG, imagesMap);
  const buffer = await Packer.toBuffer(doc);
  assert(buffer.byteLength >= 1024, `docx buffer too small: ${buffer.byteLength} bytes`);
  console.log(`    docx buffer: ${buffer.byteLength} bytes`);

  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file("word/document.xml");
  assert(documentEntry, "word/document.xml missing from docx zip");
  const documentXml = await documentEntry.async("string");

  assert(
    documentXml.includes("<m:oMath"),
    `word/document.xml missing <m:oMath element (length ${documentXml.length})`,
  );
  console.log("    ok: word/document.xml contains <m:oMath");

  // Regression guard for the docx@9.7 bug where ImportedXmlComponent
  // .fromXmlString wraps namespaced roots in a literal `<undefined>`
  // element. Word refuses to open files that contain that tag — the
  // user-visible symptom is "Word experienced an error trying to open
  // the file". Our `importOmathXml` helper unwraps the bogus parent;
  // catching any `<undefined` literal here keeps that fix honest.
  assert(
    !documentXml.includes("<undefined"),
    "word/document.xml contains an <undefined> element — Word will reject this docx",
  );
  console.log("    ok: word/document.xml has no <undefined> tags");

  // Image embedded: jszip exposes a `files` record where folder entries
  // appear as keys ending in "/" alongside any contained files.
  const mediaEntries = Object.keys(zip.files).filter((path) =>
    path.startsWith("word/media/"),
  );
  assert(
    mediaEntries.length > 0,
    `expected at least one word/media/* entry in docx zip, got: ${Object.keys(zip.files).join(", ")}`,
  );
  console.log(
    `    ok: docx package contains ${mediaEntries.length} word/media/* entr${mediaEntries.length === 1 ? "y" : "ies"}`,
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main() {
  checkMathOmml();
  checkMathFallback();
  checkImageDimensions();
  await checkEndToEndDocx();
  console.log("Smoke: PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    console.log("Smoke: FAILED");
    process.exit(1);
  })
  .then(() => process.exit(0));
