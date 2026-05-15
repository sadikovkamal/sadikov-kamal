"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Last-resort boundary for admin routes. Without it, Next falls back to
 * the framework default (English, no styling). Most real failures (DB
 * down, R2 misconfig) bubble here with a generic message — we deliberately
 * don't render `error.message` to users because it can leak internals;
 * it goes to `console.error` instead for log aggregation.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] route boundary caught:", error);
  }, [error]);

  return (
    <div className="px-6 py-16 max-w-md mx-auto text-center space-y-4">
      <h1 className="font-display text-3xl">Xatolik yuz berdi</h1>
      <p className="text-muted-foreground">
        Sahifa yuklanmadi. Qayta urinib ko&apos;ring yoki keyinroq qayting.
      </p>
      {error.digest && (
        <p className="text-xs font-mono text-muted-foreground">
          ref: {error.digest}
        </p>
      )}
      <Button onClick={() => reset()}>Qayta urinish</Button>
    </div>
  );
}
