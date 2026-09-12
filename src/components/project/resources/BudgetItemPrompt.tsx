/**
 * Offered once after a resource with a monthly cost is added to a project
 * with a duration: a recurring salary item over the whole project, linked
 * to the resource, so its plan is a budget item rather than an estimate.
 */
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { AddedResource } from './ResourceFormDialog';

interface Props {
  prompt: AddedResource | null;
  projectId: string;
  durationMonths: number;
  onClose: () => void;
}

export function BudgetItemPrompt({ prompt, projectId, durationMonths, onClose }: Props) {
  const addBudgetItem = useStore((s) => s.addBudgetItem);
  return (
    <Dialog open={!!prompt} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>إنشاء بند موازنة؟</DialogTitle>
        </DialogHeader>
        {prompt && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              هل تريد إنشاء بند موازنة تلقائي لهذا المورد؟
            </p>
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-sm font-medium">{prompt.name} {prompt.role && `— ${prompt.role}`}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(prompt.monthlyCost)} × {durationMonths} شهر = {formatCurrency(prompt.monthlyCost * (durationMonths || 1))}
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={async () => {
                await addBudgetItem({
                  projectId,
                  category: 'salary',
                  description: `${prompt.name}${prompt.role ? ` — ${prompt.role}` : ''}`,
                  plannedAmount: prompt.monthlyCost,
                  costType: 'recurring',
                  costClass: 'direct',
                  startMonth: 1,
                  endMonth: durationMonths || 1,
                  resourceId: prompt.resourceId,
                });
                toast.success('تم إنشاء بند الموازنة');
                onClose();
              }}>
                نعم — أنشئ البند
              </Button>
              <Button variant="outline" className="flex-1" onClick={onClose}>
                لا — يدوياً لاحقاً
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
