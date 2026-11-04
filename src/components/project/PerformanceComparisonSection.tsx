/**
 * Budget versus planned versus actual, by category and by item, over a
 * month range. The maths lives in lib/budget-comparison; the rows, the
 * details dialog and the month select live under performance/. This file
 * keeps the range, the search and the filter state, and the layout.
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitCompare, Search, Filter, TrendingUp, TrendingDown,
  Target, Wallet, BarChart3, CalendarRange,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, formatPercent, getCurrentMonth } from '@/lib/finance';
import { groupByCategory, summarizeGroups } from '@/lib/budget-comparison';
import type { BudgetItem, Expense } from '@/types/project';
import { GroupRow } from './performance/GroupRow';
import { ItemRow } from './performance/ItemRow';
import { DetailsDialog, type DetailContext } from './performance/DetailsDialog';
import { MonthSelect } from './performance/MonthSelect';

interface Props {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  durationMonths: number;
  startDate?: string;
  currency: string;
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
        <span className="text-xs text-muted-foreground">من</span>
        <MonthSelect value={normalizedFrom} onChange={setFromMonth} durationMonths={durationMonths} placeholder="من" />
        <span className="text-xs text-muted-foreground">إلى</span>
        <MonthSelect value={normalizedTo} onChange={setToMonth} durationMonths={durationMonths} placeholder="إلى" />
        {!isDefaultRange && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetRange}>
            استعادة الافتراضي (1 — {currentMonth})
          </Button>
        )}
        <span className="text-xs text-muted-foreground ms-auto">
          المقارنة تشمل ما خُطِّط وما صُرف ضمن هذه الأشهر فقط.
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن فئة أو بند…"
            className="ps-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={onlyDeviated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOnlyDeviated(v => !v)}
            className="text-xs"
          >
            <Filter className="w-3.5 h-3.5 me-1" />
            {onlyDeviated ? 'إظهار الكل' : 'المنحرف فقط'}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={expandAll}>فتح الكل</Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={collapseAll}>طي الكل</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ps-4 md:ps-6 border-s-2 border-border/60">
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
