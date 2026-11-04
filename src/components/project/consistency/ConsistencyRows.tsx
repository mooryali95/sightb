/** One row per group; click one to open its detailed comparison. */
import { formatCurrency } from '@/lib/finance';
import type { ConsistencyDimension, ConsistencyReport } from '@/lib/spend-consistency';

interface Props {
  report: ConsistencyReport;
  dimension: ConsistencyDimension;
  onOpen: (key: string) => void;
}

export function ConsistencyRows({ report, dimension, onOpen }: Props) {
  if (report.rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        انقر على أي {dimension === 'resource' ? 'مورد' : 'فئة'} لعرض عناصر الصرف التي تغيّرت قبل/بعد الإصلاح.
      </p>
      {report.rows.map((r) => {
        const changed = Math.abs(r.gap) > 0.01;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onOpen(r.key)}
            className="w-full flex items-center justify-between gap-3 p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors text-start"
          >
            <span className="text-xs font-medium truncate">{r.label}</span>
            <span className="flex items-center gap-3 shrink-0 font-mono text-xs">
              <span className="text-muted-foreground">قبل: {formatCurrency(r.before)}</span>
              <span>بعد: {formatCurrency(r.after)}</span>
              <span className={changed ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                فرق: {formatCurrency(r.gap)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
