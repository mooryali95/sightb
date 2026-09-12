/**
 * Record an amount a vendor paid on the project's behalf. It lands as an
 * approved vendor payable, owed until settled.
 *
 * The panel remounts this component (via `key`) on every open, so the form
 * starts blank through the `useState` initialisers and needs no reset. The
 * trigger is rendered here (the dialog wants it as a child) but opening is
 * the panel's call through `onRequestOpen`, so the remount happens first.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { errorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  projectId: string;
}

export function RecordVendorPayableDialog({ open, onOpenChange, onRequestOpen, projectId }: Props) {
  const createReimbursement = useStore((s) => s.createReimbursement);
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!vendor.trim() || !description.trim() || !amount || Number(amount) <= 0) {
      toast({ title: 'بيانات ناقصة', description: 'أدخل اسم المورد والوصف والمبلغ.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createReimbursement({
        projectId,
        sourceKind: 'vendor',
        vendorName: vendor.trim(),
        category,
        description,
        amount: Number(amount),
        expenseDate,
        notes,
        autoApprove: true,
      });
      toast({ title: 'تم تسجيل الذمة', description: 'أُضيفت كذمة مدينة على المشروع تنتظر السداد.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'فشل الحفظ', description: errorMessage(e, 'خطأ غير معروف'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" onClick={onRequestOpen}><Plus className="h-4 w-4 ml-1" /> تسجيل ذمة مورد</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تسجيل مبلغ دفعه المورد نيابةً عن المشروع</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>اسم المورد *</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="مثال: مؤسسة النور" />
          </div>
          <div>
            <Label>الفئة *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الوصف *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ *</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>التاريخ *</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
