import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, getMonthlyBudgetPlan, type MonthlyBudgetPlanRow, type MonthStatus } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type BudgetItem, type Expense, type Revenue, type ExpenseCategory } from '@/types/project';
import { Calendar, LayoutGrid, Table as TableIcon, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthlyBudgetPlanProps {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  durationMonths: number;
  startDate?: string;
  currency?: string;
}

const STATUS_META: Record<MonthStatus, { label: string; dot: string; ring: string; bg: string; text: string }> = {
  on_track:   { label: 'ضمن الخطة',   dot: 'bg-emerald-500', ring: 'ring-emerald-200 dark:ring-emerald-900/40', bg: 'bg-emerald-50/60 dark:bg-emerald-900/10', text: 'text-emerald-700 dark:text-emerald-300' },
  near_limit: { label: 'قرب الحد',    dot: 'bg-amber-500',   ring: 'ring-amber-200 dark:ring-amber-900/40',     bg: 'bg-amber-50/60 dark:bg-amber-900/10',     text: 'text-amber-700 dark:text-amber-300' },
  over:       { label: 'تجاوز',       dot: 'bg-red-500',     ring: 'ring-red-200 dark:ring-red-900/40',         bg: 'bg-red-50/60 dark:bg-red-900/10',         text: 'text-red-700 dark:text-red-300' },
  future:     { label: 'مستقبل',      dot: 'bg-muted-foreground/40', ring: 'ring-border', bg: 'bg-muted/30', text: 'text-muted-foreground' },
  inactive:   { label: 'بدون نشاط',   dot: 'bg-muted-foreground/30', ring: 'ring-border', bg: 'bg-muted/20', text: 'text-muted-foreground' },
};

export function MonthlyBudgetPlan({ budgetItems, expenses, revenues, durationMonths, startDate, currency }: MonthlyBudgetPlanProps) {
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const rows = useMemo(
    () => getMonthlyBudgetPlan(budgetItems, expenses, revenues, durationMonths, startDate),
    [budgetItems, expenses, revenues, durationMonths, startDate],
  );

  if (durationMonths <= 0) return null;

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.actualRevenue, 0);
  const overCount = rows.filter(r => r.status === 'over').length;
  const onTrackCount = rows.filter(r => r.status === 'on_track').length;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            خطة الصرف الشهرية
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            توزيع دقيق لكل بند موازنة على شهره — مع المخطط والفعلي والانحراف وحالة كل شهر
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          <Button
            type="button"
            variant={view === 'cards' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={() => setView('cards')}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> بطاقات
          </Button>
          <Button
            type="button"
            variant={view === 'table' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={() => setView('table')}
          >
            <TableIcon className="w-3.5 h-3.5" /> جدول
          </Button>
        </div>
      </div>

      {/* Quick summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <SummaryTile label="إجمالي مخطط" value={formatCurrency(totalPlanned, currency)} />
        <SummaryTile label="إجمالي فعلي" value={formatCurrency(totalActual, currency)} />
        <SummaryTile label="ضمن الخطة" value={`${onTrackCount} شهر`} accent="text-emerald-600" />
        <SummaryTile label="تجاوزت" value={`${overCount} شهر`} accent={overCount > 0 ? 'text-red-600' : 'text-muted-foreground'} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-muted-foreground">
        {(['on_track','near_limit','over','future','inactive'] as MonthStatus[]).map(st => (
          <span key={st} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', STATUS_META[st].dot)} />
            {STATUS_META[st].label}
          </span>
        ))}
      </div>

      {view === 'cards' ? (
        <CardsGrid rows={rows} currency={currency} />
      ) : (
        <DetailedTable rows={rows} currency={currency} totalPlanned={totalPlanned} totalActual={totalActual} totalRevenue={totalRevenue} />
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-mono font-bold mt-1', accent)}>{value}</p>
    </div>
  );
}

function CardsGrid({ rows, currency }: { rows: MonthlyBudgetPlanRow[]; currency?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {rows.map((row) => {
          const meta = STATUS_META[row.status];
          return (
            <Tooltip key={row.month}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'p-3 rounded-lg border ring-1 transition-all cursor-default text-right',
                    meta.bg, meta.ring,
                    row.isCurrent && 'ring-2 ring-primary/40 border-primary/40',
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('w-2 h-2 rounded-full', meta.dot)} />
                    <span className="text-xs font-medium">
                      شهر {row.month}
                      {row.isCurrent && <span className="text-primary mr-1">●</span>}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{formatCurrency(row.planned, currency)}</span>
                      <span className="text-muted-foreground">مخطط</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{formatCurrency(row.actual, currency)}</span>
                      <span className="text-muted-foreground">فعلي</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                      <span className={cn('font-mono font-bold', row.variance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance, currency)}
                      </span>
                      <span className={cn('text-xs font-bold', meta.text)}>
                        {row.planned > 0 ? `${row.utilizationPct.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-right">
                <div className="space-y-1.5">
                  <p className="font-bold text-xs">شهر {row.month} — {meta.label}</p>
                  <div className="text-xs space-y-0.5 border-b border-border pb-1.5">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">إيراد محصّل:</span><span className="font-mono">{formatCurrency(row.actualRevenue, currency)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">صافي تدفق:</span><span className={cn('font-mono', row.netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(row.netCashFlow, currency)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">تراكمي مخطط:</span><span className="font-mono">{formatCurrency(row.cumulativePlanned, currency)}</span></div>
                  </div>
                  {row.items.length > 0 ? (
                    <>
                      <p className="text-xs font-semibold">البنود المخصصة ({row.items.length}):</p>
                      <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                        {row.items.map((it, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span className="truncate">
                              <span className="text-muted-foreground">{EXPENSE_CATEGORY_LABELS[it.category as ExpenseCategory] || it.category}:</span>{' '}
                              {it.description}
                            </span>
                            <span className="font-mono shrink-0">{formatCurrency(it.amount, currency)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">لا توجد بنود مخصصة لهذا الشهر</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function DetailedTable({ rows, currency, totalPlanned, totalActual, totalRevenue }: {
  rows: MonthlyBudgetPlanRow[]; currency?: string; totalPlanned: number; totalActual: number; totalRevenue: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>الشهر</th>
            <th>الحالة</th>
            <th>مخطط</th>
            <th>فعلي</th>
            <th>الانحراف</th>
            <th>النسبة</th>
            <th>إيراد محصّل</th>
            <th>صافي التدفق</th>
            <th>تراكمي فعلي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meta = STATUS_META[row.status];
            return (
              <tr key={row.month} className={cn(row.isCurrent && 'bg-primary/5')}>
                <td className="font-medium">شهر {row.month}{row.isCurrent && <span className="text-primary mr-1">●</span>}</td>
                <td>
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs', meta.bg, meta.text)}>
                    <CircleDot className="w-3 h-3" />
                    {meta.label}
                  </span>
                </td>
                <td className="font-mono text-sm">{formatCurrency(row.planned, currency)}</td>
                <td className="font-mono text-sm">{formatCurrency(row.actual, currency)}</td>
                <td className={cn('font-mono text-sm', row.variance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance, currency)}
                </td>
                <td className="text-xs">{row.planned > 0 ? `${row.utilizationPct.toFixed(1)}%` : '—'}</td>
                <td className="font-mono text-sm">{formatCurrency(row.actualRevenue, currency)}</td>
                <td className={cn('font-mono text-sm', row.netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatCurrency(row.netCashFlow, currency)}
                </td>
                <td className="font-mono text-sm">{formatCurrency(row.cumulativeActual, currency)}</td>
              </tr>
            );
          })}
          <tr className="font-bold border-t-2 border-border bg-muted/30">
            <td>الإجمالي</td>
            <td>—</td>
            <td className="font-mono">{formatCurrency(totalPlanned, currency)}</td>
            <td className="font-mono">{formatCurrency(totalActual, currency)}</td>
            <td className={cn('font-mono', totalPlanned - totalActual >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatCurrency(totalPlanned - totalActual, currency)}
            </td>
            <td>{totalPlanned > 0 ? `${((totalActual / totalPlanned) * 100).toFixed(1)}%` : '—'}</td>
            <td className="font-mono">{formatCurrency(totalRevenue, currency)}</td>
            <td className={cn('font-mono', totalRevenue - totalActual >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatCurrency(totalRevenue - totalActual, currency)}
            </td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
