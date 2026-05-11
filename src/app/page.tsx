import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Provia">
          <Image
            src="/brand/logo-wordmark.svg"
            alt="Provia"
            width={132}
            height={34}
            priority
          />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 active:translate-y-px transition-all"
        >
          Kirish
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center px-6">
        <Image
          src="/brand/logo-mark.svg"
          alt=""
          width={80}
          height={80}
          aria-hidden
        />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Provia</h1>
          <p className="text-muted-foreground text-base">
            Isbotga yo&apos;l — musobaqa masalalari platformasi
          </p>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground">
        Tez orada
      </footer>
    </div>
  );
}
