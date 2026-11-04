/**
 * The side panel for one resource: its figures, the budget items it is
 * linked to, and every expense charged to it (the counted spend above
 * excludes rejected ones and outstanding advances; the list does not).
 */
import { formatCurrency } from '@/lib/finance';
import type { Expense, Resource } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { Progress } from '@/components/ui/progress';
import type { ResourceFigures } from './resourceFigures';

interface Props {
  resource: Resource;
  figures: ResourceFigures;
  /** Every expense linked to the resource, whatever its status. */
  linkedExpenses: Expense[];
  durationMonths: number;
  readOnly: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function ResourceInspector({ resource: r, figures, linkedExpenses, durationMonths, readOnly, onClose, onEdit }: Props) {
  const { plannedForResource, totalSpent, variance, spentPct, isEstimated, linkedBudget } = figures;
  return (
    <InspectorPanel
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={r.name}
      description={r.role || 'بدون مسمى وظيفي'}
      width="md"
      footer={!readOnly ? (
        <Button size="sm" onClick={onEdit} className="gap-1.5">
          <Pencil className="w-3.5 h-3.5" /> تعديل
        </Button>
      ) : undefined}
    >
      <InspectorKpiStrip items={[
        { label: 'شهرية', value: formatCurrency(r.monthlyCost) },
        { label: 'مخطط', value: plannedForResource > 0 ? formatCurrency(plannedForResource) : '—' },
        { label: 'مصروف', value: formatCurrency(totalSpent), tone: 'info' },
        { label: 'انحراف', value: plannedForResource > 0 ? formatCurrency(variance) : '—', tone: variance >= 0 ? 'success' : 'destructive' },
      ]} />

      {plannedForResource > 0 && (
        <InspectorSection title="نسبة الصرف">
          <Progress value={Math.min(spentPct, 100)} aria-label="نسبة صرف المورد" className="h-2" />
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">{spentPct.toFixed(1)}% من المخطط</p>
        </InspectorSection>
      )}

      <InspectorSection title="البيانات">
        <InspectorField label="المدة المعتمدة" value={`${durationMonths || 0} شهر`} mono />
        <InspectorField label="بنود الموازنة المرتبطة" value={linkedBudget.length} mono />
        {isEstimated && (
          <p className="text-xs text-warning mt-1">* المخطط محسوب تقديرياً — لم يُربط ببند موازنة بعد.</p>
        )}
      </InspectorSection>

      <InspectorSection title={`المصروفات (${linkedExpenses.length})`}>
        {linkedExpenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد مصروفات مرتبطة بهذا المورد.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border max-h-[280px] overflow-y-auto">
            {linkedExpenses.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{e.description || '—'}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">{e.date}</p>
                </div>
                <span className="tabular-nums font-medium">{formatCurrency(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </InspectorSection>
    </InspectorPanel>
  );
}
