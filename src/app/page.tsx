import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Sadikov Kamal">
            <Image
              src="/brand/sk-logo.webp"
              alt=""
              width={36}
              height={36}
              priority
              aria-hidden
            />
            <span className="font-display text-base tracking-tight">
              Sadikov Kamal
            </span>
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
          {/* Editorial hero — small mono eyebrow, large serif title with
              italic accent, two paragraphs of biographical prose, school
              chips, and a quiet "masalalar bazasi" tag at the bottom. */}
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
            Matematika · Olimpiada tayyorgarligi
          </p>
          <h1 className="mt-4 font-display text-6xl md:text-7xl tracking-tight leading-[0.95]">
            Sadikov{" "}
            <span className="italic text-[var(--accent-brand)]">Kamal</span>.
          </h1>

          <div className="mt-6 max-w-xl space-y-3 text-lg text-muted-foreground leading-relaxed">
            <p>
              Matematika o&apos;qituvchisi. Prezident maktabi, Al-Xorazmiy
              nomidagi maktab va ixtisoslashtirilgan maktablarda dars
              berib, o&apos;quvchilarni olimpiadalarga tayyorlaydi.
            </p>
            <p>
              Shogirdlari viloyat bosqichida sovrinli o&apos;rinlarni
              muntazam egallab kelmoqda.
            </p>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-1.5 text-xs">
            {[
              "Prezident maktabi",
              "Al-Xorazmiy maktabi",
              "Ixtisoslashtirilgan maktablar",
            ].map((school) => (
              <li
                key={school}
                className="inline-flex items-center rounded-full ring-1 ring-foreground/10 bg-card px-2.5 py-1 text-foreground/80"
              >
                {school}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Masalalar bazasi</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full ring-1 ring-foreground/15">
              admin-only
            </span>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Tez orada ochiq foydalanish</span>
          <span className="font-mono">&copy; 2026 Sadikov Kamal</span>
        </div>
      </footer>
    </div>
  );
}
