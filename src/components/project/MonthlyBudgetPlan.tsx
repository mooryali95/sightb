/**
 * The monthly budget plan: the summary strip, the legend, and the rows as
 * cards or as a table. The rows come from getMonthlyBudgetPlan; the two
 * views, the tile and the status colours live under monthlyplan/.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency, getMonthlyBudgetPlan, type MonthStatus } from '@/lib/finance';
import type { BudgetItem, Expense, Revenue } from '@/types/project';
import { Calendar, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META } from './monthlyplan/statusMeta';
import { SummaryTile } from './monthlyplan/SummaryTile';
import { PlanCards } from './monthlyplan/PlanCards';
import { PlanTable } from './monthlyplan/PlanTable';

interface MonthlyBudgetPlanProps {
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  durationMonths: number;
  startDate?: string;
  currency?: string;
}

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
        <SummaryTile label="ضمن الخطة" value={`${onTrackCount} شهر`} accent="text-success" />
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
        <PlanCards rows={rows} currency={currency} />
      ) : (
        <PlanTable rows={rows} currency={currency} totalPlanned={totalPlanned} totalActual={totalActual} totalRevenue={totalRevenue} />
      )}
    </div>
  );
}
