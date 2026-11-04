/** One explained figure: its label, value, sources and formula; and the source badge. */
import { formatCurrency } from '@/lib/finance';
import { FunctionSquare, Database, Calculator } from 'lucide-react';
import { SsotExplainButton } from '../SsotExplainButton';

export type SourceKind = 'fn' | 'db' | 'calc';

export function SourceBadge({ kind, label }: { kind: SourceKind; label: string }) {
  const Icon = kind === 'fn' ? FunctionSquare : kind === 'db' ? Database : Calculator;
  const color =
    kind === 'fn' ? 'bg-primary/10 text-primary border-primary/25'
    : kind === 'db' ? 'bg-warning/10 text-warning border-warning/25'
    : 'bg-success/10 text-success border-success/25';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${color}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

export function Row({
  label, value, formula, sources, currency, ssotKey, projectId,
}: {
  label: string;
  value: number;
  formula?: string;
  sources: { kind: SourceKind; label: string }[];
  currency: string;
  ssotKey?: string;
  projectId?: string;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 py-2 items-start border-b border-border/40 last:border-b-0">
      <div className="col-span-6 md:col-span-5 text-sm text-foreground flex items-center gap-2">
        <span>{label}</span>
        {ssotKey && projectId && (
          <SsotExplainButton ssotKey={ssotKey} label={label} projectId={projectId} currency={currency} />
        )}
      </div>
      <div className="col-span-6 md:col-span-3 text-sm font-mono font-semibold text-left" dir="ltr">
        {formatCurrency(value, currency)}
      </div>
      <div className="col-span-12 md:col-span-4 flex flex-wrap gap-1 justify-start md:justify-end">
        {sources.map((s, i) => <SourceBadge key={i} {...s} />)}
      </div>
      {formula && (
        <div className="col-span-12 text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1" dir="ltr">
          {formula}
        </div>
      )}
    </div>
  );
}
