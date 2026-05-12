import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Deterministic formatters — needed because Node on Windows ships without
// full ICU data, so `toLocaleString("uz-UZ")` returns ISO/invariant output
// on the server but the browser returns localized strings, causing
// hydration mismatches. We hand-format using UTC accessors so SSR and CSR
// always agree byte-for-byte regardless of host locale or timezone.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return `${formatDate(date)} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`
}

/** Group digits with a non-breaking space (uz-UZ convention: 1 234). */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}
