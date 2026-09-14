/**
 * What-if analysis: four sliders over the project as it stands, the
 * scenario they produce, and the warnings it raises. The maths lives in
 * whatif/scenario.ts and the cards in whatif/WhatIfCards.tsx.
 */
import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/finance';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { whatIfScenario, hasChanges, NO_DELTAS, type WhatIfDeltas } from './whatif/scenario';
import { SliderCard, ResultCard } from './whatif/WhatIfCards';

interface WhatIfSectionProps {
  contractValue: number;
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  durationMonths: number;
  percentComplete: number;
  currency?: string;
}

export function WhatIfSection({
  contractValue, totalPlanned, totalActual, totalRevenue,
  durationMonths, percentComplete, currency = 'ر.س',
}: WhatIfSectionProps) {
  const [deltas, setDeltas] = useState<WhatIfDeltas>(NO_DELTAS);
  const set = (key: keyof WhatIfDeltas) => (v: number) => setDeltas((d) => ({ ...d, [key]: v }));

  const scenario = useMemo(
    () => whatIfScenario({ contractValue, totalPlanned, totalActual, totalRevenue, durationMonths, percentComplete }, deltas),
    [contractValue, totalPlanned, totalActual, totalRevenue, durationMonths, percentComplete, deltas],
  );
  const changed = hasChanges(deltas);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">تحليل ما-إذا (What-If)</h3>
          <p className="text-xs text-muted-foreground">حرّك المؤشرات لمحاكاة سيناريوهات مختلفة</p>
        </div>
        {changed && (
          <Button variant="outline" size="sm" onClick={() => setDeltas(NO_DELTAS)} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />إعادة ضبط
          </Button>
        )}
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderCard label="تغيير قيمة العقد" value={deltas.contract} min={-50} max={50} upIsGood preview={formatCurrency(scenario.newContract, currency)} onChange={set('contract')} />
        <SliderCard label="تغيير المصروفات" value={deltas.expense} min={-50} max={50} upIsGood={false} preview={formatCurrency(scenario.projectedTotal, currency)} onChange={set('expense')} />
        <SliderCard label="تغيير المدة (أشهر)" value={deltas.duration} min={-6} max={12} upIsGood={false} suffix="" preview={`${scenario.newDuration} شهر`} onChange={set('duration')} />
        <SliderCard label="تغيير الإيرادات" value={deltas.revenue} min={-50} max={50} upIsGood preview={formatCurrency(scenario.newRevenue, currency)} onChange={set('revenue')} />
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResultCard
          title="الربح المتوقع"
          value={formatCurrency(scenario.plannedProfit, currency)}
          subtitle={`هامش: ${scenario.plannedMargin.toFixed(1)}%`}
          trend={scenario.plannedProfit >= 0 ? 'up' : 'down'}
          diff={changed ? scenario.profitDiff : undefined}
          currency={currency}
        />
        <ResultCard
          title="المتبقي من الموازنة"
          value={formatCurrency(scenario.budgetRemaining, currency)}
          subtitle={`${scenario.monthsRemaining.toFixed(1)} شهر متبقي`}
          trend={scenario.budgetRemaining >= 0 ? 'up' : 'down'}
        />
        <ResultCard
          title="مؤشر CPI"
          value={scenario.cpi.toFixed(2)}
          subtitle={scenario.cpi >= 1 ? 'أداء جيد' : 'تجاوز التكلفة'}
          trend={scenario.cpi >= 1 ? 'up' : 'down'}
        />
        <ResultCard
          title="التكلفة المقدرة (EAC)"
          value={formatCurrency(scenario.eac, currency)}
          subtitle="تقدير التكلفة عند الإنجاز"
          trend={scenario.eac <= scenario.newContract ? 'up' : 'down'}
        />
      </div>

      {/* Warnings */}
      {changed && (
        <div className="space-y-2">
          {scenario.plannedProfit < 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تحذير: هذا السيناريو يؤدي إلى خسارة بقيمة {formatCurrency(Math.abs(scenario.plannedProfit), currency)}</span>
            </div>
          )}
          {scenario.budgetRemaining < 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تحذير: تجاوز الموازنة بقيمة {formatCurrency(Math.abs(scenario.budgetRemaining), currency)}</span>
            </div>
          )}
          {scenario.cpi < 0.8 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تحذير: مؤشر أداء التكلفة منخفض جداً ({scenario.cpi.toFixed(2)})</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
