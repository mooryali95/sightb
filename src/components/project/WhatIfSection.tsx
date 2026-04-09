import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/finance';
import { TrendingUp, TrendingDown, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [contractDelta, setContractDelta] = useState(0);
  const [expenseDelta, setExpenseDelta] = useState(0);
  const [durationDelta, setDurationDelta] = useState(0);
  const [revenueDelta, setRevenueDelta] = useState(0);

  const reset = () => {
    setContractDelta(0);
    setExpenseDelta(0);
    setDurationDelta(0);
    setRevenueDelta(0);
  };

  const scenario = useMemo(() => {
    const newContract = contractValue * (1 + contractDelta / 100);
    const newExpenses = totalActual * (1 + expenseDelta / 100);
    const projectedTotal = totalPlanned * (1 + expenseDelta / 100);
    const newDuration = Math.max(1, durationMonths + durationDelta);
    const newRevenue = totalRevenue * (1 + revenueDelta / 100);

    const plannedProfit = newContract - projectedTotal;
    const plannedMargin = newContract > 0 ? (plannedProfit / newContract) * 100 : 0;
    const realizedProfit = newRevenue - newExpenses;
    const budgetRemaining = projectedTotal - newExpenses;
    const monthlyBurnRate = newDuration > 0 ? projectedTotal / newDuration : 0;
    const monthsRemaining = monthlyBurnRate > 0 ? budgetRemaining / monthlyBurnRate : 0;

    // EVM indicators — EV = BAC × %Complete (PMI standard)
    const bac = projectedTotal; // BAC = الميزانية المخططة (ليست قيمة العقد)
    const ev = bac * (percentComplete / 100);
    const cpi = newExpenses > 0 ? ev / newExpenses : 1;
    const eac = cpi > 0 ? projectedTotal / cpi : projectedTotal;

    return {
      newContract, newExpenses, projectedTotal, newDuration, newRevenue,
      plannedProfit, plannedMargin, realizedProfit, budgetRemaining,
      monthlyBurnRate, monthsRemaining, cpi, eac,
    };
  }, [contractValue, totalPlanned, totalActual, totalRevenue, durationMonths, percentComplete, contractDelta, expenseDelta, durationDelta, revenueDelta]);

  const originalProfit = contractValue - totalPlanned;
  const profitDiff = scenario.plannedProfit - originalProfit;
  const hasChanges = contractDelta !== 0 || expenseDelta !== 0 || durationDelta !== 0 || revenueDelta !== 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">تحليل ما-إذا (What-If)</h3>
          <p className="text-xs text-muted-foreground">حرّك المؤشرات لمحاكاة سيناريوهات مختلفة</p>
        </div>
        {hasChanges && (
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />إعادة ضبط
          </Button>
        )}
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">تغيير قيمة العقد</Label>
              <Badge variant={contractDelta > 0 ? 'default' : contractDelta < 0 ? 'destructive' : 'secondary'} className="text-xs">
                {contractDelta > 0 ? '+' : ''}{contractDelta}%
              </Badge>
            </div>
            <Slider value={[contractDelta]} onValueChange={([v]) => setContractDelta(v)} min={-50} max={50} step={1} />
            <p className="text-xs text-muted-foreground">{formatCurrency(scenario.newContract, currency)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">تغيير المصروفات</Label>
              <Badge variant={expenseDelta > 0 ? 'destructive' : expenseDelta < 0 ? 'default' : 'secondary'} className="text-xs">
                {expenseDelta > 0 ? '+' : ''}{expenseDelta}%
              </Badge>
            </div>
            <Slider value={[expenseDelta]} onValueChange={([v]) => setExpenseDelta(v)} min={-50} max={50} step={1} />
            <p className="text-xs text-muted-foreground">{formatCurrency(scenario.projectedTotal, currency)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">تغيير المدة (أشهر)</Label>
              <Badge variant={durationDelta > 0 ? 'destructive' : durationDelta < 0 ? 'default' : 'secondary'} className="text-xs">
                {durationDelta > 0 ? '+' : ''}{durationDelta}
              </Badge>
            </div>
            <Slider value={[durationDelta]} onValueChange={([v]) => setDurationDelta(v)} min={-6} max={12} step={1} />
            <p className="text-xs text-muted-foreground">{scenario.newDuration} شهر</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">تغيير الإيرادات</Label>
              <Badge variant={revenueDelta > 0 ? 'default' : revenueDelta < 0 ? 'destructive' : 'secondary'} className="text-xs">
                {revenueDelta > 0 ? '+' : ''}{revenueDelta}%
              </Badge>
            </div>
            <Slider value={[revenueDelta]} onValueChange={([v]) => setRevenueDelta(v)} min={-50} max={50} step={1} />
            <p className="text-xs text-muted-foreground">{formatCurrency(scenario.newRevenue, currency)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResultCard
          title="الربح المتوقع"
          value={formatCurrency(scenario.plannedProfit, currency)}
          subtitle={`هامش: ${scenario.plannedMargin.toFixed(1)}%`}
          trend={scenario.plannedProfit >= 0 ? 'up' : 'down'}
          diff={hasChanges ? profitDiff : undefined}
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
          trend={scenario.eac <= contractValue ? 'up' : 'down'}
        />
      </div>

      {/* Warnings */}
      {hasChanges && (
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

function ResultCard({ title, value, subtitle, trend, diff, currency }: {
  title: string; value: string; subtitle: string;
  trend: 'up' | 'down'; diff?: number; currency?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        <div className="flex items-center gap-2">
          {trend === 'up' ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
          <span className="text-lg font-bold">{value}</span>
        </div>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        {diff !== undefined && diff !== 0 && (
          <p className={`text-[10px] font-medium ${diff > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
            {diff > 0 ? '+' : ''}{formatCurrency(diff, currency)} عن الأصلي
          </p>
        )}
      </CardContent>
    </Card>
  );
}
