/** The contract against what was collected, invoiced, and not yet invoiced. */
import { Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { Progress } from '@/components/ui/progress';
import type { ProjectSummary } from '@/types/project';
import { SectionCard, SectionTitle } from './SectionCard';

export function CollectionCard({ summary }: { summary: ProjectSummary }) {
  const collectedPct = summary.effectiveContractValue > 0 ? (summary.collectedRevenue / summary.effectiveContractValue) * 100 : 0;
  return (
    <SectionCard>
      <SectionTitle icon={Receipt}>التحصيل</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">العقد</p>
          <p className="text-sm font-mono font-bold">{formatCurrency(summary.effectiveContractValue)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">محصّل</p>
          <p className="text-sm font-mono font-bold text-success">{formatCurrency(summary.collectedRevenue)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">مفوتر</p>
          <p className="text-sm font-mono font-bold text-warning">{formatCurrency(summary.accountsReceivable)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">لم يُفوتر</p>
          <p className="text-sm font-mono font-bold">{formatCurrency(Math.max(0, summary.effectiveContractValue - summary.collectedRevenue - summary.accountsReceivable))}</p>
        </div>
      </div>
      <div className="space-y-1">
        <Progress value={collectedPct} aria-label="نسبة التحصيل" className="h-2" />
        {summary.accountsReceivable > 0 && <Progress value={(summary.collectedRevenue + summary.accountsReceivable) / summary.effectiveContractValue * 100} aria-label="المحصّل مع المستحق" className="h-1 opacity-40" />}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" /> محصّل {collectedPct.toFixed(0)}%</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning inline-block" /> مفوتر</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-muted-foreground/50 inline-block" /> لم يُفوتر</span>
      </div>
    </SectionCard>
  );
}
