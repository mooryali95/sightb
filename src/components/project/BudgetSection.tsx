import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type Resource } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface BudgetSectionProps {
  projectId: string;
  budgetItems: any[];
  expenses: any[];
  durationMonths: number;
  resources: Resource[];
  contractValue: number;
  currency: string;
}

export function BudgetSection({ projectId, budgetItems, expenses, durationMonths, resources, contractValue, currency }: BudgetSectionProps) {
  const { addBudgetItem, deleteBudgetItem } = useStore();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [description, setDescription] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [month, setMonth] = useState<string>('');
  const [resourceId, setResourceId] = useState<string>('');

  const handleAdd = async () => {
    if (!description.trim() || !plannedAmount) return;
    await addBudgetItem({
      projectId,
      category,
      description: description.trim(),
      plannedAmount: parseFloat(plannedAmount),
      month: month && month !== 'all' ? parseInt(month) : undefined,
      resourceId: resourceId && resourceId !== 'none' ? resourceId : undefined,
    });
    setDescription(''); setPlannedAmount(''); setMonth(''); setResourceId('');
    setOpen(false);
    toast.success('تمت إضافة بند الموازنة');
  };

  const totalPlanned = budgetItems.reduce((s: number, b: any) => s + b.plannedAmount, 0);
  const totalActual = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const unallocated = contractValue - totalPlanned;
  const plannedProfit = contractValue - totalPlanned;
  const actualProfit = contractValue - totalActual;
  const plannedProfitMargin = contractValue > 0 ? (plannedProfit / contractValue) * 100 : 0;

  const categoryMap = new Map<string, { planned: number; actual: number }>();
  budgetItems.forEach((b: any) => {
    const entry = categoryMap.get(b.category) || { planned: 0, actual: 0 };
    entry.planned += b.plannedAmount;
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

  return (
    <div className="space-y-4">
      {budgetItems.length > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            ملخص تخطيط الموازنة
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">قيمة العقد</p>
              <p className="text-sm font-mono font-bold mt-1">{formatCurrency(contractValue)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">إجمالي المخطط</p>
              <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalPlanned)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">غير مخصص</p>
              <p className={`text-sm font-mono font-bold mt-1 ${unallocated >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {formatCurrency(unallocated)}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">الربح المخطط</p>
              <p className={`text-sm font-mono font-bold mt-1 ${plannedProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
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

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">بنود الموازنة</h3>
            <p className="text-xs text-muted-foreground">
              الإجمالي المخطط: {formatCurrency(totalPlanned)} · الفعلي: {formatCurrency(totalActual)} · المتبقي: {formatCurrency(totalPlanned - totalActual)}
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />بند جديد</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة بند موازنة</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
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
                    <Input type="number" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>الشهر <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger><SelectValue placeholder="موزع على الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">موزع على كل الأشهر</SelectItem>
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
                <Button onClick={handleAdd} className="w-full">إضافة</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {unlinkedByCategory.size > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">⚠️ مصروفات غير مربوطة ببنود الموازنة</p>
            <ul className="mt-1 text-xs text-destructive/80 space-y-0.5">
              {Array.from(unlinkedByCategory.entries()).map(([cat, total]) => (
                <li key={cat}>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}: {formatCurrency(total)}</li>
              ))}
            </ul>
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
                  <th>الشهر</th>
                  <th>المخطط</th>
                  <th>الفعلي (مربوط)</th>
                  <th className="hidden sm:table-cell">المتبقي</th>
                  <th className="hidden md:table-cell">نسبة الصرف</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {budgetItems.map((item) => {
                  const actual = getActualForItem(item);
                  const remaining = item.plannedAmount - actual;
                  const spentPct = item.plannedAmount > 0 ? (actual / item.plannedAmount) * 100 : 0;
                  const resource = resources.find(r => r.id === item.resourceId);
                  return (
                    <tr key={item.id} className={spentPct > 100 ? 'bg-destructive/5' : ''}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[item.category as ExpenseCategory]}</span></td>
                      <td>{item.description}</td>
                      <td className="text-xs">{resource?.name || '—'}</td>
                      <td className="text-xs text-muted-foreground">{item.month ? `شهر ${item.month}` : 'موزع'}</td>
                      <td className="font-mono text-sm">{formatCurrency(item.plannedAmount)}</td>
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
                      <td>
                        <ConfirmDeleteDialog title="حذف بند الموازنة" description="هل أنت متأكد من حذف هذا البند؟" onConfirm={() => deleteBudgetItem(item.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
