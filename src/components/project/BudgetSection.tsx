import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, COST_TYPE_LABELS, type ExpenseCategory, type Resource,
  type BudgetAmendment, type BudgetItem, type Expense, type Revenue,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { MonthlyBudgetPlan } from './MonthlyBudgetPlan';
import { BudgetAmendmentManager } from './BudgetAmendmentManager';
import { BudgetItemFormDialog } from './budget/BudgetItemFormDialog';
import { BudgetPlanningSummary } from './budget/BudgetPlanningSummary';
import { ReservesCard } from './budget/ReservesCard';

interface BudgetSectionProps {
  projectId: string;
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues?: Revenue[];
  durationMonths: number;
  resources: Resource[];
  contractValue: number;
  currency: string;
  managementReserve?: number;
  readOnly?: boolean;
  baselineLocked?: boolean;
  taxPercent?: number;
  startDate?: string;
}

export function BudgetSection({ projectId, budgetItems, expenses, revenues = [], durationMonths, resources, contractValue, currency, managementReserve = 0, readOnly = false, baselineLocked = false, taxPercent = 15, startDate }: BudgetSectionProps) {
  const { deleteBudgetItem, updateExpense, paymentRequests } = useStore();
  const outstandingAdvancesTotal = paymentRequests
    .filter((r) => r.projectId === projectId && r.requestType === 'advance' && r.status === 'paid' && r.isAdvanceOutstanding)
    .reduce((s, r) => s + r.amount, 0);
  const outstandingAdvancesCount = paymentRequests
    .filter((r) => r.projectId === projectId && r.requestType === 'advance' && r.status === 'paid' && r.isAdvanceOutstanding).length;
  const [activeDraft, setActiveDraft] = useState<BudgetAmendment | null>(null);
  // الموازنة مفتوحة للتعديل عند: عدم القفل، أو وجود مسودة تعديل نشطة
  const isLocked = readOnly || (baselineLocked && !activeDraft);
  // ─── The item form (add and edit) ───
  // Owns its own state; remounted (via `key`) on every open so an edit starts
  // from the row and an add starts blank. See useDialogSession.
  const form = useDialogSession<{ item?: BudgetItem }>();

  // A rejected expense is not spend, here as on every other screen. Every
  // actual figure below reads this list.
  const countedExpenses = expenses.filter((e) => e.approvalStatus !== 'rejected');

  const totalPlanned = getTotalPlanned(budgetItems);
  const totalActual = countedExpenses.reduce((s, e) => s + e.amount, 0);
  const getActualForItem = (item: BudgetItem) => {
    return countedExpenses.filter((e) => e.budgetItemId === item.id).reduce((s, e) => s + e.amount, 0);
  };

  const unlinkedExpenses = expenses.filter((e) => !e.budgetItemId);
  const unlinkedByCategory = new Map<string, number>();
  unlinkedExpenses.forEach((e) => {
    unlinkedByCategory.set(e.category, (unlinkedByCategory.get(e.category) || 0) + e.amount);
  });


  const getMonthDisplay = (item: BudgetItem) => {
    if (item.startMonth && item.endMonth && item.startMonth !== item.endMonth) {
      return `شهر ${item.startMonth} → ${item.endMonth}`;
    }
    if (item.startMonth) return `شهر ${item.startMonth}`;
    if (item.month) return `شهر ${item.month}`;
    return 'موزع';
  };

  return (
    <div className="space-y-4">
      <BudgetAmendmentManager
        projectId={projectId}
        baselineLocked={baselineLocked}
        readOnly={readOnly}
        onAmendmentChange={setActiveDraft}
      />

      {budgetItems.length > 0 && (
        <BudgetPlanningSummary
          budgetItems={budgetItems}
          countedExpenses={countedExpenses}
          contractValue={contractValue}
          taxPercent={taxPercent}
          outstandingAdvances={{ total: outstandingAdvancesTotal, count: outstandingAdvancesCount }}
        />
      )}

      {budgetItems.length > 0 && (
        <MonthlyBudgetPlan
          budgetItems={budgetItems}
          expenses={expenses}
          revenues={revenues}
          durationMonths={durationMonths}
          startDate={startDate}
          currency={currency}
        />
      )}

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              بنود الموازنة
              {activeDraft && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
                  <Unlock className="w-3 h-3" /> وضع التعديل نشط
                </span>
              )}
            </h3>
            {baselineLocked && !readOnly && !activeDraft && (
              <div className="text-xs health-warning mt-1 flex items-center gap-2 flex-wrap">
                <span>🔒 الموازنة مقفلة — استخدم "فتح الموازنة للتعديل" أعلاه أو أنشئ أمر تغيير</span>
                <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => {
                  const tab = document.querySelector('[value="changeorders"]') as HTMLElement;
                  tab?.click();
                }}>أمر تغيير</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              الإجمالي المخطط: {formatCurrency(totalPlanned)} · الفعلي: {formatCurrency(totalActual)} · المتبقي: {formatCurrency(totalPlanned - totalActual)}
            </p>
          </div>
          {!isLocked && (
          <BudgetItemFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.item}
            projectId={projectId}
            durationMonths={durationMonths}
            resources={resources}
          />
          )}
        </div>

      {!isLocked && unlinkedByCategory.size > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">⚠️ مصروفات غير مربوطة ببنود الموازنة</p>
            <ul className="mt-1 text-xs text-destructive/80 space-y-0.5">
              {Array.from(unlinkedByCategory.entries()).map(([cat, total]) => (
                <li key={cat}>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}: {formatCurrency(total)}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5 text-xs"
              onClick={async () => {
                let linked = 0;
                for (const exp of unlinkedExpenses) {
                  const match = budgetItems.find((b) => b.category === exp.category && b.projectId === exp.projectId);
                  if (match) {
                    await updateExpense(exp.id, { budgetItemId: match.id });
                    linked++;
                  }
                }
                if (linked > 0) toast.success(`تم ربط ${linked} مصروف تلقائياً`);
                else toast.info('لم يتم العثور على بنود مطابقة');
              }}
            >
              ربط تلقائي حسب الفئة
            </Button>
          </div>
        )}

        {budgetItems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-2">لا توجد بنود موازنة بعد</p>
            <p className="text-xs text-muted-foreground">ابدأ بإضافة بنود الموازنة، ثم أنشئ خط أساس، ثم سجّل المصروفات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المورد</th>
                  <th>الفترة</th>
                  <th>النوع</th>
                  <th>المخطط</th>
                  <th>الفعلي (مربوط)</th>
                  <th className="hidden sm:table-cell">المتبقي</th>
                  <th className="hidden md:table-cell">نسبة الصرف</th>
                  {!isLocked && <th></th>}
                </tr>
              </thead>
              <tbody>
                {budgetItems.map((item) => {
                  const itemTotalPlanned = item.costType === 'recurring' && item.startMonth && item.endMonth && item.endMonth > item.startMonth
                    ? item.plannedAmount * (item.endMonth - item.startMonth + 1)
                    : item.plannedAmount;
                  const actual = getActualForItem(item);
                  const remaining = itemTotalPlanned - actual;
                  const spentPct = itemTotalPlanned > 0 ? (actual / itemTotalPlanned) * 100 : 0;
                  const resource = resources.find(r => r.id === item.resourceId);
                  return (
                    <tr key={item.id} className={spentPct > 100 ? 'bg-destructive/5' : ''}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[item.category]}</span></td>
                      <td>
                        {item.description.startsWith('[أمر تغيير]') ? (
                          <span className="flex items-center gap-1">
                            <span className="text-xs px-1 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">CO</span>
                            <span>{item.description.replace('[أمر تغيير] ', '')}</span>
                          </span>
                        ) : item.description}
                      </td>
                      <td className="text-xs">{resource?.name || '—'}</td>
                      <td className="text-xs text-muted-foreground">{getMonthDisplay(item)}</td>
                      <td className="text-xs text-muted-foreground">{COST_TYPE_LABELS[item.costType] || 'ثابت'}</td>
                      <td className="font-mono text-sm">
                        {formatCurrency(item.plannedAmount)}
                        {item.costType === 'recurring' && item.startMonth && item.endMonth && item.endMonth > item.startMonth && (
                          <span className="block text-xs text-muted-foreground">إجمالي: {formatCurrency(itemTotalPlanned)}</span>
                        )}
                      </td>
                      <td className="font-mono text-sm">{formatCurrency(actual)}</td>
                      <td className="hidden sm:table-cell">
                        <span className={remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(remaining)}</span>
                      </td>
                      <td className="hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(spentPct, 100)}%`, backgroundColor: spentPct > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{spentPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      {!isLocked && (
                      <td>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" onClick={() => form.open({ item })}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <ConfirmDeleteDialog title="حذف بند الموازنة" description="هل أنت متأكد من حذف هذا البند؟" onConfirm={() => deleteBudgetItem(item.id)} />
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {budgetItems.length > 0 && (
        <ReservesCard
          budgetItems={budgetItems}
          countedExpenses={countedExpenses}
          totalPlanned={totalPlanned}
          managementReserve={managementReserve}
        />
      )}
    </div>
  );
}
