// Render-blocking stylesheets used by the markdown pipeline. Scoped to
// this segment (problem list, view, edit, import) so they don't load on
// the dashboard / taxonomy pages where no problem markdown is rendered.
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

import { SelectionProvider } from "./_selection-context";

// The layout itself stays a React Server Component — the CSS imports
// above are render-blocking <link>s that belong on the server side.
// `SelectionProvider` is a client component imported by name; React
// treats the boundary correctly without making this file `"use client"`.
export default function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SelectionProvider>{children}</SelectionProvider>;
}
