/** Opening a locked budget: the warning, the reason, and the snapshot taken on open. */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Unlock } from 'lucide-react';
import { toast } from 'sonner';

export function OpenAmendmentDialog({ projectId }: { projectId: string }) {
  const openBudgetAmendment = useStore((s) => s.openBudgetAmendment);
  const [openDialog, setOpenDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = async () => {
    if (!reason.trim()) {
      toast.error('يرجى كتابة سبب التعديل');
      return;
    }
    setSubmitting(true);
    try {
      await openBudgetAmendment(projectId, reason);
      toast.success('🔓 تم فتح الموازنة للتعديل — أُخذت لقطة قبل التعديل');
      setReason('');
      setOpenDialog(false);
    } catch (err) {
      console.error('[open-amendment]', err);
      toast.error('فشل فتح الموازنة، حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Unlock className="w-3.5 h-3.5" /> فتح الموازنة للتعديل
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>فتح الموازنة للتعديل</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/50">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              🔒 الموازنة حالياً مقفلة بخط الأساس.
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 mt-2 space-y-1 list-disc ps-4">
              <li>سيتم أخذ لقطة (snapshot) للوضع الحالي قبل التعديل</li>
              <li>ستتمكن من إضافة/تعديل/حذف البنود مؤقتاً</li>
              <li>عند الاعتماد، تُحفظ لقطة بعد التعديل للمقارنة المستقبلية</li>
            </ul>
          </div>
          <div className="space-y-2">
            <Label>سبب التعديل <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تصحيح خطأ في تقدير تكلفة الموارد البشرية، أو إعادة توزيع الموازنة بناءً على تغير المتطلبات..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpenDialog(false)}>إلغاء</Button>
          <Button onClick={handleOpen} disabled={submitting || !reason.trim()}>
            {submitting ? 'جاري الفتح...' : 'فتح الموازنة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
