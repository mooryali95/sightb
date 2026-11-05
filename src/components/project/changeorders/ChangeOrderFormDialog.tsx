/**
 * The change-order form, for adding and for editing, with the budget items
 * an order carries (added to the budget when it is approved).
 *
 * The section remounts this component (via `key`) on every open. An edit
 * starts from the row's values through the `useState` initialisers below,
 * and an add starts blank, so there is no reset handler. The trigger button
 * is rendered here (the responsive dialog wants it as a prop) but opening is
 * the section's call through `onRequestOpen`, so the remount happens first.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import {
  CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, EXPENSE_CATEGORY_LABELS, COST_TYPE_LABELS,
  type ChangeOrderType, type ChangeOrderStatus, type ChangeOrder, type ChangeOrderBudgetItem, type ExpenseCategory, type CostType,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, X, Package } from 'lucide-react';
import { toast } from 'sonner';
import { todayLocal } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new order. */
  editing?: ChangeOrder;
  projectId: string;
}

export function ChangeOrderFormDialog({ open, onOpenChange, onRequestOpen, editing, projectId }: Props) {
  const { addChangeOrder, updateChangeOrder } = useStore();
  const editingId = editing?.id ?? null;
  const [description, setDescription] = useState(editing?.description ?? '');
  const [changeType, setChangeType] = useState<ChangeOrderType>(editing?.changeType ?? 'scope_addition');
  const [amountImpact, setAmountImpact] = useState(editing ? String(editing.amountImpact) : '');
  const [durationImpact, setDurationImpact] = useState(editing ? String(editing.durationImpact) : '0');
  const [status, setStatus] = useState<ChangeOrderStatus>(editing?.status ?? 'proposed');
  const [requestedBy, setRequestedBy] = useState(editing?.requestedBy || '');

  // Budget items linked to change order
  const [budgetItemsList, setBudgetItemsList] = useState<ChangeOrderBudgetItem[]>(editing?.budgetItems || []);
  const [biCategory, setBiCategory] = useState<ExpenseCategory>('salary');
  const [biDescription, setBiDescription] = useState('');
  const [biAmount, setBiAmount] = useState('');
  const [biCostType, setBiCostType] = useState<CostType>('fixed');
  const [biStartMonth, setBiStartMonth] = useState('');
  const [biEndMonth, setBiEndMonth] = useState('');

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
    const data: Omit<ChangeOrder, 'id' | 'projectId' | 'createdAt'> = {
      description: description.trim(), changeType,
      amountImpact: parseFloat(amountImpact) || 0,
      durationImpact: parseInt(durationImpact) || 0,
      status, requestedBy: requestedBy || undefined,
      approvedBy: status === 'approved' ? 'admin' : undefined,
      approvedDate: status === 'approved' ? todayLocal() : undefined,
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
      onOpenChange(false);
    } catch (err) {
      console.error('[change-order]', err);
      toast.error('حدث خطأ أثناء حفظ أمر التغيير. يرجى المحاولة مرة أخرى.');
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل أمر التغيير' : 'أمر تغيير جديد'}
      desktopWidthClassName="max-w-lg"
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />أمر تغيير</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة أمر التغيير'} />}
    >
      <div className="space-y-4">
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
              <Input type="number" inputMode="decimal" value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-2">
              <Label>أثر المدة (أشهر)</Label>
              <Input type="number" inputMode="numeric" value={durationImpact} onChange={(e) => setDurationImpact(e.target.value)} />
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
              <p className="text-xs text-muted-foreground">تُضاف للموازنة تلقائياً عند الاعتماد</p>
            </div>

            {budgetItemsList.length > 0 && (
              <div className="space-y-1.5">
                {budgetItemsList.map((bi, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded border border-border bg-muted/30 text-xs">
                    <span className="truncate flex-1">
                      {EXPENSE_CATEGORY_LABELS[bi.category]} — {bi.description} — {formatCurrency(bi.plannedAmount)} ({COST_TYPE_LABELS[bi.costType]})
                    </span>
                    <Button variant="ghost" size="icon" title="إزالة البند" className="h-6 w-6 shrink-0" onClick={() => setBudgetItemsList(prev => prev.filter((_, i) => i !== idx))}>
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

      </div>
    </ResponsiveFormDialog>
  );
}
