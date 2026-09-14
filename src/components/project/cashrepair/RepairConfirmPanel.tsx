import { formatCurrency } from '@/lib/finance';
import type { OrphanTransfer } from '@/lib/cash-integrity';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { InspectorPanel, InspectorSection, InspectorField } from '@/components/ui/inspector-panel';

interface RepairConfirmPanelProps {
  target: OrphanTransfer | null;
  custodyName: (id: string) => string;
  reason: string;
  onReasonChange: (reason: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** تأكيد إصلاح تحويل يتيم: بياناته وسبب الحذف. */
export function RepairConfirmPanel({ target, custodyName, reason, onReasonChange, saving, onConfirm, onClose }: RepairConfirmPanelProps) {
  return (
    <InspectorPanel
      open={!!target}
      onOpenChange={(v) => !v && onClose()}
      title="إصلاح تحويل بلا دفعة أصل"
      description="سيُحذف سجل التحويل ويُسجَّل في سجل التدقيق مع صورة الأرقام قبل وبعد."
      width="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button size="sm" onClick={onConfirm} disabled={saving}>{saving ? 'جارٍ التنفيذ…' : 'تنفيذ الإصلاح'}</Button>
        </div>
      }
    >
      {target && (
        <>
          <InspectorSection title="التحويل">
            <InspectorField label="العهدة" value={custodyName(target.custodyId)} />
            <InspectorField label="المبلغ" value={formatCurrency(target.amount)} mono />
            <InspectorField label="التاريخ" value={target.transferDate} mono />
            <InspectorField label="الدفعة المفقودة" value={target.missingFundId} />
          </InspectorSection>
          <InspectorSection title="سبب الحذف">
            <Label className="sr-only">سبب الحذف</Label>
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="مثال: سجل يتيم ناتج عن حذف دفعة سابقة — لا يقابله نقد فعلي."
              rows={3}
            />
          </InspectorSection>
        </>
      )}
    </InspectorPanel>
  );
}
