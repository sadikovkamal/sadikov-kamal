import Image from "next/image";
import { Library } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Square logo for a source card.
 *
 * - If `publicUrl` is set, renders the image with `object-contain` so
 *   the full logo is visible without corner cropping. A small inner
 *   padding gives the artwork room to breathe against any aspect ratio.
 * - Otherwise renders a uniform "library" icon on a muted background —
 *   one consistent placeholder rather than per-source colored badges,
 *   so the grid stays calm when most sources don't have a logo yet.
 *
 * Sizes follow Tailwind's size-* scale; pass `size="lg"` on detail
 * headers, default ("md") for grid cards, `size="sm"` for inline use.
 */

const SIZE_PX: Record<"sm" | "md" | "lg", number> = {
  sm: 28,
  md: 40,
  lg: 56,
};

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "size-7",
  md: "size-10",
  lg: "size-14",
};

const ICON_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-3.5",
  md: "size-5",
  lg: "size-7",
};

export interface SourceLogoProps {
  name: string;
  publicUrl: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SourceLogo({
  name,
  publicUrl,
  size = "md",
  className,
}: SourceLogoProps) {
  const px = SIZE_PX[size];
  const sizeClass = SIZE_CLASS[size];

  if (publicUrl) {
    return (
      <div
        className={cn(
          "relative shrink-0 rounded-lg overflow-hidden ring-1 ring-foreground/10 bg-white",
          // Tiny inner pad keeps SVG/PNG logos off the rounded corners
          // and matches how brand asset kits expect logos to be displayed.
          "p-1",
          sizeClass,
          className
        )}
      >
        <Image
          src={publicUrl}
          alt={`${name} logo`}
          fill
          sizes={`${px}px`}
          className="object-contain"
        />
      </div>
    );
  }

  // Fallback: brand-tinted square with a Library glyph. The accent
  // tint reads as "this is a source" without competing with real
  // logos when both shapes appear in the same grid.
  return (
    <div
      className={cn(
        "shrink-0 rounded-lg flex items-center justify-center",
        "bg-[var(--accent-brand)]/8 text-[var(--accent-brand-strong)]",
        "ring-1 ring-[var(--accent-brand)]/15",
        sizeClass,
        className
      )}
      aria-hidden
    >
      <Library className={ICON_SIZE[size]} strokeWidth={1.75} />
    </div>
  );
}
