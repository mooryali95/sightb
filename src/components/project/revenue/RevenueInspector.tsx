/**
 * The read-only revenue inspector: amount, VAT and inclusive figures, the
 * invoice and collection dates, and the milestone the row is linked to.
 */
import { formatCurrency, calcVAT, addVAT } from '@/lib/finance';
import {
  REVENUE_TYPE_LABELS, REVENUE_STATUS_LABELS, REVENUE_STATUS_COLORS,
  MILESTONE_STATUS_LABELS, MILESTONE_STATUS_COLORS,
  type RevenueType, type RevenueStatus, type Revenue, type Milestone, type MilestoneStatus,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';

interface Props {
  /** The row being inspected; the panel is closed when absent. */
  revenue: Revenue | undefined;
  milestones?: Milestone[];
  taxPercent: number;
  readOnly: boolean;
  onEdit: (revenue: Revenue) => void;
  onClose: () => void;
}

export function RevenueInspector({ revenue, milestones, taxPercent, readOnly, onEdit, onClose }: Props) {
  const inspected = revenue;
  const inspectedMilestone = inspected?.milestoneId && milestones
    ? milestones.find((m) => m.id === inspected.milestoneId)
    : null;
  const showVAT = taxPercent > 0;
  return (
    <InspectorPanel
      open={!!inspected}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={inspected?.description || 'تفاصيل الإيراد'}
      description={inspected ? `${REVENUE_TYPE_LABELS[inspected.revenueType as RevenueType] || inspected.revenueType} · شهر ${inspected.month}` : undefined}
      meta={inspected ? (
        <Badge className={`text-xs ${REVENUE_STATUS_COLORS[inspected.status as RevenueStatus] || ''}`}>
          {REVENUE_STATUS_LABELS[inspected.status as RevenueStatus] || inspected.status}
        </Badge>
      ) : null}
      width="md"
      footer={!readOnly && inspected ? (
        <>
          <Button variant="outline" size="sm" onClick={onClose}>إغلاق</Button>
          <Button size="sm" onClick={() => onEdit(inspected)}>
            <Pencil className="w-3.5 h-3.5 ml-1.5" />تعديل
          </Button>
        </>
      ) : null}
    >
      {inspected && (
        <>
          <InspectorKpiStrip items={[
            { label: 'المبلغ', value: formatCurrency(inspected.amount) },
            ...(showVAT ? [
              { label: `ضريبة ${taxPercent}%`, value: formatCurrency(calcVAT(inspected.amount, taxPercent)), tone: 'info' as const },
              { label: 'شامل الضريبة', value: formatCurrency(addVAT(inspected.amount, taxPercent)) },
            ] : []),
            { label: 'الشهر', value: `شهر ${inspected.month}` },
          ]} />

          <InspectorSection title="بيانات الفاتورة">
            <InspectorField label="رقم الفاتورة" value={inspected.invoiceNumber || '—'} mono />
            <InspectorField label="تاريخ الفاتورة" value={inspected.invoiceDate || '—'} mono />
            <InspectorField label="تاريخ التحصيل" value={inspected.collectionDate || '—'} mono />
            <InspectorField label="تاريخ التسجيل" value={inspected.date || '—'} mono />
          </InspectorSection>

          {inspectedMilestone && (
            <InspectorSection title="التسليمة المرتبطة">
              <InspectorField
                label={inspectedMilestone.name}
                value={
                  <Badge className={`text-xs ${MILESTONE_STATUS_COLORS[inspectedMilestone.status as MilestoneStatus] || ''}`}>
                    {MILESTONE_STATUS_LABELS[inspectedMilestone.status as MilestoneStatus]}
                  </Badge>
                }
              />
              <InspectorField label="الوزن" value={`${(inspectedMilestone.weight * 100).toFixed(0)}%`} mono />
            </InspectorSection>
          )}

          <InspectorSection title="بيانات وصفية">
            <InspectorField label="النوع" value={REVENUE_TYPE_LABELS[inspected.revenueType as RevenueType] || inspected.revenueType} />
            <InspectorField label="الحالة" value={REVENUE_STATUS_LABELS[inspected.status as RevenueStatus] || inspected.status} />
          </InspectorSection>
        </>
      )}
    </InspectorPanel>
  );
}
