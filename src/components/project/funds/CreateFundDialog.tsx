/**
 * The new-fund dialog, with its own trigger button.
 *
 * Whether the button is enabled is the section's call: the unsettled-fund
 * rule (lib/fund-alerts canCreateNewFund) is evaluated there and arrives as
 * `disabled`, so this dialog knows nothing about why it may be closed.
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
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';

interface Props {
  projectId: string;
  disabled: boolean;
}

export function CreateFundDialog({ projectId, disabled }: Props) {
  const { createFund } = useStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(todayLocal());
  const [newNotes, setNewNotes] = useState('');

  const handleCreate = async () => {
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    try {
      await createFund(projectId, amt, newDate, newNotes.trim() || undefined);
      toast.success('تم إنشاء الدفعة');
      setCreateOpen(false);
      setNewAmount(''); setNewNotes('');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر إنشاء الدفعة'));
    }
  };

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={disabled}>
          <Plus className="w-3.5 h-3.5" /> دفعة جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إنشاء دفعة جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>المبلغ المحوّل</Label>
            <Input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>تاريخ التحويل</Label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
          <Button onClick={handleCreate}>اعتماد التحويل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
