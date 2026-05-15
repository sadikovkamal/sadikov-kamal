"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function TopicSearchInput({
  placeholder = "Qidirish…",
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  function commit(next: string) {
    const sp = new URLSearchParams(params.toString());
    const trimmed = next.trim();
    if (trimmed) sp.set("q", trimmed);
    else sp.delete("q");
    sp.delete("page");
    startTransition(() => {
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    commit(value);
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-sm">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8 h-8 text-[13px]"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            commit("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-4 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Tozalash"
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  );
}
