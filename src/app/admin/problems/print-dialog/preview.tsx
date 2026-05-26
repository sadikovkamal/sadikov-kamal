"use client";

import {
  useDeferredValue,
  useEffect,
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
 * Renders the selected problems inside a single A4-shaped "page frame"
 * with the active {@link PrintConfig} applied via inline styles, so the
 * teacher can see — in real time — roughly what the generated `.docx`
 * will look like.
 *
 * Pagination dividers: dropped from v1. The spec calls them "guide-rails,
 * best-effort"; the centered muted disclaimer ("Taxminiy ko'rinish — …")
 * is the primary signal that Word's pagination will differ. Adding the
 * dividers requires a ResizeObserver-driven layout pass that fights React
 * commit cycles and KaTeX's async render; the design explicitly permits
 * shipping without them when fiddly.
 */
export interface PrintPreviewProps {
  config: PrintConfig;
  problems: PrintProblem[] | "loading" | { error: string };
  orderedIds: string[];
}

/** A4 (210mm × 297mm) at 96 dpi → 794 × 1123 px. */
const A4_WIDTH_PX = 794;
const A4_MIN_HEIGHT_PX = 1123;

/** Hard cap before we collapse to "first 50 + reveal" mode. */
const PERF_THRESHOLD = 200;
/** Initial render cap when over PERF_THRESHOLD. */
const PERF_INITIAL_VISIBLE = 50;

/**
 * Map `config.margins` to a pixel padding inside the A4 frame.
 * narrow = 1.27cm ≈ 48px, normal = 2.54cm ≈ 96px, wide = 3.18cm ≈ 120px
 * (at 96 dpi). The docx generator uses the same logical buckets in twips.
 */
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

/**
 * Build the per-problem number prefix that the docx generator will also
 * emit. Trailing space matters — it separates the number from the first
 * markdown token when we splice it into `bodyMd`.
 */
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

/**
 * Assemble the small grey metadata line above a problem when any of the
 * `showFields.*` toggles is on. Uses `·` middle dots as separators to
 * keep the line scannable.
 */
function buildMetaLine(
  problem: PrintProblem,
  showFields: PrintConfig["showFields"],
): string | null {
  const parts: string[] = [];
  if (showFields.code) {
    parts.push(`Kod: ${problem.code}`);
  }
  if (showFields.source && problem.source) {
    parts.push(`Manba: ${problem.source.name}`);
  }
  if (showFields.ageCategories && problem.ageCategories.length > 0) {
    parts.push(
      `Yosh: ${problem.ageCategories.map((c) => c.code).join(", ")}`,
    );
  }
  if (showFields.topics && problem.topics.length > 0) {
    parts.push(`Mavzu: ${problem.topics.map((t) => t.name).join(", ")}`);
  }
  if (showFields.methods && problem.methods.length > 0) {
    parts.push(`Metod: ${problem.methods.map((m) => m.name).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ReactMarkdown's `components.img` typing requires `src` to be a string but
// the underlying mdast emits `string | Blob | undefined`. Define a narrow
// component locally so we can render images as their own block.
function MarkdownImage({
  src,
  alt,
}: {
  src?: string | Blob;
  alt?: string;
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
        style={{ maxWidth: "100%", display: "block" }}
      />
    </p>
  );
}

const REMARK_PLUGINS = [remarkMath, remarkGfm];
const REHYPE_PLUGINS = [rehypeKatex];
const MD_COMPONENTS = { img: MarkdownImage };

/**
 * A4-shaped page frame that scales down to fit the available width.
 *
 * The inner page is always 794 px wide so the layout/typography looks
 * the same as the .docx output regardless of the modal size. We wrap it
 * in a container that measures itself with a `ResizeObserver` and
 * applies a `transform: scale(…)` to the inner frame, with the wrapper's
 * own width/height set to the *scaled* dimensions so it occupies the
 * right amount of layout space. This keeps the preview pane vertical-
 * scroll-only — no horizontal scrollbar even on a narrow preview pane.
 */
function PageFrame({
  marginPx,
  config,
  children,
}: {
  marginPx: number;
  config: PrintConfig;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [innerHeight, setInnerHeight] = useState(A4_MIN_HEIGHT_PX);

  // Recompute the scale whenever the outer scroll container resizes.
  // The wrapper itself is what we measure; its parent is the scroller
  // and provides the width budget after its own padding is applied.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const parent = wrapper.parentElement;
    if (!parent) return;
    const recompute = () => {
      // `clientWidth` already excludes the scroller's vertical
      // scrollbar so we end up with the actual content area.
      const available = parent.clientWidth;
      const next = Math.min(1, available / A4_WIDTH_PX);
      // Avoid a degenerate 0 if the container starts at zero width
      // during the first paint.
      setScale(next > 0 ? next : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Observe the inner (un-scaled) content so the wrapper's reserved
  // space tracks content growth. Transforms don't affect layout, so we
  // mirror the inner's pixel height into the wrapper, scaled.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const recompute = () => {
      setInnerHeight(Math.max(A4_MIN_HEIGHT_PX, inner.offsetHeight));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: `${A4_WIDTH_PX * scale}px`,
        height: `${innerHeight * scale}px`,
      }}
    >
      <div
        ref={innerRef}
        className="bg-white shadow-lg ring-1 ring-foreground/10 rounded-sm"
        style={{
          width: `${A4_WIDTH_PX}px`,
          minHeight: `${A4_MIN_HEIGHT_PX}px`,
          padding: `${marginPx}px`,
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: `${config.fontSize}pt`,
          lineHeight: config.lineHeight,
          color: "#111",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PrintPreview({
  config,
  problems,
  orderedIds,
}: PrintPreviewProps) {
  // useDeferredValue gives the rest of the dialog (config knobs, selected
  // list) priority while the markdown + KaTeX trees re-render. This is
  // the React 19-native equivalent of the 150 ms debounce in the spec.
  const deferredConfig = useDeferredValue(config);
  const marginPx = marginsToPx(deferredConfig.margins);

  // Perf cap: when the user prints hundreds of problems the first paint
  // can stall on KaTeX. Show the first 50 and let them opt in to "all".
  const [showAll, setShowAll] = useState(false);

  // Resolve `orderedIds` against the loaded problems via a Map lookup —
  // declared before any early return so hook order stays stable. The
  // non-array branches short-circuit on `problems` directly below; the
  // map ends up empty in those cases and is never consumed.
  const byId = useMemo(() => {
    const m = new Map<string, PrintProblem>();
    if (Array.isArray(problems)) {
      for (const p of problems) {
        m.set(p.id, p);
      }
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

  // Loading and error branches don't touch the heavy markdown pipeline.
  if (problems === "loading") {
    return (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-muted/20 p-4 flex flex-col items-center gap-4">
        <PageFrame marginPx={marginPx} config={deferredConfig}>
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
    // `{ error: string }` branch.
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

  const overThreshold = resolved.length > PERF_THRESHOLD;
  const visible =
    overThreshold && !showAll ? resolved.slice(0, PERF_INITIAL_VISIBLE) : resolved;
  const hiddenCount = resolved.length - visible.length;

  const titleTrimmed = deferredConfig.title.trim();

  return (
    <div className="h-full overflow-y-auto bg-muted/20 p-8 flex flex-col items-center gap-4">
      <PageFrame marginPx={marginPx} config={deferredConfig}>
        {titleTrimmed.length > 0 ? (
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

        <p
          style={{
            fontSize: "10px",
            color: "#888",
            textAlign: "center",
            margin: 0,
            marginBottom: "16px",
          }}
        >
          Taxminiy ko&apos;rinish — Word&apos;da sahifa chegaralari biroz farq
          qilishi mumkin.
        </p>

        {resolved.length === 0 ? (
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
        ) : (
          visible.map((problem, index) => {
            const meta = buildMetaLine(problem, deferredConfig.showFields);
            const prefix = buildNumberPrefix(index, deferredConfig.numberStyle);
            // Splice the number prefix into the markdown source so it
            // appears inline with the first paragraph's first sentence.
            // Edge case (numbered list / fenced block as the very first
            // token) is rare in problem bodies — spec accepts this.
            const bodyWithNumber = `${prefix}${problem.bodyMd}`;
            return (
              <div
                key={problem.id}
                style={{ marginBottom: "1em" }}
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
                  components={MD_COMPONENTS}
                >
                  {bodyWithNumber}
                </ReactMarkdown>
              </div>
            );
          })
        )}

        {hiddenCount > 0 ? (
          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-sm underline text-muted-foreground hover:text-foreground"
            >
              Yana {hiddenCount} ta masala — to&apos;liq ko&apos;rsatish
            </button>
          </div>
        ) : null}
      </PageFrame>
    </div>
  );
}

export default PrintPreview;
