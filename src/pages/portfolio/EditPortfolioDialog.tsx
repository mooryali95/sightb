/**
 * The portfolio edit form. The page remounts it (via `key`) on every open,
 * so the fields start from the portfolio through the `useState`
 * initialisers and there is no reset handler. An emptied description or
 * fiscal year is sent as `null` so the store clears it; `undefined` would
 * leave the old value.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Portfolio } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Props {
  portfolio: Portfolio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPortfolioDialog({ portfolio, open, onOpenChange }: Props) {
  const updatePortfolio = useStore((s) => s.updatePortfolio);
  const [editName, setEditName] = useState(portfolio.name);
  const [editDescription, setEditDescription] = useState(portfolio.description || '');
  const [editTargetRevenue, setEditTargetRevenue] = useState(String(portfolio.targetRevenue || 0));
  const [editTargetMargin, setEditTargetMargin] = useState(String(portfolio.targetMargin || 0));
  const [editFiscalYear, setEditFiscalYear] = useState(portfolio.fiscalYear || '');

  const handleSaveEdit = async () => {
    if (!editName.trim()) { toast.error('اسم المحفظة مطلوب'); return; }
    try {
      await updatePortfolio(portfolio.id, {
        name: editName,
        description: editDescription || null,
        targetRevenue: parseFloat(editTargetRevenue) || 0,
        targetMargin: parseFloat(editTargetMargin) || 0,
        fiscalYear: editFiscalYear || null,
      });
      toast.success('تم تحديث بيانات المحفظة');
      onOpenChange(false);
    } catch { toast.error('فشل التحديث'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>تعديل بيانات المحفظة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>اسم المحفظة *</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>الوصف</Label>
            <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>هدف الإيراد</Label>
              <Input type="number" value={editTargetRevenue} onChange={e => setEditTargetRevenue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>هامش الربح المستهدف %</Label>
              <Input type="number" value={editTargetMargin} onChange={e => setEditTargetMargin(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>السنة المالية</Label>
            <Input value={editFiscalYear} onChange={e => setEditFiscalYear(e.target.value)} placeholder="مثال: 2026" />
          </div>
          <Button onClick={handleSaveEdit} className="w-full">حفظ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
