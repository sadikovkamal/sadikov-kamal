// Render-blocking stylesheets used by the markdown pipeline. Scoped to
// this segment (problem list, view, edit, import) so they don't load on
// the dashboard / taxonomy pages where no problem markdown is rendered.
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

export default function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
