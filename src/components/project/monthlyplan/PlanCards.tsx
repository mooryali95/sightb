/** The monthly plan as one card per month, each with its items on hover. */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, type MonthlyBudgetPlanRow } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { cn } from '@/lib/utils';
import { STATUS_META } from './statusMeta';

export function PlanCards({ rows, currency }: { rows: MonthlyBudgetPlanRow[]; currency?: string }) {
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
                    'p-3 rounded-lg border ring-1 transition cursor-default text-start',
                    meta.bg, meta.ring,
                    row.isCurrent && 'ring-2 ring-primary/40 border-primary/40',
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('w-2 h-2 rounded-full', meta.dot)} />
                    <span className="text-xs font-medium">
                      شهر {row.month}
                      {row.isCurrent && <span className="text-primary ms-1">●</span>}
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
                      <span className={cn('font-mono font-bold', row.variance >= 0 ? 'text-success' : 'text-red-600')}>
                        {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance, currency)}
                      </span>
                      <span className={cn('text-xs font-bold', meta.text)}>
                        {row.planned > 0 ? `${row.utilizationPct.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-start">
                <div className="space-y-1.5">
                  <p className="font-bold text-xs">شهر {row.month} — {meta.label}</p>
                  <div className="text-xs space-y-0.5 border-b border-border pb-1.5">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">إيراد محصّل:</span><span className="font-mono">{formatCurrency(row.actualRevenue, currency)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">صافي تدفق:</span><span className={cn('font-mono', row.netCashFlow >= 0 ? 'text-success' : 'text-red-600')}>{formatCurrency(row.netCashFlow, currency)}</span></div>
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

