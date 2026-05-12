import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, COST_TYPE_LABELS, type ExpenseCategory, type Resource,
  type CostType, type CostClass, type BudgetAmendment,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, BarChart3, Pencil, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { MonthlyBudgetPlan } from './MonthlyBudgetPlan';
import { BudgetAmendmentManager } from './BudgetAmendmentManager';

interface BudgetSectionProps {
  projectId: string;
  budgetItems: any[];
  expenses: any[];
  revenues?: any[];
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
  const { addBudgetItem, deleteBudgetItem, updateBudgetItem, updateExpense } = useStore();
  const [activeDraft, setActiveDraft] = useState<BudgetAmendment | null>(null);
  // الموازنة مفتوحة للتعديل عند: عدم القفل، أو وجود مسودة تعديل نشطة
  const isLocked = readOnly || (baselineLocked && !activeDraft);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [description, setDescription] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [startMonth, setStartMonth] = useState<string>('');
  const [endMonth, setEndMonth] = useState<string>('');
  const [costType, setCostType] = useState<CostType>('fixed');
  const [resourceId, setResourceId] = useState<string>('');

  const resetForm = () => {
    setEditingId(null);
    setCategory('salary');
    setDescription('');
    setPlannedAmount('');
    setStartMonth('');
    setEndMonth('');
    setCostType('fixed');
    setResourceId('');
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setCategory(item.category);
    setDescription(item.description);
    setPlannedAmount(String(item.plannedAmount));
    setStartMonth(item.startMonth ? String(item.startMonth) : '');
    setEndMonth(item.endMonth ? String(item.endMonth) : '');
    setCostType(item.costType || 'fixed');
    setResourceId(item.resourceId || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !plannedAmount) return;
    const sm = startMonth && startMonth !== 'all' ? parseInt(startMonth) : undefined;
    const em = endMonth && endMonth !== 'all' ? parseInt(endMonth) : undefined;
    const data = {
      category,
      description: description.trim(),
      plannedAmount: parseFloat(plannedAmount),
      startMonth: sm,
      endMonth: em || sm,
      month: sm,
      costType,
      costClass: 'direct' as CostClass,
      resourceId: resourceId && resourceId !== 'none' ? resourceId : undefined,
    };
    if (editingId) {
      await updateBudgetItem(editingId, data);
      toast.success('تم تعديل بند الموازنة');
    } else {
      await addBudgetItem({ projectId, ...data });
      toast.success('تمت إضافة بند الموازنة');
    }
    resetForm();
    setOpen(false);
  };

  const totalPlanned = getTotalPlanned(budgetItems);
  const totalActual = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const taxAmount = contractValue > 0 && taxPercent > 0 ? contractValue * (taxPercent / 100) : 0;
  const contractValueInclTax = contractValue + taxAmount;
  const unallocated = contractValue - totalPlanned;
  const plannedProfit = contractValue - totalPlanned;
  const plannedProfitMargin = contractValue > 0 ? (plannedProfit / contractValue) * 100 : 0;

  const categoryMap = new Map<string, { planned: number; actual: number }>();
  budgetItems.forEach((b: any) => {
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
  expenses.forEach((e: any) => {
    const entry = categoryMap.get(e.category) || { planned: 0, actual: 0 };
    entry.actual += e.amount;
    categoryMap.set(e.category, entry);
  });

  const getActualForItem = (item: any) => {
    return expenses.filter((e: any) => e.budgetItemId === item.id).reduce((s: number, e: any) => s + e.amount, 0);
  };

  const unlinkedExpenses = expenses.filter((e: any) => !e.budgetItemId);
  const unlinkedByCategory = new Map<string, number>();
  unlinkedExpenses.forEach((e: any) => {
    unlinkedByCategory.set(e.category, (unlinkedByCategory.get(e.category) || 0) + e.amount);
  });

  const budgetUtilization = contractValue > 0 ? (totalPlanned / contractValue) * 100 : 0;
  const spendRate = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const getMonthDisplay = (item: any) => {
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
          <ResponsiveFormDialog
            open={open}
            onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}
            title={editingId ? 'تعديل بند الموازنة' : 'إضافة بند موازنة'}
            trigger={<Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />بند جديد</Button>}
            footer={<FormFooter onCancel={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
          >
            <div className="space-y-4">
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: راتب أحمد × 4 أشهر" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المبلغ المخطط</Label>
                    <Input type="number" inputMode="decimal" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع التكلفة</Label>
                    <Select value={costType} onValueChange={(v) => setCostType(v as CostType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(COST_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {costType === 'recurring' && (
                  <p className="text-xs text-muted-foreground">
                    هذا المبلغ سيتكرر كل شهر — الإجمالي: {formatCurrency(
                      (parseFloat(plannedAmount) || 0) * Math.max(1, ((parseInt(endMonth) || parseInt(startMonth) || 1) - (parseInt(startMonth) || 1) + 1))
                    )}
                  </p>
                )}
                {costType === 'fixed' && startMonth && endMonth && startMonth !== endMonth && startMonth !== 'all' && (
                  <p className="text-xs text-muted-foreground">سيُوزّع بالتساوي على الأشهر المحددة</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>من شهر <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                    <Select value={startMonth} onValueChange={setStartMonth}>
                      <SelectTrigger><SelectValue placeholder="موزع على الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">موزع على كل الأشهر</SelectItem>
                        {Array.from({ length: durationMonths }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>إلى شهر</Label>
                    <Select value={endMonth} onValueChange={setEndMonth} disabled={!startMonth || startMonth === 'all'}>
                      <SelectTrigger><SelectValue placeholder="نفس الشهر" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: durationMonths }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {resources.length > 0 && (
                  <div className="space-y-2">
                    <Label>المورد (اختياري)</Label>
                    <Select value={resourceId} onValueChange={setResourceId}>
                      <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون مورد</SelectItem>
                        {resources.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name} {r.role ? `(${r.role})` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
            </div>
          </ResponsiveFormDialog>
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
                  const match = budgetItems.find((b: any) => b.category === exp.category && b.projectId === exp.projectId);
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
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory]}</span></td>
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
                      <td className="text-xs text-muted-foreground">{COST_TYPE_LABELS[item.costType as CostType] || 'ثابت'}</td>
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
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
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

      {/* Reserves Analysis */}
      {budgetItems.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">تحليل الاحتياطيات</h3>
          {(() => {
            const contingencyPlanned = getTotalPlanned(budgetItems.filter((b: any) => b.category === 'contingency'));
            const contingencyActual = expenses.filter((e: any) => e.category === 'contingency').reduce((s: number, e: any) => s + e.amount, 0);
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
                  <p className={`text-sm font-mono font-bold mt-1 ${contingencyRemaining >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
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
      )}
    </div>
  );
}
