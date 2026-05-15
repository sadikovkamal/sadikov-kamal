/**
 * Top-level skeleton for /admin/*. Server-component routes that take a
 * non-trivial database round-trip (dashboard, problems list, taxonomy
 * pages) all benefit from showing this immediately while Postgres
 * answers.
 */
export default function AdminLoading() {
  return (
    <div className="px-6 py-8 space-y-6">
      <div className="h-7 w-48 rounded-md bg-foreground/5 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl ring-1 ring-foreground/10 bg-foreground/[0.02] animate-pulse"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl ring-1 ring-foreground/10 bg-foreground/[0.02] animate-pulse" />
    </div>
  );
}
