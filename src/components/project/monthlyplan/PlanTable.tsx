/** The monthly plan as a table with a totals row. */
import { formatCurrency, type MonthlyBudgetPlanRow } from '@/lib/finance';
import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META } from './statusMeta';

export function PlanTable({ rows, currency, totalPlanned, totalActual, totalRevenue }: {
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
