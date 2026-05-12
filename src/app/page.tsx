import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="Provia">
            <Image
              src="/brand/logo-wordmark.svg"
              alt="Provia"
              width={120}
              height={30}
              priority
            />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 active:translate-y-px transition-all inline-flex items-center gap-1.5"
          >
            Kirish
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl w-full mx-auto px-6 py-16 md:py-24">
          {/* Editorial hero — large serif title with italic accent, mono dateline. */}
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
            v0 · MVP
          </p>
          <h1 className="mt-4 font-display text-6xl md:text-7xl tracking-tight leading-[0.95]">
            Isbotga{" "}
            <span className="italic text-[var(--accent-brand)]">yo&apos;l</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            O&apos;zbekiston matematika olimpiadasi masalalarining ma&apos;lumotlar
            bazasi. Manbalar, mavzular va sinflar bo&apos;yicha tartiblangan,
            izlash uchun ochiq.
          </p>

          <div className="mt-10 flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Hozircha</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full ring-1 ring-foreground/15">
              admin-only
            </span>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Tez orada ochiq foydalanish</span>
          <span className="font-mono">&copy; 2026 Provia</span>
        </div>
      </footer>
    </div>
  );
}
