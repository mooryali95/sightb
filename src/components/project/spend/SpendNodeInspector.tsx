/**
 * The side panel for one group: its approved, pending and rejected split,
 * the next level's breakdown, and every expense in it.
 */
import { formatCurrency } from '@/lib/finance';
import { SPEND_DIMENSION_LABELS, type SpendNode } from '@/lib/expense-analytics';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS, type ExpenseCategory, type ApprovalStatus,
} from '@/types/project';
import { Badge } from '@/components/ui/badge';
import { InspectorPanel, InspectorSection, InspectorKpiStrip } from '@/components/ui/inspector-panel';

interface Props {
  node: SpendNode;
  onClose: () => void;
}

export function SpendNodeInspector({ node: active, onClose }: Props) {
  return (
    <InspectorPanel
      open
      onOpenChange={(v) => !v && onClose()}
      title={active.label}
      description={`${SPEND_DIMENSION_LABELS[active.dimension]} · ${active.count} مصروف`}
      width="lg"
    >
      <InspectorKpiStrip
        items={[
          { label: 'الإجمالي', value: formatCurrency(active.total), tone: 'default' },
          { label: 'معتمد', value: formatCurrency(active.approved), tone: 'success' },
          { label: 'قيد الاعتماد', value: formatCurrency(active.pending), tone: 'info' },
          { label: 'مرفوض', value: formatCurrency(active.rejected), tone: 'default' },
        ]}
      />

      {active.children.length > 0 && (
        <InspectorSection title={`تفصيل حسب ${SPEND_DIMENSION_LABELS[active.children[0].dimension]}`}>
          <div className="space-y-2">
            {active.children.map((c) => (
              <div key={c.path.join('>')} className="flex items-center justify-between gap-2">
                <span className="text-xs">{c.label} <span className="text-muted-foreground">({c.count})</span></span>
                <span className="text-xs font-mono">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}

      <InspectorSection title="بنود الصرف">
        <div className="space-y-2">
          {active.expenses.map((e) => {
            const st = (e.approvalStatus || 'approved') as ApprovalStatus;
            return (
              <div key={e.id} className="p-2 rounded border border-border bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{e.description}</span>
                  <span className="text-xs font-mono shrink-0">{formatCurrency(e.amount)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted-foreground font-mono">{e.date}</span>
                  <Badge variant="outline" className="text-xs">
                    {EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory]}
                  </Badge>
                  <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[st] || ''}`}>
                    {APPROVAL_STATUS_LABELS[st] || st}
                  </Badge>
                  {e.vendor && <span className="text-xs text-muted-foreground">{e.vendor}</span>}
                  {e.invoiceRef && <span className="text-xs text-muted-foreground">#{e.invoiceRef}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </InspectorSection>
    </InspectorPanel>
  );
}
