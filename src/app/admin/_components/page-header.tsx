/**
 * Shared page header for admin surfaces. Establishes the visual
 * hierarchy: small semibold title, subtle subtitle, primary actions
 * on the right. Used as the first child of every admin page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="space-y-0.5 min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
