/** One budget item inside an expanded category; the whole row opens its details. */
import { formatCurrency, formatPercent } from '@/lib/finance';
import type { ItemComparison } from '@/lib/budget-comparison';
import { VarianceBadge, ComparisonBar, Metric } from './ComparisonParts';

export function ItemRow({ item, currency, onOpenDetails }: { item: ItemComparison; currency: string; onOpenDetails: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="text-start p-3 rounded-md border border-dashed border-border/70 bg-background/60 hover:bg-muted/30 hover:border-primary/50 motion-fast transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm text-foreground truncate flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
          {item.description}
        </span>
        <VarianceBadge variance={item.variance} currency={currency} severity={item.severity} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
        <Metric label="الموازنة (BAC)" value={formatCurrency(item.planned, currency)} />
        <Metric label="المخطط للفترة" value={formatCurrency(item.plannedToDate, currency)} />
        <Metric label="الفعلي للفترة" value={formatCurrency(item.actual, currency)} />
        <Metric label="المتبقي للفترة" value={formatCurrency(item.remaining, currency)} />
      </div>
      <ComparisonBar planned={item.planned} actual={item.actual} plannedToDate={item.plannedToDate} severity={item.severity} />
      <div className="mt-1.5 text-xs text-muted-foreground text-end tabular-nums">
        نسبة الاستهلاك من BAC {formatPercent(item.consumptionPct * 100)}
      </div>
    </button>
  );
}
