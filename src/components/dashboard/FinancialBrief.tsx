/**
 * «المركز المالي» under the headline cards: the cash position and the
 * profitability after the company's own costs, each figure with its formula.
 * The net here is the same net the company page shows: the projects'
 * planned profit minus the company's indirect costs.
 */
import { Landmark, Scale, TriangleAlert, TrendingUp, Receipt, Building2, Wallet } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/finance';
import { countAr } from '@/lib/plural';

interface Props {
  netCash: number;
  receivables: number;
  plannedProfit: number;
  indirectTotal: number;
  netPlannedProfit: number;
  netPlannedMargin: number;
  attentionCount: number;
  timePeriod: string;
}

function Figure({ icon, label, value, formula, tone }: { icon: React.ReactNode; label: string; value: string; formula: string; tone?: 'good' | 'bad' | 'muted' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="min-w-0 rounded-lg px-3 py-2 hover:bg-muted/40 focus-visible:bg-muted/40 outline-none transition-colors cursor-help" aria-label={`${label}: ${value}`}>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</p>
          <p className={`font-mono text-base font-bold mt-0.5 truncate ${tone === 'good' ? 'health-good' : tone === 'bad' ? 'text-destructive' : ''}`}>{value}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{formula}</TooltipContent>
    </Tooltip>
  );
}

export function FinancialBrief({ netCash, receivables, plannedProfit, indirectTotal, netPlannedProfit, netPlannedMargin, attentionCount, timePeriod }: Props) {
  const period = timePeriod === 'all' ? 'تراكمياً' : 'في الفترة المحددة';
  return (
    <TooltipProvider delayDuration={200}>
    <section className="mb-6 rounded-xl border border-border bg-card/70" aria-label="المركز المالي">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Scale className="w-4 h-4 text-primary" />المركز المالي</h2>
        <p className={`flex items-center gap-1.5 text-xs ${attentionCount > 0 ? 'text-warning' : 'text-success'}`}>
          <TriangleAlert className="w-3.5 h-3.5" />
          {attentionCount > 0 ? `${countAr(attentionCount, 'project')} بحاجة إلى تدخل` : 'لا توجد مشاريع حرجة ضمن العرض'}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-border">
        <div className="p-2">
          <p className="px-3 pt-1 text-xs font-semibold text-muted-foreground">النقد {period}</p>
          <div className="grid grid-cols-2">
            <Figure icon={<Wallet className="w-3.5 h-3.5" />} label="صافي النقد" value={formatCurrency(netCash)} tone={netCash >= 0 ? 'good' : 'bad'}
              formula="الإيرادات المحصّلة (بتاريخ التحصيل) − المصروفات المحتسبة، للمشاريع الظاهرة وفي الفترة المحددة." />
            <Figure icon={<Receipt className="w-3.5 h-3.5" />} label="مستحق على العملاء" value={formatCurrency(receivables)}
              formula="دفعات فُوترت ولم تُحصَّل بعد. رصيد قائم الآن، لا يتغيّر مع فلتر الفترة." />
          </div>
        </div>
        <div className="p-2">
          <p className="px-3 pt-1 text-xs font-semibold text-muted-foreground">الربحية المخططة (تراكمية)</p>
          <div className="grid grid-cols-3">
            <Figure icon={<TrendingUp className="w-3.5 h-3.5" />} label="ربح المشاريع" value={formatCurrency(plannedProfit)} tone={plannedProfit >= 0 ? undefined : 'bad'}
              formula="قيمة العقود الفعّالة − الموازنات المعتمدة للمشاريع الظاهرة." />
            <Figure icon={<Building2 className="w-3.5 h-3.5" />} label="مصاريف الشركات" value={formatCurrency(indirectTotal)} tone="muted"
              formula="ما صرفته الشركات الظاهرة على نفسها (رواتب، إيجار، رسوم…) مع التكاليف غير المباشرة القديمة. تُطرح من ربح المشاريع كما في صفحة الشركة." />
            <Figure icon={<Landmark className="w-3.5 h-3.5" />} label={`صافي الشركة · ${netPlannedMargin.toFixed(1)}%`} value={formatCurrency(netPlannedProfit)} tone={netPlannedProfit >= 0 ? 'good' : 'bad'}
              formula="ربح المشاريع − مصاريف الشركات. يساوي «صافي ربح الشركة» في صفحتها. ربح مخطط، وليس الربح النقدي المحقق." />
          </div>
        </div>
      </div>
    </section>
    </TooltipProvider>
  );
}
