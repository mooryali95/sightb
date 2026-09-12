/** One category in the comparison: its four figures, bar and consumption. */
import { ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/finance';
import type { CategoryGroup } from '@/lib/budget-comparison';
import { cn } from '@/lib/utils';
import { VarianceBadge, ComparisonBar, Metric } from './ComparisonParts';

export function GroupRow({
  group, currency, expanded, onToggle, onOpenDetails,
}: { group: CategoryGroup; currency: string; expanded: boolean; onToggle: () => void; onOpenDetails: () => void }) {
  return (
    <div className="p-3 md:p-4 rounded-lg border border-border bg-card hover:bg-muted/40 motion-fast transition-colors">
      <div className="flex items-center justify-between gap-3 mb-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 text-right">
          <ChevronDown className={cn('w-4 h-4 shrink-0 motion-fast transition-transform', !expanded && '-rotate-90')} />
          <span className="font-semibold text-foreground truncate">{group.label}</span>
          <Badge variant="outline" className="text-[10px] font-normal">{group.items.length} بند</Badge>
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onOpenDetails}>
            <Info className="w-3.5 h-3.5 ml-1" /> تفاصيل
          </Button>
          <VarianceBadge variance={group.variance} currency={currency} severity={group.severity} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
        <Metric label="الموازنة (BAC)" value={formatCurrency(group.planned, currency)} />
        <Metric label="المخطط للفترة" value={formatCurrency(group.plannedToDate, currency)} />
        <Metric label="الفعلي للفترة" value={formatCurrency(group.actual, currency)} />
        <Metric label="المتبقي للفترة" value={formatCurrency(group.remaining, currency)} />
      </div>
      <ComparisonBar planned={group.planned} actual={group.actual} plannedToDate={group.plannedToDate} severity={group.severity} />
      <div className="mt-1.5 text-[11px] text-muted-foreground text-left tabular-nums">
        نسبة الاستهلاك من BAC {formatPercent(group.consumptionPct * 100)}
      </div>
    </div>
  );
}
