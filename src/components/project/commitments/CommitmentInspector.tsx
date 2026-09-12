/**
 * The side panel for one commitment: its amounts, the spend ratio, the
 * contract data and the notes.
 */
import { formatCurrency } from '@/lib/finance';
import { COMMITMENT_STATUS_LABELS, COMMITMENT_STATUS_COLORS, type Commitment } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { Progress } from '@/components/ui/progress';

interface Props {
  commitment: Commitment;
  readOnly: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function CommitmentInspector({ commitment: inspected, readOnly, onClose, onEdit }: Props) {
  const remaining = inspected.totalAmount - inspected.spentAmount;
  const spentRatio = inspected.totalAmount > 0 ? (inspected.spentAmount / inspected.totalAmount) * 100 : 0;
  return (
    <InspectorPanel
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={inspected.description}
      description={inspected.vendorName ? `المورّد: ${inspected.vendorName}` : undefined}
      meta={
        <span className={`text-xs px-2 py-1 rounded-full ${COMMITMENT_STATUS_COLORS[inspected.status]}`}>
          {COMMITMENT_STATUS_LABELS[inspected.status]}
        </span>
      }
      footer={!readOnly ? (
        <Button size="sm" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 ml-1.5" /> تعديل
        </Button>
      ) : undefined}
    >
      <InspectorKpiStrip
        items={[
          { label: 'إجمالي', value: formatCurrency(inspected.totalAmount) },
          { label: 'مصروف', value: formatCurrency(inspected.spentAmount) },
          { label: 'متبقي', value: formatCurrency(remaining), tone: remaining >= 0 ? 'success' : 'destructive' },
          { label: 'نسبة الصرف', value: `${spentRatio.toFixed(1)}%`, tone: spentRatio >= 90 ? 'warning' : 'default' },
        ]}
      />
      <InspectorSection title="الصرف">
        <Progress value={Math.min(spentRatio, 100)} className="h-2" />
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
          {formatCurrency(inspected.spentAmount)} من {formatCurrency(inspected.totalAmount)}
        </p>
      </InspectorSection>
      <InspectorSection title="بيانات العقد">
        <InspectorField label="المورّد" value={inspected.vendorName || '—'} />
        <InspectorField label="مرجع العقد" value={inspected.contractRef || '—'} mono />
      </InspectorSection>
      {inspected.notes && (
        <InspectorSection title="ملاحظات">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{inspected.notes}</p>
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
