import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import {
  CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, CHANGE_ORDER_STATUS_COLORS,
  EXPENSE_CATEGORY_LABELS, COST_TYPE_LABELS,
  type ChangeOrderType, type ChangeOrderStatus, type ChangeOrder,
  type ChangeOrderBudgetItem, type ExpenseCategory, type CostType,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, X, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface ChangeOrdersSectionProps {
  projectId: string;
  changeOrders: ChangeOrder[];
  contractValue: number;
  readOnly?: boolean;
}

export function ChangeOrdersSection({ projectId, changeOrders, contractValue, readOnly = false }: ChangeOrdersSectionProps) {
  const { addChangeOrder, updateChangeOrder, deleteChangeOrder } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState<ChangeOrderType>('scope_addition');
  const [amountImpact, setAmountImpact] = useState('');
  const [durationImpact, setDurationImpact] = useState('0');
  const [status, setStatus] = useState<ChangeOrderStatus>('proposed');
  const [requestedBy, setRequestedBy] = useState('');

  // Budget items linked to change order
  const [budgetItemsList, setBudgetItemsList] = useState<ChangeOrderBudgetItem[]>([]);
  const [biCategory, setBiCategory] = useState<ExpenseCategory>('salary');
  const [biDescription, setBiDescription] = useState('');
  const [biAmount, setBiAmount] = useState('');
  const [biCostType, setBiCostType] = useState<CostType>('fixed');
  const [biStartMonth, setBiStartMonth] = useState('');
  const [biEndMonth, setBiEndMonth] = useState('');

  const resetForm = () => {
    setEditingId(null); setDescription(''); setChangeType('scope_addition');
    setAmountImpact(''); setDurationImpact('0'); setStatus('proposed'); setRequestedBy('');
    setBudgetItemsList([]); setBiDescription(''); setBiAmount('');
    setBiStartMonth(''); setBiEndMonth('');
  };

  const openEdit = (co: ChangeOrder) => {
    setEditingId(co.id); setDescription(co.description); setChangeType(co.changeType);
    setAmountImpact(String(co.amountImpact)); setDurationImpact(String(co.durationImpact));
    setStatus(co.status); setRequestedBy(co.requestedBy || '');
    setBudgetItemsList(co.budgetItems || []);
    setOpen(true);
  };

  const addBudgetItemToList = () => {
    if (!biDescription.trim() || !biAmount) return;
    setBudgetItemsList(prev => [...prev, {
      category: biCategory, description: biDescription.trim(),
      plannedAmount: parseFloat(biAmount), costType: biCostType,
      startMonth: biStartMonth ? parseInt(biStartMonth) : undefined,
      endMonth: biEndMonth ? parseInt(biEndMonth) : undefined,
    }]);
    setBiDescription(''); setBiAmount('');
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    const data: any = {
      description: description.trim(), changeType,
      amountImpact: parseFloat(amountImpact) || 0,
      durationImpact: parseInt(durationImpact) || 0,
      status, requestedBy: requestedBy || undefined,
      approvedBy: status === 'approved' ? 'admin' : undefined,
      approvedDate: status === 'approved' ? new Date().toISOString().split('T')[0] : undefined,
      budgetItems: budgetItemsList.length > 0 ? budgetItemsList : undefined,
      autoRebaseline: true,
    };
    try {
      if (editingId) {
        await updateChangeOrder(editingId, data);
        toast.success('تم تعديل أمر التغيير');
      } else {
        await addChangeOrder({ projectId, ...data });
        toast.success('تمت إضافة أمر التغيير');
      }
      resetForm(); setOpen(false);
    } catch (err: any) {
      console.error('[change-order]', err);
      toast.error('حدث خطأ أثناء حفظ أمر التغيير. يرجى المحاولة مرة أخرى.');
    }
  };

  const approvedImpact = changeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveValue = contractValue + approvedImpact;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">أوامر التغيير</h3>
          <p className="text-xs text-muted-foreground">
            الأصلية: {formatCurrency(contractValue)} · المعدّلة: {formatCurrency(effectiveValue)}
            {approvedImpact !== 0 && ` · الأثر: ${approvedImpact > 0 ? '+' : ''}${formatCurrency(approvedImpact)}`}
          </p>
        </div>
        {!readOnly && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />أمر تغيير</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'تعديل أمر التغيير' : 'أمر تغيير جديد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف التغيير المطلوب" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>النوع</Label>
                  <Select value={changeType} onValueChange={(v) => setChangeType(v as ChangeOrderType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANGE_ORDER_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ChangeOrderStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANGE_ORDER_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>الأثر المالي (±)</Label>
                  <Input type="number" value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder="50000" />
                </div>
                <div className="space-y-2">
                  <Label>أثر المدة (أشهر)</Label>
                  <Input type="number" value={durationImpact} onChange={(e) => setDurationImpact(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>طلب بواسطة</Label>
                <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="اختياري" />
              </div>

              {/* ═══ Budget Items ═══ */}
              <div className="border border-border rounded-lg p-3 space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">بنود موازنة مرتبطة</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">تُضاف للموازنة تلقائياً عند الاعتماد</p>
                </div>

                {budgetItemsList.length > 0 && (
                  <div className="space-y-1.5">
                    {budgetItemsList.map((bi, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border border-border bg-muted/30 text-xs">
                        <span className="truncate flex-1">
                          {EXPENSE_CATEGORY_LABELS[bi.category]} — {bi.description} — {formatCurrency(bi.plannedAmount)} ({COST_TYPE_LABELS[bi.costType]})
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setBudgetItemsList(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs font-semibold text-muted-foreground">
                      إجمالي البنود: {formatCurrency(getTotalPlanned(budgetItemsList))}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Select value={biCategory} onValueChange={(v) => setBiCategory(v as ExpenseCategory)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={biCostType} onValueChange={(v) => setBiCostType(v as CostType)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COST_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input className="h-8 text-xs flex-1" placeholder="وصف البند" value={biDescription} onChange={(e) => setBiDescription(e.target.value)} />
                  <Input className="h-8 text-xs w-24" type="number" placeholder="المبلغ" value={biAmount} onChange={(e) => setBiAmount(e.target.value)} />
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={addBudgetItemToList}>+ بند</Button>
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة أمر التغيير'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد أوامر تغيير</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>النوع</th>
                <th>الأثر المالي</th>
                <th>أثر المدة</th>
                <th>بنود</th>
                <th>الحالة</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <tr key={co.id}>
                  <td>{co.description}</td>
                  <td className="text-xs">{CHANGE_ORDER_TYPE_LABELS[co.changeType]}</td>
                  <td className={`font-mono text-sm ${co.amountImpact >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                    {co.amountImpact > 0 ? '+' : ''}{formatCurrency(co.amountImpact)}
                  </td>
                  <td className="text-xs">{co.durationImpact !== 0 ? `${co.durationImpact > 0 ? '+' : ''}${co.durationImpact} شهر` : '—'}</td>
                  <td className="text-xs">
                    {(co.budgetItems || []).length > 0 ? (
                      <span className="text-primary font-medium">{co.budgetItems!.length} بند</span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${CHANGE_ORDER_STATUS_COLORS[co.status]}`}>
                      {CHANGE_ORDER_STATUS_LABELS[co.status]}
                    </span>
                  </td>
                  {!readOnly && (
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(co)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف أمر التغيير" description="هل أنت متأكد من حذف أمر التغيير هذا؟" onConfirm={() => deleteChangeOrder(co.id)} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
