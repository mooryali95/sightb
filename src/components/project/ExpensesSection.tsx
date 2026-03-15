import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type Resource, type Custody, type BudgetItem } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface ExpensesSectionProps {
  projectId: string;
  durationMonths: number;
  expenses: any[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
  revenues: any[];
  contractValue: number;
  readOnly?: boolean;
}

export function ExpensesSection({ projectId, durationMonths, expenses, resources, custodies, budgetItems, revenues, contractValue, readOnly = false }: ExpensesSectionProps) {
  const { addExpense, deleteExpense, updateExpense } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [responsible, setResponsible] = useState('');
  const [resourceId, setResourceId] = useState<string>('');
  const [custodyId, setCustodyId] = useState<string>('');
  const [budgetItemId, setBudgetItemId] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch = !searchQuery || exp.description?.toLowerCase().includes(searchQuery.toLowerCase()) || exp.responsible?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
    const matchesMonth = filterMonth === 'all' || String(exp.month) === filterMonth;
    return matchesSearch && matchesCategory && matchesMonth;
  });

  const matchingBudgetItems = budgetItems.filter(b => b.category === category);

  const resetForm = () => {
    setEditingId(null);
    setCategory('salary');
    setDescription('');
    setAmount('');
    setMonth('1');
    setDate(new Date().toISOString().split('T')[0]);
    setResponsible('');
    setResourceId('');
    setCustodyId('');
    setBudgetItemId('');
  };

  const openEdit = (exp: any) => {
    setEditingId(exp.id);
    setCategory(exp.category);
    setDescription(exp.description);
    setAmount(String(exp.amount));
    setMonth(String(exp.month));
    setDate(exp.date);
    setResponsible(exp.responsible || '');
    setResourceId(exp.resourceId || '');
    setCustodyId(exp.custodyId || '');
    setBudgetItemId(exp.budgetItemId || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    if (editingId) {
      await updateExpense(editingId, {
        category,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        month: parseInt(month),
        responsible: responsible.trim() || undefined,
      });
      toast.success('تم تعديل المصروف');
    } else {
      await addExpense({
        projectId,
        category,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        month: parseInt(month),
        responsible: responsible.trim() || undefined,
        resourceId: resourceId && resourceId !== 'none' ? resourceId : undefined,
        custodyId: custodyId && custodyId !== 'none' ? custodyId : undefined,
        budgetItemId: budgetItemId && budgetItemId !== 'none' ? budgetItemId : undefined,
      });
      toast.success('تمت إضافة المصروف');
    }
    resetForm();
    setOpen(false);
  };

  const responsibleMap = new Map<string, number>();
  expenses.forEach((e) => {
    const key = e.responsible || 'غير محدد';
    responsibleMap.set(key, (responsibleMap.get(key) || 0) + e.amount);
  });

  const resourceSpendMap = new Map<string, number>();
  expenses.forEach((e) => {
    if (e.resourceId) {
      const res = resources.find(r => r.id === e.resourceId);
      const key = res?.name || e.resourceId;
      resourceSpendMap.set(key, (resourceSpendMap.get(key) || 0) + e.amount);
    }
  });

  const totalExpenses = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const totalRevenue = revenues.reduce((s: number, r: any) => s + r.amount, 0);
  const spendFromRevenue = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
  const spendFromContract = contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Spend ratios */}
      <div className="stat-card space-y-3">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>نسبة ما صُرف من قيمة العقد ({spendFromContract.toFixed(1)}%)</span>
            <span>{formatCurrency(totalExpenses)} / {formatCurrency(contractValue)}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${Math.min(spendFromContract, 100)}%` }} />
          </div>
        </div>
        {totalRevenue > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>نسبة ما صُرف من الإيراد ({spendFromRevenue.toFixed(1)}%)</span>
              <span>{formatCurrency(totalExpenses)} / {formatCurrency(totalRevenue)}</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(spendFromRevenue, 100)}%`, backgroundColor: spendFromRevenue > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
            </div>
          </div>
        )}
      </div>

      {/* Resource Spending Summary */}
      {resourceSpendMap.size > 0 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3">ملخص الصرف حسب المورد</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from(resourceSpendMap.entries()).map(([name, total]) => (
              <div key={name} className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responsible Summary */}
      {responsibleMap.size > 1 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3">ملخص الصرف حسب المسؤول</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from(responsibleMap.entries()).map(([name, total]) => (
              <div key={name} className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">سجل المصروفات</h3>
          {!readOnly && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />إضافة مصروف</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'تعديل المصروف' : 'إضافة مصروف جديد'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <Select value={category} onValueChange={(v) => { setCategory(v as ExpenseCategory); setBudgetItemId(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!editingId && matchingBudgetItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>ربط ببند الموازنة <span className="text-muted-foreground text-xs">(مهم للتتبع)</span></Label>
                    <Select value={budgetItemId} onValueChange={setBudgetItemId}>
                      <SelectTrigger><SelectValue placeholder="اختر بند الموازنة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون ربط</SelectItem>
                        {matchingBudgetItems.map((b) => {
                          const spent = expenses.filter((e) => e.budgetItemId === b.id).reduce((s: number, e: any) => s + e.amount, 0);
                          return (
                            <SelectItem key={b.id} value={b.id}>{b.description} — متبقي: {formatCurrency(b.plannedAmount - spent)}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: راتب شهر يناير — أحمد" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المبلغ</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>الشهر</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: durationMonths }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>التاريخ</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>المسؤول</Label>
                    <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="اختياري" />
                  </div>
                </div>
                {!editingId && resources.length > 0 && (
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
                {!editingId && custodies.length > 0 && (
                  <div className="space-y-2">
                    <Label>خصم من عهدة (اختياري)</Label>
                    <Select value={custodyId} onValueChange={setCustodyId}>
                      <SelectTrigger><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون عهدة</SelectItem>
                        {custodies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.resourceName} — متبقي: {formatCurrency(c.remaining)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>

        {/* Search & Filter Bar */}
        {expenses.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            <Input placeholder="بحث بالوصف أو المسؤول..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-xs h-8 text-xs" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الأشهر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأشهر</SelectItem>
                {Array.from({ length: durationMonths }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchQuery || filterCategory !== 'all' || filterMonth !== 'all') && (
              <span className="text-xs text-muted-foreground self-center">({filteredExpenses.length} نتيجة)</span>
            )}
          </div>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد مصروفات مسجلة بعد</p>
        ) : filteredExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج مطابقة للبحث</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th className="hidden sm:table-cell">الشهر</th>
                  <th className="hidden md:table-cell">بند الموازنة</th>
                  <th className="hidden md:table-cell">المورد</th>
                  <th className="hidden lg:table-cell">المسؤول</th>
                  <th className="hidden lg:table-cell">العهدة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => {
                  const resource = resources.find(r => r.id === exp.resourceId);
                  const custody = custodies.find(c => c.id === exp.custodyId);
                  const budgetItem = budgetItems.find(b => b.id === exp.budgetItemId);
                  return (
                    <tr key={exp.id}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</span></td>
                      <td>{exp.description}</td>
                      <td className="font-mono text-sm">{formatCurrency(exp.amount)}</td>
                      <td className="hidden sm:table-cell">شهر {exp.month}</td>
                      <td className="hidden md:table-cell text-xs">{budgetItem?.description || '—'}</td>
                      <td className="hidden md:table-cell text-xs">{resource?.name || '—'}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">{exp.responsible || '—'}</td>
                      <td className="hidden lg:table-cell text-xs">{custody?.resourceName || '—'}</td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(exp)}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <ConfirmDeleteDialog title="حذف المصروف" description="هل أنت متأكد من حذف هذا المصروف؟" onConfirm={() => deleteExpense(exp.id)} />
                        </div>
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
