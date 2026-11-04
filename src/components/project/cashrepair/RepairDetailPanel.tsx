import { formatCurrency } from '@/lib/finance';
import type { CashTransferRepair, CustodySnapshot } from '@/services/cashRepairService';
import { InspectorPanel, InspectorSection, InspectorField } from '@/components/ui/inspector-panel';

function SnapshotTable({ title, snap }: { title: string; snap?: CustodySnapshot | null }) {
  if (!snap) return null;
  return (
    <div className="p-2 rounded border border-border bg-muted/20">
      <p className="text-xs font-semibold mb-1">{title}</p>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">المبلغ الأساسي</span><span className="font-mono">{formatCurrency(Number(snap.base_amount))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">تحويلات واردة</span><span className="font-mono">{formatCurrency(Number(snap.transfers_in))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">المتاح</span><span className="font-mono">{formatCurrency(Number(snap.available))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">المصروف</span><span className="font-mono">{formatCurrency(Number(snap.spent))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">سلف قائمة</span><span className="font-mono">{formatCurrency(Number(snap.outstanding_advances))}</span></div>
        <div className="flex justify-between font-semibold"><span>المتبقي</span><span className="font-mono">{formatCurrency(Number(snap.remaining))}</span></div>
      </div>
    </div>
  );
}

interface RepairDetailPanelProps {
  detail: CashTransferRepair | null;
  onClose: () => void;
}

/** تفاصيل إصلاح مسجّل: ملخصه وأرقام العهدة قبل وبعد. */
export function RepairDetailPanel({ detail, onClose }: RepairDetailPanelProps) {
  return (
    <InspectorPanel
      open={!!detail}
      onOpenChange={(v) => !v && onClose()}
      title="تفاصيل عملية الإصلاح"
      description={detail ? new Date(detail.createdAt).toISOString().replace('T', ' ').slice(0, 16) : undefined}
      width="lg"
    >
      {detail && (
        <>
          <InspectorSection title="الملخص">
            <InspectorField label="العهدة" value={detail.custodyName ?? detail.custodyId ?? '—'} />
            <InspectorField label="المبلغ المحذوف" value={formatCurrency(detail.amount)} mono />
            <InspectorField label="تاريخ التحويل" value={detail.transferDate ?? '—'} mono />
            <InspectorField label="الدفعة المفقودة" value={detail.missingFundId ?? '—'} />
            <InspectorField label="المنفِّذ" value={detail.performedByEmail ?? detail.performedBy} />
            <InspectorField label="السبب" value={detail.reason} />
          </InspectorSection>
          <InspectorSection title="الأرقام قبل / بعد">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SnapshotTable title="قبل" snap={detail.before?.custody} />
              <SnapshotTable title="بعد" snap={detail.after?.custody} />
            </div>
          </InspectorSection>
        </>
      )}
    </InspectorPanel>
  );
}
