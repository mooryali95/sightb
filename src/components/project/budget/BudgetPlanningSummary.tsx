/**
 * The planning summary: the contract against what was planned, what is
 * unallocated and the planned profit; outstanding advances shown as
 * recoverable outside actual cost; the two utilisation bars; and the
 * per-category table. A recurring item counts once per month everywhere.
 */
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type BudgetItem, type Expense, type ExpenseCategory } from '@/types/project';
import { BarChart3 } from 'lucide-react';

interface Props {
  budgetItems: BudgetItem[];
  /** Expenses that count as spend: rejected rows already left out. */
  countedExpenses: Expense[];
  contractValue: number;
  taxPercent: number;
  outstandingAdvances: { total: number; count: number };
}

export function BudgetPlanningSummary({ budgetItems, countedExpenses, contractValue, taxPercent, outstandingAdvances }: Props) {
  const totalPlanned = getTotalPlanned(budgetItems);
  const totalActual = countedExpenses.reduce((s, e) => s + e.amount, 0);
  const taxAmount = contractValue > 0 && taxPercent > 0 ? contractValue * (taxPercent / 100) : 0;
  const contractValueInclTax = contractValue + taxAmount;
  const unallocated = contractValue - totalPlanned;
  const plannedProfit = contractValue - totalPlanned;
  const plannedProfitMargin = contractValue > 0 ? (plannedProfit / contractValue) * 100 : 0;

  const categoryMap = new Map<string, { planned: number; actual: number }>();
  budgetItems.forEach((b) => {
    const entry = categoryMap.get(b.category) || { planned: 0, actual: 0 };
    // Account for recurring items
    if (b.costType === 'recurring') {
      const start = b.startMonth || 1;
      const end = b.endMonth || b.startMonth || 1;
      const months = Math.max(1, end - start + 1);
      entry.planned += b.plannedAmount * months;
    } else {
      entry.planned += b.plannedAmount;
    }
    categoryMap.set(b.category, entry);
  });
  countedExpenses.forEach((e) => {
    const entry = categoryMap.get(e.category) || { planned: 0, actual: 0 };
    entry.actual += e.amount;
    categoryMap.set(e.category, entry);
  });

  const budgetUtilization = contractValue > 0 ? (totalPlanned / contractValue) * 100 : 0;
  const spendRate = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  return (
    <div className="stat-card">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        ملخص تخطيط الموازنة
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">قيمة العقد (بدون ضريبة)</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(contractValue)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">الضريبة ({taxPercent}%)</p>
          <p className="text-sm font-mono font-bold mt-1 health-warning">{formatCurrency(taxAmount)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">شامل الضريبة</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(contractValueInclTax)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">إجمالي المخطط</p>
          <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalPlanned)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">غير مخصص</p>
          <p className={`text-sm font-mono font-bold mt-1 ${unallocated >= 0 ? 'health-good' : 'text-destructive'}`}>
            {formatCurrency(unallocated)}
          </p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
          <p className="text-xs text-muted-foreground">الربح المخطط</p>
          <p className={`text-sm font-mono font-bold mt-1 ${plannedProfit >= 0 ? 'health-good' : 'text-destructive'}`}>
            {formatCurrency(plannedProfit)} <span className="text-xs">({plannedProfitMargin.toFixed(1)}%)</span>
          </p>
        </div>
      </div>

      {outstandingAdvances.total > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">سلف قائمة (لم تُسوَّ بعد)</p>
            <p className="text-[11px] text-muted-foreground">
              أصول قابلة للاسترداد — لا تدخل في التكلفة الفعلية (AC) ولا في حساب CPI حتى تتم تسويتها.
            </p>
          </div>
          <div className="text-left">
            <p className="text-sm font-mono font-bold text-amber-700 dark:text-amber-400">
              {formatCurrency(outstandingAdvances.total)}
            </p>
            <p className="text-[11px] text-muted-foreground">{outstandingAdvances.count} سلفة</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>نسبة ما خُطط للصرف من الموازنة ({budgetUtilization.toFixed(1)}%)</span>
          <span>{formatCurrency(totalPlanned)} / {formatCurrency(contractValue)}</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${Math.min(budgetUtilization, 100)}%` }} />
        </div>
      </div>

      {totalActual > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>نسبة ما صُرف من الموازنة المخططة ({spendRate.toFixed(1)}%)</span>
            <span>{formatCurrency(totalActual)} / {formatCurrency(totalPlanned)}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(spendRate, 100)}%`, backgroundColor: spendRate > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
          </div>
        </div>
      )}

      {categoryMap.size > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفئة</th>
                <th>المخطط</th>
                <th>الفعلي</th>
                <th>المتبقي</th>
                <th>النسبة من العقد</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(categoryMap.entries()).map(([cat, { planned, actual }]) => {
                const rem = planned - actual;
                const pctOfContract = contractValue > 0 ? (planned / contractValue) * 100 : 0;
                return (
                  <tr key={cat}>
                    <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat}</span></td>
                    <td className="font-mono text-sm">{formatCurrency(planned)}</td>
                    <td className="font-mono text-sm">{formatCurrency(actual)}</td>
                    <td><span className={rem >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(rem)}</span></td>
                    <td className="text-xs text-muted-foreground">{pctOfContract.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr className="font-semibold border-t-2 border-border">
                <td>الإجمالي</td>
                <td className="font-mono text-sm">{formatCurrency(totalPlanned)}</td>
                <td className="font-mono text-sm">{formatCurrency(totalActual)}</td>
                <td><span className={totalPlanned - totalActual >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(totalPlanned - totalActual)}</span></td>
                <td className="text-xs">{budgetUtilization.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
