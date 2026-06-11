import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, GitCompare, Search, Filter, TrendingUp, TrendingDown, Minus,
  Target, Wallet, BarChart3, CalendarRange, Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatPercent, getCurrentMonth } from '@/lib/finance';
import {
  groupByCategory, summarizeGroups, getExpensesForBudgetItem,
  type CategoryGroup, type ItemComparison,
} from '@/lib/budget-comparison';
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

/** Layered bar: full = planned (BAC), fill = actual, marker = plannedToDate position. */
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
            موضع المخطط للفترة: {formatPercent(pvPct)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function GroupRow({
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

function ItemRow({ item, currency, onOpenDetails }: { item: ItemComparison; currency: string; onOpenDetails: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="text-right p-3 rounded-md border border-dashed border-border/70 bg-background/60 hover:bg-muted/30 hover:border-primary/50 motion-fast transition-colors"
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
      <div className="mt-1.5 text-[11px] text-muted-foreground text-left tabular-nums">
        نسبة الاستهلاك من BAC {formatPercent(item.consumptionPct * 100)}
      </div>
    </button>
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

type DetailContext =
  | { kind: 'group'; group: CategoryGroup }
  | { kind: 'item'; item: ItemComparison; group: CategoryGroup };

function DetailsDialog({
  context, open, onOpenChange, expenses, currency, fromMonth, toMonth,
}: {
  context: DetailContext | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expenses: Expense[];
  currency: string;
  fromMonth: number;
  toMonth: number;
}) {
  if (!context) return null;
  const isGroup = context.kind === 'group';
  const title = isGroup ? context.group.label : context.item.description;
  const subtitle = isGroup
    ? `الفئة • ${context.group.items.length} بند فرعي`
    : `بند ضمن ${context.group.label}`;

  // Build list of {itemDesc, expense}
  const rows: { itemDesc: string; itemId: string; expense: Expense }[] = [];
  const itemsToShow = isGroup ? context.group.items : [context.item];
  for (const it of itemsToShow) {
    const list = getExpensesForBudgetItem(it.id, expenses, fromMonth, toMonth);
    for (const e of list) rows.push({ itemDesc: it.description, itemId: it.id, expense: e });
  }
  rows.sort((a, b) => (a.expense.date || '').localeCompare(b.expense.date || ''));

  const totalActual = rows.reduce((s, r) => s + (Number(r.expense.amount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{subtitle} • الفترة: الشهر {fromMonth} إلى {toMonth}</DialogDescription>
        </DialogHeader>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Metric label="الموازنة (BAC)" value={formatCurrency(isGroup ? context.group.planned : context.item.planned, currency)} />
          <Metric label="المخطط للفترة" value={formatCurrency(isGroup ? context.group.plannedToDate : context.item.plannedToDate, currency)} />
          <Metric label="الفعلي للفترة" value={formatCurrency(isGroup ? context.group.actual : context.item.actual, currency)} />
          <Metric label="المتبقي للفترة" value={formatCurrency(isGroup ? context.group.remaining : context.item.remaining, currency)} />
        </div>

        {/* Sub-items table (for groups) */}
        {isGroup && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground">البنود المكوِّنة</div>
            <div className="divide-y divide-border">
              {context.group.items.map(it => (
                <div key={it.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                  <span className="col-span-5 truncate">{it.description}</span>
                  <span className="col-span-2 text-muted-foreground">BAC</span>
                  <span className="col-span-2 tabular-nums">{formatCurrency(it.planned, currency)}</span>
                  <span className="col-span-1 text-muted-foreground">فعلي</span>
                  <span className="col-span-2 tabular-nums text-foreground">{formatCurrency(it.actual, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expense list */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>المصروفات الفعلية المربوطة ({rows.length})</span>
            <span className="tabular-nums">إجمالي: {formatCurrency(totalActual, currency)}</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد مصروفات مربوطة ضمن الفترة المختارة.</div>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {rows.map(({ itemDesc, expense }) => (
                <div key={expense.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                  <span className="col-span-3 text-muted-foreground tabular-nums">{expense.date}</span>
                  <span className="col-span-4 truncate">{expense.description}</span>
                  {isGroup
                    ? <span className="col-span-3 truncate text-muted-foreground">{itemDesc}</span>
                    : <span className="col-span-3 truncate text-muted-foreground">{expense.vendor || expense.responsible || '—'}</span>}
                  <span className="col-span-2 text-left tabular-nums font-semibold">{formatCurrency(Number(expense.amount) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonthSelect({
  value, onChange, durationMonths, placeholder,
}: { value: number; onChange: (v: number) => void; durationMonths: number; placeholder: string }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 w-[110px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: durationMonths }, (_, i) => i + 1).map(m => (
          <SelectItem key={m} value={String(m)} className="text-xs">الشهر {m}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PerformanceComparisonSection({
  budgetItems, expenses, durationMonths, startDate, currency,
}: Props) {
  const currentMonth = getCurrentMonth(startDate || '', durationMonths);
  const [query, setQuery] = useState('');
  const [onlyDeviated, setOnlyDeviated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [detail, setDetail] = useState<DetailContext | null>(null);

  const normalizedFrom = Math.min(fromMonth, toMonth);
  const normalizedTo = Math.max(fromMonth, toMonth);

  const allGroups = useMemo(
    () => groupByCategory(budgetItems, expenses, durationMonths, normalizedTo, normalizedFrom),
    [budgetItems, expenses, durationMonths, normalizedFrom, normalizedTo],
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
  const resetRange = () => { setFromMonth(1); setToMonth(currentMonth); };

  if (budgetItems.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
        <GitCompare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        لا توجد بنود موازنة لعرض المقارنة. أضف بنود من تبويب «الموازنة» أولاً.
      </div>
    );
  }

  const totalSeverity = Math.abs(totals.variancePct) <= 0.05 ? 'good' : Math.abs(totals.variancePct) <= 0.15 ? 'warning' : 'critical';
  const isDefaultRange = normalizedFrom === 1 && normalizedTo === currentMonth;

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="إجمالي الموازنة (BAC)" value={formatCurrency(totals.planned, currency)} icon={<Wallet className="w-4 h-4" />} />
        <StatCard title="المخطط للفترة" value={formatCurrency(totals.plannedToDate, currency)} icon={<Target className="w-4 h-4" />} subtitle={`الأشهر ${normalizedFrom}–${normalizedTo}`} />
        <StatCard title="الفعلي للفترة" value={formatCurrency(totals.actual, currency)} icon={<BarChart3 className="w-4 h-4" />} />
        <StatCard
          title="الانحراف للفترة"
          value={`${totals.variance > 0 ? '+' : totals.variance < 0 ? '−' : ''}${formatCurrency(Math.abs(totals.variance), currency)}`}
          icon={totals.variance > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          subtitle={formatPercent(Math.abs(totals.variancePct) * 100)}
          trend={totalSeverity === 'good' ? 'up' : totalSeverity === 'critical' ? 'down' : 'neutral'}
        />
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
        <CalendarRange className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">النطاق الزمني:</span>
        <span className="text-[11px] text-muted-foreground">من</span>
        <MonthSelect value={normalizedFrom} onChange={setFromMonth} durationMonths={durationMonths} placeholder="من" />
        <span className="text-[11px] text-muted-foreground">إلى</span>
        <MonthSelect value={normalizedTo} onChange={setToMonth} durationMonths={durationMonths} placeholder="إلى" />
        {!isDefaultRange && (
          <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={resetRange}>
            استعادة الافتراضي (1 — {currentMonth})
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground mr-auto">
          المقارنة تشمل ما خُطِّط وما صُرف ضمن هذه الأشهر فقط.
        </span>
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
        <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-foreground/70" /> موضع المخطط للفترة</span>
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
              <GroupRow
                group={g}
                currency={currency}
                expanded={isOpen}
                onToggle={() => toggle(g.category)}
                onOpenDetails={() => setDetail({ kind: 'group', group: g })}
              />
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
                      {g.items.map(it => (
                        <ItemRow
                          key={it.id}
                          item={it}
                          currency={currency}
                          onOpenDetails={() => setDetail({ kind: 'item', item: it, group: g })}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <DetailsDialog
        context={detail}
        open={detail !== null}
        onOpenChange={(v) => { if (!v) setDetail(null); }}
        expenses={expenses}
        currency={currency}
        fromMonth={normalizedFrom}
        toMonth={normalizedTo}
      />
    </div>
  );
}
