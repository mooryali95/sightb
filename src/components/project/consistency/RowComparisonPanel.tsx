/** The lines of one group before and after the repair, and the link to the alert centre. */
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/finance';
import type { RowComparison } from '@/lib/spend-consistency';
import { Badge } from '@/components/ui/badge';
import { InspectorPanel, InspectorSection, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { BellRing } from 'lucide-react';

export function RowComparisonPanel({ comparison, onClose }: { comparison: RowComparison; onClose: () => void }) {
  return (
    <InspectorPanel
      open
      onOpenChange={(v) => !v && onClose()}
      title={`مقارنة تفصيلية — ${comparison.label}`}
      description={`${comparison.changedCount} عنصر تغيّر من أصل ${comparison.lines.length}`}
      width="lg"
    >
      <InspectorKpiStrip
        items={[
          { label: 'قبل الإصلاح', value: formatCurrency(comparison.before), tone: 'default' },
          { label: 'بعد الإصلاح', value: formatCurrency(comparison.after), tone: 'success' },
          { label: 'الفرق', value: formatCurrency(comparison.gap), tone: Math.abs(comparison.gap) > 0.01 ? 'destructive' : 'default' },
        ]}
      />
      <InspectorSection title="عناصر الصرف — قبل / بعد / الفرق">
        <div className="space-y-2">
          {comparison.lines.map((l) => {
            const changed = Math.abs(l.diff) > 0.01;
            return (
              <div
                key={`${l.kind}-${l.id}`}
                className={`p-2 rounded border ${changed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/20'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{l.description}</span>
                  {changed && <Badge variant="destructive" className="text-[10px] shrink-0">تغيّر</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] font-mono">
                  {l.date && <span className="text-muted-foreground">{l.date}</span>}
                  <span className="text-muted-foreground">{l.categoryLabel}</span>
                  <span className="text-muted-foreground">قبل: {formatCurrency(l.before)}</span>
                  <span>بعد: {formatCurrency(l.after)}</span>
                  <span className={changed ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    فرق: {formatCurrency(l.diff)}
                  </span>
                </div>
              </div>
            );
          })}
          {comparison.lines.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد عناصر صرف في هذه المجموعة.</p>
          )}
        </div>
      </InspectorSection>
      <InspectorSection title="مركز التنبيهات">
        <Link to="/alerts" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
          <BellRing className="w-3.5 h-3.5" />عرض سجل تنبيهات الاتساق لكل المشاريع
        </Link>
      </InspectorSection>
    </InspectorPanel>
  );
}
