import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Kirish — Sadikov Kamal",
  description: "Sadikov Kamal administratsiya paneliga kirish.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-block" aria-label="Sadikov Kamal">
            <Image
              src="/brand/sk-logo.webp"
              alt=""
              width={48}
              height={48}
              priority
              aria-hidden
            />
          </Link>
          <div className="space-y-1">
            <h1 className="font-display text-3xl tracking-tight">
              Tizimga kirish
            </h1>
            <p className="text-muted-foreground text-sm">
              Sadikov Kamal administratsiya paneli
            </p>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
