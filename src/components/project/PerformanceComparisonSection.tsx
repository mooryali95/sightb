import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, GitCompare, Search, Filter, TrendingUp, TrendingDown, Minus, Target, Wallet, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatPercent, getCurrentMonth } from '@/lib/finance';
import { groupByCategory, summarizeGroups, type CategoryGroup, type ItemComparison } from '@/lib/budget-comparison';
import type { BudgetItem, Expense } from '@/types/project';
import { cn } from '@/lib/utils';

interface Props {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  durationMonths: number;
  startDate?: string;
  currency: string;
}

const severityBg: Record<'good' | 'warning' | 'critical', string> = {
  good: 'bg-health-good',
  warning: 'bg-health-warning',
  critical: 'bg-health-critical',
};
const severityText: Record<'good' | 'warning' | 'critical', string> = {
  good: 'health-good',
  warning: 'health-warning',
  critical: 'health-critical',
};
const severityFill: Record<'good' | 'warning' | 'critical', string> = {
  good: 'bg-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning))]',
  critical: 'bg-[hsl(var(--destructive))]',
};

function VarianceBadge({ variance, currency, severity }: { variance: number; currency: string; severity: 'good' | 'warning' | 'critical' }) {
  const Icon = severity === 'good' ? Minus : variance > 0 ? TrendingUp : TrendingDown;
  const sign = variance > 0 ? '+' : variance < 0 ? '−' : '';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border', severityBg[severity], severityText[severity])}>
      <Icon className="w-3 h-3" />
      {sign}{formatCurrency(Math.abs(variance), currency)}
    </span>
  );
}

/** Layered bar: full = planned, fill = actual, marker = plannedToDate position. */
function ComparisonBar({
  planned, actual, plannedToDate, severity,
}: { planned: number; actual: number; plannedToDate: number; severity: 'good' | 'warning' | 'critical' }) {
  const actualPct = planned > 0 ? Math.min(100, (actual / planned) * 100) : 0;
  const pvPct = planned > 0 ? Math.min(100, (plannedToDate / planned) * 100) : 0;
  return (
    <div className="relative w-full h-2.5 rounded-full bg-muted overflow-visible">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${actualPct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn('absolute inset-y-0 right-0 rounded-full', severityFill[severity])}
        style={{ width: `${actualPct}%` }}
      />
      {planned > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute -top-1 h-4.5 w-0.5 bg-foreground/70 rounded-full"
              style={{ right: `calc(${pvPct}% - 1px)`, height: '18px', top: '-4px' }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            موضع المخطط حتى الآن: {formatPercent(pvPct)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function GroupRow({
  group, currency, expanded, onToggle,
}: { group: CategoryGroup; currency: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-right p-3 md:p-4 rounded-lg border border-border bg-card hover:bg-muted/40 motion-fast transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown className={cn('w-4 h-4 shrink-0 motion-fast transition-transform', !expanded && '-rotate-90')} />
          <span className="font-semibold text-foreground truncate">{group.label}</span>
          <Badge variant="outline" className="text-[10px] font-normal">{group.items.length} بند</Badge>
        </div>
        <VarianceBadge variance={group.variance} currency={currency} severity={group.severity} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
        <Metric label="الموازنة" value={formatCurrency(group.planned, currency)} />
        <Metric label="المخطط حتى الآن" value={formatCurrency(group.plannedToDate, currency)} />
        <Metric label="الفعلي" value={formatCurrency(group.actual, currency)} />
        <Metric label="المتبقي" value={formatCurrency(group.remaining, currency)} />
      </div>
      <ComparisonBar planned={group.planned} actual={group.actual} plannedToDate={group.plannedToDate} severity={group.severity} />
      <div className="mt-1.5 text-[11px] text-muted-foreground text-left tabular-nums">
        نسبة الاستهلاك {formatPercent(group.consumptionPct * 100)}
      </div>
    </button>
  );
}

function ItemRow({ item, currency }: { item: ItemComparison; currency: string }) {
  return (
    <div className="p-3 rounded-md border border-dashed border-border/70 bg-background/60">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm text-foreground truncate flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
          {item.description}
        </span>
        <VarianceBadge variance={item.variance} currency={currency} severity={item.severity} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
        <Metric label="الموازنة" value={formatCurrency(item.planned, currency)} />
        <Metric label="المخطط حتى الآن" value={formatCurrency(item.plannedToDate, currency)} />
        <Metric label="الفعلي" value={formatCurrency(item.actual, currency)} />
        <Metric label="المتبقي" value={formatCurrency(item.remaining, currency)} />
      </div>
      <ComparisonBar planned={item.planned} actual={item.actual} plannedToDate={item.plannedToDate} severity={item.severity} />
      <div className="mt-1.5 text-[11px] text-muted-foreground text-left tabular-nums">
        نسبة الاستهلاك {formatPercent(item.consumptionPct * 100)}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export function PerformanceComparisonSection({
  budgetItems, expenses, durationMonths, startDate, currency,
}: Props) {
  const currentMonth = getCurrentMonth(startDate || '', durationMonths);
  const [query, setQuery] = useState('');
  const [onlyDeviated, setOnlyDeviated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allGroups = useMemo(
    () => groupByCategory(budgetItems, expenses, durationMonths, currentMonth),
    [budgetItems, expenses, durationMonths, currentMonth],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allGroups
      .map(g => ({
        ...g,
        items: g.items.filter(it =>
          (!q || it.description.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) &&
          (!onlyDeviated || it.severity !== 'good'),
        ),
      }))
      .filter(g => g.items.length > 0);
  }, [allGroups, query, onlyDeviated]);

  const totals = useMemo(() => summarizeGroups(allGroups), [allGroups]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(groups.map(g => g.category)));
  const collapseAll = () => setExpanded(new Set());

  if (budgetItems.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
        <GitCompare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        لا توجد بنود موازنة لعرض المقارنة. أضف بنود من تبويب «الموازنة» أولاً.
      </div>
    );
  }

  const totalSeverity = Math.abs(totals.variancePct) <= 0.05 ? 'good' : Math.abs(totals.variancePct) <= 0.15 ? 'warning' : 'critical';

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="إجمالي الموازنة" value={formatCurrency(totals.planned, currency)} icon={<Wallet className="w-4 h-4" />} />
        <StatCard title="المخطط حتى تاريخه" value={formatCurrency(totals.plannedToDate, currency)} icon={<Target className="w-4 h-4" />} subtitle={`الشهر ${currentMonth} من ${durationMonths}`} />
        <StatCard title="الفعلي حتى تاريخه" value={formatCurrency(totals.actual, currency)} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard
          title="الانحراف الكلي"
          value={`${totals.variance > 0 ? '+' : totals.variance < 0 ? '−' : ''}${formatCurrency(Math.abs(totals.variance), currency)}`}
          icon={totals.variance > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          subtitle={formatPercent(Math.abs(totals.variancePct) * 100)}
          trend={totalSeverity === 'good' ? 'up' : totalSeverity === 'critical' ? 'down' : 'neutral'}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن فئة أو بند…"
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={onlyDeviated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOnlyDeviated(v => !v)}
            className="text-xs"
          >
            <Filter className="w-3.5 h-3.5 ml-1" />
            {onlyDeviated ? 'إظهار الكل' : 'المنحرف فقط'}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={expandAll}>فتح الكل</Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={collapseAll}>طي الكل</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]" /> ضمن الحدود (≤ 5%)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning))]" /> انحراف متوسط (5–15%)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--destructive))]" /> انحراف حرج ({'>'} 15%)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-foreground/70" /> موضع المخطط حتى الآن</span>
      </div>

      {/* Groups */}
      <div className="space-y-2.5">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            لا نتائج مطابقة للبحث/الفلاتر الحالية.
          </div>
        ) : groups.map((g) => {
          const isOpen = expanded.has(g.category);
          return (
            <div key={g.category} className="space-y-2">
              <GroupRow group={g} currency={currency} expanded={isOpen} onToggle={() => toggle(g.category)} />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-4 md:pr-6 border-r-2 border-border/60">
                      {g.items.map(it => <ItemRow key={it.id} item={it} currency={currency} />)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
