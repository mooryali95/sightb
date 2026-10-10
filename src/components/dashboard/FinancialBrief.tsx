import { Activity, ArrowLeft, Landmark, TriangleAlert } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

interface Props {
  collectedRevenue: number;
  totalExpenses: number;
  plannedProfitMargin: number;
  attentionCount: number;
  timePeriod: string;
}

export function FinancialBrief({ collectedRevenue, totalExpenses, plannedProfitMargin, attentionCount, timePeriod }: Props) {
  const cashGap = collectedRevenue - totalExpenses;
  const period = timePeriod === 'all' ? 'تراكميًا' : 'في الفترة المحددة';
  return (
    <section className="mb-6 border-y border-border bg-card/70 px-4 py-3" aria-label="القراءة التنفيذية">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 min-w-[190px]">
          <Activity className="w-4 h-4 text-primary" />
          <div><p className="text-xs font-semibold">القراءة التنفيذية</p><p className="text-[11px] text-muted-foreground">السيولة والربحية أولاً</p></div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Landmark className="w-3.5 h-3.5 text-muted-foreground" />
          <span>فجوة التحصيل والمصروف {period}:</span>
          <strong className={cashGap >= 0 ? 'health-good' : 'text-destructive'}>{formatCurrency(cashGap)}</strong>
        </div>
        <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
        <p className="text-xs">هامش الربح المخطط: <strong>{plannedProfitMargin.toFixed(1)}%</strong></p>
        <div className="ms-auto flex items-center gap-1.5 text-xs">
          <TriangleAlert className={`w-3.5 h-3.5 ${attentionCount > 0 ? 'text-warning' : 'text-success'}`} />
          {attentionCount > 0 ? `${attentionCount} مشروع يحتاج تدخلاً` : 'لا توجد مشاريع حرجة ضمن العرض'}
        </div>
      </div>
    </section>
  );
}