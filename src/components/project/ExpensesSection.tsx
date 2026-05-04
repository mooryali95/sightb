import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency, calcVAT, addVAT, removeVAT } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS,
  type ExpenseCategory, type ApprovalStatus, type Resource, type Custody, type BudgetItem,
} from '@/types/project';
import { getActiveFund, getFundRemaining } from '@/lib/funds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Check, X, AlertCircle, Wallet } from 'lucide-react';
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
  taxPercent?: number;
  projectStatus?: string;
}

export function ExpensesSection({ projectId, durationMonths, expenses, resources, custodies, budgetItems, revenues, contractValue, readOnly = false, taxPercent = 15, projectStatus }: ExpensesSectionProps) {
  const { addExpense, deleteExpense, updateExpense, projectFunds } = useStore();
  const { isAdmin } = useRole();
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
  const [fundId, setFundId] = useState<string>('');
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('approved');
  const [vendor, setVendor] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [isVatExempt, setIsVatExempt] = useState(false);
  const [inputInclusive, setInputInclusive] = useState(false);

  const activeFund = useMemo(
    () => getActiveFund(projectId, projectFunds),
    [projectId, projectFunds],
  );
  const fundIsRequired = !!activeFund;
  const activeFundRemaining = activeFund
    ? getFundRemaining(activeFund, expenses)
    : 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterApproval, setFilterApproval] = useState<string>('all');

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch = !searchQuery || exp.description?.toLowerCase().includes(searchQuery.toLowerCase()) || exp.responsible?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
    const matchesMonth = filterMonth === 'all' || String(exp.month) === filterMonth;
    const matchesApproval = filterApproval === 'all' || exp.approvalStatus === filterApproval;
    return matchesSearch && matchesCategory && matchesMonth && matchesApproval;
  });

  const matchingBudgetItems = budgetItems.filter(b => b.category === category);

  const pendingCount = expenses.filter(e => e.approvalStatus === 'pending').length;

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
    setFundId('');
    setApprovalStatus('approved');
    setVendor('');
    setInvoiceRef('');
    setIsVatExempt(false);
    setInputInclusive(false);
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
    setFundId(exp.fundId || '');
    setApprovalStatus(exp.approvalStatus || 'approved');
    setVendor(exp.vendor || '');
    setInvoiceRef(exp.invoiceRef || '');
    setIsVatExempt(exp.isVatExempt || false);
    setInputInclusive(false);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    const rawAmount = parseFloat(amount);
    const finalAmount = (inputInclusive && !isVatExempt) ? removeVAT(rawAmount, taxPercent) : rawAmount;

    // التحقق: ربط بدفعة إلزامي عند وجود دفعة نشطة
    const effectiveFundId = fundId && fundId !== 'none' ? fundId : undefined;
    if (fundIsRequired && !editingId && !effectiveFundId) {
      toast.error('يجب ربط المصروف بالدفعة النشطة');
      return;
    }

    if (editingId) {
      await updateExpense(editingId, {
        category,
        description: description.trim(),
        amount: finalAmount,
        date,
        month: parseInt(month),
        responsible: responsible.trim() || undefined,
        approvalStatus,
        vendor: vendor.trim() || undefined,
        invoiceRef: invoiceRef.trim() || undefined,
        isVatExempt,
        fundId: effectiveFundId,
      });
      toast.success('تم تعديل المصروف');
    } else {
      await addExpense({
        projectId,
        category,
        description: description.trim(),
        amount: finalAmount,
        date,
        month: parseInt(month),
        responsible: responsible.trim() || undefined,
        resourceId: resourceId && resourceId !== 'none' ? resourceId : undefined,
        custodyId: custodyId && custodyId !== 'none' ? custodyId : undefined,
        budgetItemId: budgetItemId && budgetItemId !== 'none' ? budgetItemId : undefined,
        approvalStatus,
        vendor: vendor.trim() || undefined,
        invoiceRef: invoiceRef.trim() || undefined,
        isVatExempt,
        fundId: effectiveFundId,
      });
      toast.success('تمت إضافة المصروف');

      // Auto-activate project on first expense
      if (projectStatus && ['planning', 'approved', 'pending_approval'].includes(projectStatus)) {
        const { updateProject } = useStore.getState();
        await updateProject(projectId, { status: 'active' });
        toast.info('المشروع تحوّل لحالة "نشط" تلقائياً');
      }
    }
    resetForm();
    setOpen(false);
  };

  const handleApprove = async (expId: string) => {
    await updateExpense(expId, { approvalStatus: 'approved' });
    toast.success('تم اعتماد المصروف');
  };

  const handleReject = async (expId: string) => {
    await updateExpense(expId, { approvalStatus: 'rejected' });
    toast.success('تم رفض المصروف');
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

  const totalExpenses = expenses.filter(e => e.approvalStatus !== 'rejected').reduce((s: number, e: any) => s + e.amount, 0);
  const totalRevenue = revenues.reduce((s: number, r: any) => s + r.amount, 0);
  const spendFromRevenue = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
  const spendFromContract = contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Pending approval alert */}
      {pendingCount > 0 && !readOnly && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {pendingCount} مصروف بانتظار الاعتماد
          </p>
        </div>
      )}

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
                {/* Fund linking */}
                {fundIsRequired && activeFund && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      ربط بدفعة الصرفيات
                      <span className="text-destructive text-xs">*</span>
                    </Label>
                    <Select
                      value={fundId || activeFund.id}
                      onValueChange={setFundId}
                      disabled={!!editingId && !isAdmin}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={activeFund.id}>
                          الدفعة #{activeFund.fundNumber} — متبقي: {formatCurrency(activeFundRemaining)}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {!!editingId && !isAdmin && (
                      <p className="text-xs text-muted-foreground">
                        🔒 لا يمكن تغيير ربط الدفعة بعد الإنشاء (للأدمن فقط)
                      </p>
                    )}
                    {parseFloat(amount) > 0 && parseFloat(amount) > activeFundRemaining && (
                      <p className="text-xs text-destructive">
                        ⚠️ المبلغ يتجاوز رصيد الدفعة المتبقي — سيُرفض من النظام
                      </p>
                    )}
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

                {/* VAT controls */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={isVatExempt} onChange={(e) => { setIsVatExempt(e.target.checked); if (e.target.checked) setInputInclusive(false); }} className="rounded" />
                    معفى من الضريبة
                  </label>
                  {!isVatExempt && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={inputInclusive} onChange={(e) => setInputInclusive(e.target.checked)} className="rounded" />
                      المبلغ شامل الضريبة
                    </label>
                  )}
                </div>
                {parseFloat(amount) > 0 && !isVatExempt && taxPercent > 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    {inputInclusive
                      ? `بدون ضريبة: ${formatCurrency(removeVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(parseFloat(amount) - removeVAT(parseFloat(amount), taxPercent))}`
                      : `شامل الضريبة: ${formatCurrency(addVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(calcVAT(parseFloat(amount), taxPercent))}`
                    }
                  </p>
                )}

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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المورّد</Label>
                    <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="اختياري" />
                  </div>
                  <div className="space-y-2">
                    <Label>مرجع الفاتورة</Label>
                    <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="اختياري" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>حالة الاعتماد</Label>
                  <Select value={approvalStatus} onValueChange={(v) => setApprovalStatus(v as ApprovalStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        {custodies.map((c) => {
                          const custodySpent = expenses.filter(e => e.custodyId === c.id).reduce((s: number, e: any) => s + e.amount, 0);
                          const custodyRemaining = c.amount - custodySpent;
                          return (
                            <SelectItem key={c.id} value={c.id}>{c.resourceName} — متبقي: {formatCurrency(custodyRemaining)}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {custodyId && custodyId !== 'none' && (() => {
                      const c = custodies.find(c => c.id === custodyId);
                      if (!c) return null;
                      const spent = expenses.filter(e => e.custodyId === c.id).reduce((s: number, e: any) => s + e.amount, 0);
                      const selectedCustody = { ...c, spent, remaining: c.amount - spent };
                      const parsedAmount = parseFloat(amount) || 0;
                      return (
                        <div className="space-y-1">
                          <p className={`text-xs ${selectedCustody.remaining > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                            المتبقي من العهدة: {formatCurrency(selectedCustody.remaining)}
                            {selectedCustody.remaining <= 0 && ' ⚠️ العهدة مستنفدة'}
                          </p>
                          {parsedAmount > 0 && parsedAmount > selectedCustody.remaining && (
                            <p className="text-xs text-destructive">
                              ⚠️ المبلغ ({formatCurrency(parsedAmount)}) يتجاوز المتبقي ({formatCurrency(selectedCustody.remaining)})
                            </p>
                          )}
                        </div>
                      );
                    })()}
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
            <Select value={filterApproval} onValueChange={setFilterApproval}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchQuery || filterCategory !== 'all' || filterMonth !== 'all' || filterApproval !== 'all') && (
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
                  <th className="w-16">الضريبة</th>
                  <th>الحالة</th>
                  <th className="hidden sm:table-cell">الشهر</th>
                  <th className="hidden md:table-cell">بند الموازنة</th>
                  <th className="hidden md:table-cell">المورد</th>
                  <th className="hidden lg:table-cell">المسؤول</th>
                  <th className="hidden lg:table-cell">العهدة</th>
                  {!readOnly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => {
                  const resource = resources.find(r => r.id === exp.resourceId);
                  const custody = custodies.find(c => c.id === exp.custodyId);
                  const budgetItem = budgetItems.find(b => b.id === exp.budgetItemId);
                  const status = exp.approvalStatus || 'approved';
                  return (
                    <tr key={exp.id} className={status === 'rejected' ? 'opacity-50' : ''}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</span></td>
                      <td>
                        <div>
                          {exp.description}
                          {exp.vendor && <span className="block text-xs text-muted-foreground">{exp.vendor}</span>}
                        </div>
                      </td>
                      <td className="font-mono text-sm">{formatCurrency(exp.amount)}</td>
                      <td className="text-xs">
                        {exp.isVatExempt ? (
                          <span className="text-muted-foreground">معفى</span>
                        ) : taxPercent > 0 ? (
                          <span className="text-emerald-600" title={`شامل: ${formatCurrency(addVAT(exp.amount, taxPercent))}`}>
                            +{formatCurrency(calcVAT(exp.amount, taxPercent))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[status as ApprovalStatus] || ''}`}>
                          {APPROVAL_STATUS_LABELS[status as ApprovalStatus] || status}
                        </Badge>
                      </td>
                      <td className="hidden sm:table-cell">شهر {exp.month}</td>
                      <td className="hidden md:table-cell text-xs">{budgetItem?.description || '—'}</td>
                      <td className="hidden md:table-cell text-xs">{resource?.name || '—'}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">{exp.responsible || '—'}</td>
                      <td className="hidden lg:table-cell text-xs">{custody?.resourceName || '—'}</td>
                      {!readOnly && (
                      <td>
                        <div className="flex items-center gap-0.5">
                          {status === 'pending' && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleApprove(exp.id)} title="اعتماد">
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReject(exp.id)} title="رفض">
                                <X className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEdit(exp)}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <ConfirmDeleteDialog title="حذف المصروف" description="هل أنت متأكد من حذف هذا المصروف؟" onConfirm={() => deleteExpense(exp.id)} />
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
    </div>
  );
}
