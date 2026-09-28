export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="page-title">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS = {
  resumo: ["Resumo", "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"],
  manifestada: ["Ciência enviada", "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800"],
  xml_completo: ["Pronta p/ importar", "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"],
  importada: ["Importada", "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"],
  ignorada: ["Ignorada", "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"],
  cancelada: ["Cancelada", "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"],
};

export function StatusBadge({ status, testId }) {
  const [label, cls] = STATUS[status] || [status, STATUS.ignorada[1]];
  return (
    <span data-testid={testId} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function SourceTag({ source }) {
  const map = { sefaz: "SEFAZ", xml: "XML", manual: "Manual" };
  return (
    <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {map[source] || source}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action, testId }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
      <p className="font-display font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
