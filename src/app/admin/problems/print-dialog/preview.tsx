"use client";

import {
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";

import type { PrintConfig, PrintProblem } from "@/lib/print/types";

/**
 * Right-pane live HTML preview for the print dialog.
 *
 * Three responsibilities, in order:
 *
 *   1. Render every selected problem into a hidden measurement column
 *      so we know each problem's natural pixel height after markdown +
 *      KaTeX layout.
 *   2. Pack problems greedily into A4-sized pages — when adding the
 *      next problem would exceed the page's content height, start a new
 *      page. Mirrors Word's `keepNext` chain (which keeps every
 *      paragraph of a problem together on a single page) without
 *      trying to be byte-accurate to Word's typesetting.
 *   3. Render each page as its own A4 frame in the visible pane,
 *      stacked vertically with a clear gap so the teacher sees the
 *      page boundaries. A small "N ta sahifa" footer reports the total.
 *
 * The frame itself uses CSS `zoom` to scale-to-fit the preview pane.
 * `zoom` (unlike `transform: scale`) participates in layout so the
 * parent's content area shrinks with the page and the horizontal
 * scrollbar never appears.
 */
export interface PrintPreviewProps {
  config: PrintConfig;
  problems: PrintProblem[] | "loading" | { error: string };
  orderedIds: string[];
}

/** A4 (210mm × 297mm) at 96 dpi → 794 × 1123 px. */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/** Hard cap before we collapse to "first N + reveal" mode. */
const PERF_THRESHOLD = 200;
const PERF_INITIAL_VISIBLE = 50;

/** Spacing between problems inside a page, in px — matches docx 12pt. */
const PROBLEM_SPACING_PX = 16;

function marginsToPx(margins: PrintConfig["margins"]): number {
  switch (margins) {
    case "narrow":
      return 48;
    case "wide":
      return 120;
    case "normal":
    default:
      return 96;
  }
}

function buildNumberPrefix(
  index: number,
  style: PrintConfig["numberStyle"],
): string {
  switch (style) {
    case "paren":
      return `${index + 1}) `;
    case "masala":
      return `Masala ${index + 1}. `;
    case "dot":
    default:
      return `${index + 1}. `;
  }
}

function buildMetaLine(
  problem: PrintProblem,
  showFields: PrintConfig["showFields"],
): string | null {
  const parts: string[] = [];
  if (showFields.code) parts.push(`Kod: ${problem.code}`);
  if (showFields.source && problem.source) {
    parts.push(`Manba: ${problem.source.name}`);
  }
  if (showFields.ageCategories && problem.ageCategories.length > 0) {
    parts.push(`Yosh: ${problem.ageCategories.map((c) => c.code).join(", ")}`);
  }
  if (showFields.topics && problem.topics.length > 0) {
    parts.push(`Mavzu: ${problem.topics.map((t) => t.name).join(", ")}`);
  }
  if (showFields.methods && problem.methods.length > 0) {
    parts.push(`Metod: ${problem.methods.map((m) => m.name).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Markdown image rendering — mirror the docx generator's size heuristic so
// the preview looks like the .docx output.
// ---------------------------------------------------------------------------

/**
 * Soft cap on the rendered image width inside an A4 page, expressed as a
 * fraction of the content area. The docx generator caps at the same
 * fraction; keeping the two in lock-step avoids "preview looked smaller
 * than the actual print" surprises.
 */
const IMAGE_WIDTH_FRACTION = 0.5;
/** Soft cap on rendered image height as a fraction of the content area. */
const IMAGE_HEIGHT_FRACTION = 0.5;

function MarkdownImage({
  src,
  alt,
  contentWidthPx,
  contentHeightPx,
}: {
  src?: string | Blob;
  alt?: string;
  contentWidthPx: number;
  contentHeightPx: number;
}) {
  if (typeof src !== "string" || src.length === 0) {
    return null;
  }
  return (
    <p style={{ margin: "0.5em 0" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        style={{
          maxWidth: `${contentWidthPx * IMAGE_WIDTH_FRACTION}px`,
          maxHeight: `${contentHeightPx * IMAGE_HEIGHT_FRACTION}px`,
          width: "auto",
          height: "auto",
          objectFit: "contain",
          display: "block",
        }}
      />
    </p>
  );
}

const REMARK_PLUGINS = [remarkMath, remarkGfm];
const REHYPE_PLUGINS = [rehypeKatex];

// ---------------------------------------------------------------------------
// Single-problem renderer (shared between measurement column + page frames)
// ---------------------------------------------------------------------------

function ProblemBlock({
  problem,
  index,
  config,
  contentWidthPx,
  contentHeightPx,
}: {
  problem: PrintProblem;
  index: number;
  config: PrintConfig;
  contentWidthPx: number;
  contentHeightPx: number;
}) {
  const meta = buildMetaLine(problem, config.showFields);
  const prefix = buildNumberPrefix(index, config.numberStyle);
  // Splice the number prefix into the markdown source so it lands inline
  // with the first paragraph's first sentence — same trick the docx
  // walker uses to keep the prefix visually attached to the body.
  const bodyWithNumber = `${prefix}${problem.bodyMd}`;
  const components = useMemo(
    () => ({
      img: (props: { src?: string | Blob; alt?: string }) => (
        <MarkdownImage
          src={props.src}
          alt={props.alt}
          contentWidthPx={contentWidthPx}
          contentHeightPx={contentHeightPx}
        />
      ),
    }),
    [contentWidthPx, contentHeightPx],
  );
  return (
    <div
      style={{ marginBottom: `${PROBLEM_SPACING_PX}px` }}
      data-problem-id={problem.id}
    >
      {meta !== null ? (
        <div
          style={{
            fontSize: "10px",
            color: "#888",
            marginBottom: "4px",
          }}
        >
          {meta}
        </div>
      ) : null}
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {bodyWithNumber}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A4 page frame — uses CSS `zoom` so it scales to fit the parent and
// participates in layout (no horizontal scrollbar). The frame itself
// stays at the canonical 794 px so typography matches the docx output.
// ---------------------------------------------------------------------------

function PageFrame({
  marginPx,
  config,
  pageNumber,
  totalPages,
  children,
}: {
  marginPx: number;
  config: PrintConfig;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const parent = wrapper?.parentElement;
    if (!wrapper || !parent) return;
    const recompute = () => {
      const cs = window.getComputedStyle(parent);
      const padL = Number.parseFloat(cs.paddingLeft) || 0;
      const padR = Number.parseFloat(cs.paddingRight) || 0;
      const available = parent.clientWidth - padL - padR;
      if (available <= 0) return;
      const next = Math.min(1, available / A4_WIDTH_PX);
      setZoom(next > 0.1 ? next : 0.1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={wrapperRef}
        className="bg-white shadow-lg ring-1 ring-foreground/10 rounded-sm"
        style={{
          width: `${A4_WIDTH_PX}px`,
          minHeight: `${A4_HEIGHT_PX}px`,
          padding: `${marginPx}px`,
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: `${config.fontSize}pt`,
          lineHeight: config.lineHeight,
          color: "#111",
          boxSizing: "border-box",
          // `zoom` scales the rendered output AND its laid-out size, so
          // the parent's flex children flow correctly and no horizontal
          // scrollbar appears. Modern Chromium / WebKit and Firefox ≥ 126
          // support this; the admin tool only targets desktop.
          zoom,
        }}
      >
        {children}
      </div>
      <div className="text-[10px] tabular-nums text-muted-foreground">
        Sahifa {pageNumber} / {totalPages}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main preview
// ---------------------------------------------------------------------------

export function PrintPreview({
  config,
  problems,
  orderedIds,
}: PrintPreviewProps) {
  const deferredConfig = useDeferredValue(config);
  const marginPx = marginsToPx(deferredConfig.margins);
  const contentWidthPx = A4_WIDTH_PX - 2 * marginPx;
  const contentHeightPx = A4_HEIGHT_PX - 2 * marginPx;

  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, PrintProblem>();
    if (Array.isArray(problems)) {
      for (const p of problems) m.set(p.id, p);
    }
    return m;
  }, [problems]);

  const resolved = useMemo(
    () =>
      orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is PrintProblem => p !== undefined),
    [orderedIds, byId],
  );

  const overThreshold = resolved.length > PERF_THRESHOLD;
  const visible =
    overThreshold && !showAll
      ? resolved.slice(0, PERF_INITIAL_VISIBLE)
      : resolved;
  const hiddenCount = resolved.length - visible.length;

  // Measurement pass: render every visible problem in a hidden column at
  // A4 content width, observe each `[data-problem-id]` block, and pack
  // them greedily into pages. Re-runs whenever the inputs or the typography
  // controls change — anything that could change a problem's height.
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PrintProblem[][]>([]);

  useLayoutEffect(() => {
    const container = measureContainerRef.current;

    // Greedy pagination by measured offsetHeight. The title block on
    // page 1 takes a bit of space — we subtract a small overhead from
    // page 1's budget so the title + first problem fit comfortably.
    const TITLE_OVERHEAD_PX =
      deferredConfig.title.trim().length > 0 ? 64 : 0;
    const DISCLAIMER_OVERHEAD_PX = 28; // small grey "Taxminiy ko'rinish…" note

    const computeLayout = () => {
      if (!container || visible.length === 0) {
        setPages([]);
        return;
      }
      const blocks =
        container.querySelectorAll<HTMLDivElement>("[data-problem-id]");
      if (blocks.length !== visible.length) {
        // Measurement column hasn't caught up with the latest `visible`
        // list yet; bail and wait for the next observer firing rather
        // than committing a half-built layout.
        return;
      }
      const heights: number[] = [];
      blocks.forEach((b) => heights.push(b.offsetHeight));

      const computedPages: PrintProblem[][] = [];
      let currentPage: PrintProblem[] = [];
      let currentHeight = TITLE_OVERHEAD_PX + DISCLAIMER_OVERHEAD_PX;
      const pageBudget = contentHeightPx;

      visible.forEach((problem, i) => {
        const h = (heights[i] ?? 0) + PROBLEM_SPACING_PX;
        if (currentHeight + h > pageBudget && currentPage.length > 0) {
          computedPages.push(currentPage);
          currentPage = [];
          currentHeight = 0;
        }
        currentPage.push(problem);
        currentHeight += h;
      });
      if (currentPage.length > 0) computedPages.push(currentPage);
      setPages(computedPages);
    };

    computeLayout();
    if (!container) return;
    // Images, KaTeX, and webfont swaps all change heights after the
    // initial layout pass. Observe the measurement container and re-pack
    // whenever any child resizes.
    const ro = new ResizeObserver(() => computeLayout());
    container
      .querySelectorAll<HTMLDivElement>("[data-problem-id]")
      .forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [
    visible,
    contentHeightPx,
    deferredConfig.fontSize,
    deferredConfig.lineHeight,
    deferredConfig.margins,
    deferredConfig.numberStyle,
    deferredConfig.showFields,
    deferredConfig.title,
  ]);

  // Loading / error branches.
  if (problems === "loading") {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-muted/20 p-4 flex flex-col items-center gap-4">
        <PageFrame
          marginPx={marginPx}
          config={deferredConfig}
          pageNumber={1}
          totalPages={1}
        >
          <div className="flex flex-col gap-3">
            <div
              className="h-4 w-2/3 rounded bg-muted-foreground/15 animate-pulse"
              aria-hidden
            />
            <div
              className="h-4 w-5/6 rounded bg-muted-foreground/15 animate-pulse"
              aria-hidden
            />
            <div
              className="h-4 w-1/2 rounded bg-muted-foreground/15 animate-pulse"
              aria-hidden
            />
            <p className="sr-only">Masalalar yuklanmoqda…</p>
          </div>
        </PageFrame>
      </div>
    );
  }

  if (!Array.isArray(problems)) {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-muted/20 p-4 flex flex-col items-center gap-4">
        <div
          className="w-full max-w-[794px] rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {problems.error}
        </div>
      </div>
    );
  }

  const titleTrimmed = deferredConfig.title.trim();

  // The visible layout is page-by-page. The hidden measurement column
  // renders the same problems off-screen at the canonical content width
  // (no zoom, no styling beyond what affects height) so the layout
  // useLayoutEffect can pack them.
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-muted/20 p-4 flex flex-col items-stretch gap-4">
      {/* Hidden measurement column. position:absolute + visibility:hidden
          keeps it out of the visual flow and out of the accessibility
          tree, while still allowing offsetHeight reads. */}
      <div
        ref={measureContainerRef}
        aria-hidden
        style={{
          position: "absolute",
          left: "-99999px",
          top: 0,
          width: `${contentWidthPx}px`,
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: `${deferredConfig.fontSize}pt`,
          lineHeight: deferredConfig.lineHeight,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        {visible.map((problem, index) => (
          <ProblemBlock
            key={problem.id}
            problem={problem}
            index={index}
            config={deferredConfig}
            contentWidthPx={contentWidthPx}
            contentHeightPx={contentHeightPx}
          />
        ))}
      </div>

      {/* Visible paginated render. */}
      {resolved.length === 0 ? (
        <PageFrame
          marginPx={marginPx}
          config={deferredConfig}
          pageNumber={1}
          totalPages={1}
        >
          <p
            style={{
              textAlign: "center",
              color: "#888",
              fontSize: "11pt",
              marginTop: "2em",
            }}
          >
            Tanlangan masalalar yo&apos;q.
          </p>
        </PageFrame>
      ) : (
        pages.map((page, pageIdx) => {
          // Each problem's global index across all pages — needed so the
          // visible render uses the same numbers as the .docx would.
          const indexOffset = pages
            .slice(0, pageIdx)
            .reduce((sum, p) => sum + p.length, 0);
          return (
            <PageFrame
              key={pageIdx}
              marginPx={marginPx}
              config={deferredConfig}
              pageNumber={pageIdx + 1}
              totalPages={pages.length}
            >
              {pageIdx === 0 && titleTrimmed.length > 0 ? (
                <h2
                  style={{
                    fontSize: `${deferredConfig.fontSize * 1.5}pt`,
                    fontWeight: 700,
                    textAlign: "center",
                    margin: 0,
                    marginBottom: "24px",
                  }}
                >
                  {titleTrimmed}
                </h2>
              ) : null}
              {pageIdx === 0 ? (
                <p
                  style={{
                    fontSize: "10px",
                    color: "#888",
                    textAlign: "center",
                    margin: 0,
                    marginBottom: "16px",
                  }}
                >
                  Taxminiy ko&apos;rinish — Word&apos;da sahifa chegaralari
                  biroz farq qilishi mumkin.
                </p>
              ) : null}
              {page.map((problem, i) => (
                <ProblemBlock
                  key={problem.id}
                  problem={problem}
                  index={indexOffset + i}
                  config={deferredConfig}
                  contentWidthPx={contentWidthPx}
                  contentHeightPx={contentHeightPx}
                />
              ))}
            </PageFrame>
          );
        })
      )}

      {/* Page-count footer and (when appropriate) "show all" affordance. */}
      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground py-2">
        {pages.length > 0 ? (
          <span>
            <span className="tabular-nums font-medium text-foreground">
              {pages.length}
            </span>{" "}
            ta sahifa, jami{" "}
            <span className="tabular-nums font-medium text-foreground">
              {visible.length}
            </span>{" "}
            ta masala
          </span>
        ) : null}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="underline hover:text-foreground"
          >
            Yana {hiddenCount} ta masala — to&apos;liq ko&apos;rsatish
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default PrintPreview;
