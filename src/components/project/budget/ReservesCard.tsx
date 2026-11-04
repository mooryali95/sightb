/**
 * The reserves card: contingency planned against contingency spent, the
 * budget with the contingency taken out, and the management reserve that
 * is held rather than planned.
 */
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import type { BudgetItem, Expense } from '@/types/project';

interface Props {
  budgetItems: BudgetItem[];
  /** Expenses that count as spend: rejected rows already left out. */
  countedExpenses: Expense[];
  totalPlanned: number;
  managementReserve: number;
}

export function ReservesCard({ budgetItems, countedExpenses, totalPlanned, managementReserve }: Props) {
  return (
    <div className="stat-card">
      <h3 className="text-sm font-semibold mb-4">تحليل الاحتياطيات</h3>
      {(() => {
        const contingencyPlanned = getTotalPlanned(budgetItems.filter((b) => b.category === 'contingency'));
        const contingencyActual = countedExpenses.filter((e) => e.category === 'contingency').reduce((s, e) => s + e.amount, 0);
        const contingencyRemaining = contingencyPlanned - contingencyActual;
        const budgetWithoutReserve = totalPlanned - contingencyPlanned;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">الموازنة بدون احتياطي</p>
              <p className="text-sm font-mono font-bold mt-1">{formatCurrency(budgetWithoutReserve)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">احتياطي الطوارئ (مخطط)</p>
              <p className="text-sm font-mono font-bold mt-1">{formatCurrency(contingencyPlanned)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">احتياطي الطوارئ (مصروف)</p>
              <p className="text-sm font-mono font-bold mt-1 text-destructive">{formatCurrency(contingencyActual)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">المتبقي من الاحتياطي</p>
              <p className={`text-sm font-mono font-bold mt-1 ${contingencyRemaining >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(contingencyRemaining)}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">الاحتياطي الإداري</p>
              <p className="text-sm font-mono font-bold mt-1">{formatCurrency(managementReserve)}</p>
              <p className="text-xs text-muted-foreground mt-1">محجوز لا يُصرف إلا بموافقة خاصة</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
