/**
 * Offered when a milestone completes while linked to a revenue that is
 * still planned: move that revenue to invoiced now, or later.
 */
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { REVENUE_STATUS_LABELS, type Revenue } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { runOrToast } from '@/lib/run-or-toast';

interface Props {
  revenue: Revenue | null;
  onClose: () => void;
}

export function InvoicePrompt({ revenue, onClose }: Props) {
  const updateRevenue = useStore((s) => s.updateRevenue);
  return (
    <Dialog open={!!revenue} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>إصدار فاتورة؟</DialogTitle>
        </DialogHeader>
        {revenue && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              المرحلة اكتملت — هل تريد تحويل الدفعة المرتبطة إلى "مُفوتر"؟
            </p>
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-sm font-medium">{revenue.description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                المبلغ: {formatCurrency(revenue.amount)} · الحالة: {REVENUE_STATUS_LABELS[revenue.status]}
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={async () => {
                if (!(await runOrToast(() => updateRevenue(revenue.id, { status: 'invoiced' }), 'تعذّر تحويل الدفعة إلى مُفوتر'))) return;
                toast.success('تم تحويل الدفعة إلى مُفوتر');
                onClose();
              }}>
                نعم — أصدر الفاتورة
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                لاحقاً
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
