/**
 * The indirect-cost form. The card remounts it (via `key`) on every open,
 * so it starts blank through the `useState` initialisers and needs no
 * reset. The trigger is rendered here (the dialog wants it as a child) but
 * opening is the card's call through `onRequestOpen`, so the remount
 * happens first.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { INDIRECT_COST_CATEGORY_LABELS, type IndirectCostCategory } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  companyId: string;
}

export function IndirectCostFormDialog({ open, onOpenChange, onRequestOpen, companyId }: Props) {
  const addIndirectCost = useStore((s) => s.addIndirectCost);
  const [icCategory, setIcCategory] = useState<IndirectCostCategory>('other');
  const [icDescription, setIcDescription] = useState('');
  const [icAmount, setIcAmount] = useState('');
  const [icMonth, setIcMonth] = useState('1');
  const [icDate, setIcDate] = useState(new Date().toISOString().split('T')[0]);

  const handleAddIndirectCost = async () => {
    if (!icDescription.trim()) { toast.error('الوصف مطلوب'); return; }
    try {
      await addIndirectCost({
        companyId,
        category: icCategory,
        description: icDescription,
        amount: parseFloat(icAmount) || 0,
        month: parseInt(icMonth) || 1,
        date: icDate,
        allocationMethod: 'equal',
      });
      toast.success('تم إضافة التكلفة');
      onOpenChange(false);
    } catch { toast.error('حدث خطأ'); }
  };

  return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />إضافة</Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة تكلفة غير مباشرة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الفئة</Label>
              <Select value={icCategory} onValueChange={v => setIcCategory(v as IndirectCostCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INDIRECT_COST_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الوصف *</Label>
              <Input value={icDescription} onChange={e => setIcDescription(e.target.value)} placeholder="وصف التكلفة" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المبلغ</Label>
                <Input type="number" value={icAmount} onChange={e => setIcAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الشهر</Label>
                <Input type="number" value={icMonth} onChange={e => setIcMonth(e.target.value)} min="1" max="12" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={icDate} onChange={e => setIcDate(e.target.value)} />
            </div>
            <Button onClick={handleAddIndirectCost} className="w-full">إضافة</Button>
          </div>
        </DialogContent>
        </Dialog>
  );
}
