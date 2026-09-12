/**
 * The budget item form, for adding and for editing.
 *
 * A recurring item is entered as a monthly figure with a month range; the
 * form previews the total so what the tables will count is visible before
 * saving. The section remounts this component (via `key`) on every open, so
 * an edit starts from the row through the `useState` initialisers and an
 * add starts blank. The trigger renders here (the responsive dialog wants
 * it as a prop) but opening is the section's call through `onRequestOpen`.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, COST_TYPE_LABELS, type ExpenseCategory, type Resource,
  type CostType, type CostClass, type BudgetItem,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  /** The item being edited; absent for a new one. */
  editing?: BudgetItem;
  projectId: string;
  durationMonths: number;
  resources: Resource[];
}

export function BudgetItemFormDialog({
  open, onOpenChange, onRequestOpen, editing, projectId, durationMonths, resources,
}: Props) {
  const { addBudgetItem, updateBudgetItem } = useStore();
  const editingId = editing?.id ?? null;
  const [category, setCategory] = useState<ExpenseCategory>(editing?.category ?? 'salary');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [plannedAmount, setPlannedAmount] = useState(editing ? String(editing.plannedAmount) : '');
  const [startMonth, setStartMonth] = useState<string>(editing?.startMonth ? String(editing.startMonth) : '');
  const [endMonth, setEndMonth] = useState<string>(editing?.endMonth ? String(editing.endMonth) : '');
  const [costType, setCostType] = useState<CostType>(editing?.costType || 'fixed');
  const [resourceId, setResourceId] = useState<string>(editing?.resourceId || '');

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
    onOpenChange(false);
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل بند الموازنة' : 'إضافة بند موازنة'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />بند جديد</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
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
  );
}
