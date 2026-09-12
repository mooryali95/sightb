/**
 * The commitment form, for adding and for editing, with the overrun check
 * before a new commitment is taken on and the auto-completion of a fully
 * spent one.
 *
 * The section remounts this component (via `key`) on every open, so an
 * edit starts from the row through the `useState` initialisers and an add
 * starts blank; there is no reset handler. The trigger button is rendered
 * here (the responsive dialog wants it as a prop) but opening is the
 * section's call through `onRequestOpen`, so the remount happens first.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { COMMITMENT_STATUS_LABELS, type Commitment, type CommitmentStatus } from '@/types/project';
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
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new commitment. */
  editing?: Commitment;
  projectId: string;
  /** The project's commitments, for the overrun check on a new one. */
  commitments: Commitment[];
  totalPlanned: number;
}

export function CommitmentFormDialog({ open, onOpenChange, onRequestOpen, editing, projectId, commitments, totalPlanned }: Props) {
  const { addCommitment, updateCommitment } = useStore();
  const editingId = editing?.id ?? null;
  const [description, setDescription] = useState(editing?.description ?? '');
  const [vendorName, setVendorName] = useState(editing?.vendorName ?? '');
  const [contractRef, setContractRef] = useState(editing?.contractRef ?? '');
  const [totalAmount, setTotalAmount] = useState(editing ? String(editing.totalAmount) : '');
  const [spentAmount, setSpentAmount] = useState(editing ? String(editing.spentAmount) : '0');
  const [status, setStatus] = useState<CommitmentStatus>(editing?.status ?? 'active');
  const [notes, setNotes] = useState(editing?.notes ?? '');

  const handleSubmit = async () => {
    if (!description.trim() || !totalAmount) return;
    const spent = parseFloat(spentAmount) || 0;
    const total = parseFloat(totalAmount) || 0;

    // Budget overrun validation (only for new commitments)
    if (!editingId) {
      const currentTotalCommitted = commitments
        .filter(c => c.status === 'active')
        .reduce((s, c) => s + c.totalAmount, 0);
      const newTotal = currentTotalCommitted + total;
      if (newTotal > totalPlanned && totalPlanned > 0) {
        const over = newTotal - totalPlanned;
        const confirmed = window.confirm(
          `هذا الالتزام يتجاوز الميزانية بمقدار ${formatCurrency(over)}. هل تريد المتابعة؟`
        );
        if (!confirmed) return;
      }
    }

    // Auto-complete if fully spent
    let autoStatus = status;
    if (spent >= total && total > 0 && status === 'active') {
      autoStatus = 'completed';
      toast.success('✓ الالتزام اكتمل تلقائياً — المبلغ صُرف بالكامل');
    }

    const form = {
      description: description.trim(), totalAmount: total, spentAmount: spent, status: autoStatus,
      vendorName: vendorName.trim(), contractRef: contractRef.trim(), notes: notes.trim(),
    };
    if (editingId) {
      // A cleared field goes as null so the store writes it; undefined would mean "unchanged".
      await updateCommitment(editingId, {
        ...form, vendorName: form.vendorName || null, contractRef: form.contractRef || null, notes: form.notes || null,
      });
      toast.success('تم تعديل الالتزام');
    } else {
      await addCommitment({
        projectId, ...form,
        vendorName: form.vendorName || undefined, contractRef: form.contractRef || undefined, notes: form.notes || undefined,
      });
      toast.success('تمت إضافة الالتزام');
    }
    onOpenChange(false);
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل الالتزام' : 'إضافة التزام'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />التزام جديد</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
    >
      <div className="space-y-4">
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: عقد توريد معدات" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>المورّد</Label>
              <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="space-y-2">
              <Label>مرجع العقد</Label>
              <Input value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="اختياري" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>إجمالي المبلغ</Label>
              <Input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>المصروف حتى الآن</Label>
              <Input type="number" inputMode="decimal" value={spentAmount} onChange={(e) => setSpentAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CommitmentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
      </div>
    </ResponsiveFormDialog>
  );
}
