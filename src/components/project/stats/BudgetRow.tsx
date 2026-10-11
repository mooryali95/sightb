/** Row 2: the spend, what is left or free, the burn, and the EAC. */
import { StatCard } from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/finance';
import type { ProjectSummary, EVMMetrics } from '@/types/project';
import { TrendingDown, Target, BarChart3 } from 'lucide-react';

interface Props {
  summary: ProjectSummary;
  evm: EVMMetrics | null;
  monthsRemaining: number | null;
  totalCommitted: number;
  availableBudget: number;
}

export function BudgetRow({ summary, evm, monthsRemaining, totalCommitted, availableBudget }: Props) {
  return (
    <>
  {/* الصف 2 — الأداء التشغيلي للموازنة */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <div className="stat-card">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">المصروف الفعلي</span>
        <TrendingDown className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="stat-value">{formatCurrency(summary.totalActual)}</p>
      <div className="mt-2">
        <Progress value={Math.min(summary.spendRate, 100)} className="h-1.5" />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {summary.spendRate.toFixed(1)}% من الموازنة ({formatCurrency(summary.totalPlanned)})
      </p>
    </div>
    <StatCard
      title={totalCommitted > 0 ? 'المتاح للصرف' : 'المتبقي من الموازنة'}
      value={formatCurrency(totalCommitted > 0 ? availableBudget : summary.budgetRemaining)}
      icon={<Target className="w-4 h-4" />}
      trend={(totalCommitted > 0 ? availableBudget : summary.budgetRemaining) >= 0 ? 'up' : 'down'}
      subtitle={totalCommitted > 0 ? `ملتزم بعقود: ${formatCurrency(totalCommitted)}` : undefined}
      tooltip={totalCommitted > 0
        ? '= الموازنة − المصروف الفعلي − الالتزامات المفتوحة. هذا متاح محاسبي، وليس بالضرورة نقداً مستلماً.'
        : '= الموازنة − المصروف. سالب = تجاوز.'}
    />
    <StatCard
      title="معدل الحرق الشهري"
      value={formatCurrency(summary.burnRate)}
      icon={<TrendingDown className="w-4 h-4" />}
      subtitle={monthsRemaining !== null && monthsRemaining > 0
        ? `يكفي لـ ${monthsRemaining.toFixed(1)} شهر`
        : summary.burnRate === 0 ? 'لم يبدأ الصرف' : 'الميزانية مستنفدة'}
      tooltip="متوسط الصرف الشهري = إجمالي المصروف ÷ الأشهر المنقضية. يساعد على توقع موعد نفاد الموازنة."
    />
    {evm ? (
      <StatCard
        title="التكلفة المتوقعة (EAC)"
        value={formatCurrency(evm.eac)}
        icon={<BarChart3 className="w-4 h-4" />}
        trend={evm.vac >= 0 ? 'up' : 'down'}
        subtitle={evm.vac >= 0
          ? `وفر متوقع: ${formatCurrency(evm.vac)}`
          : `تجاوز متوقع: ${formatCurrency(Math.abs(evm.vac))}`}
        tooltip="Estimate At Completion — التكلفة المتوقعة لإنهاء المشروع وفق وتيرة الأداء الحالية."
      />
    ) : (
      <div className="stat-card flex flex-col items-center justify-center text-center bg-muted/30 border-dashed">
        <BarChart3 className="w-5 h-5 text-muted-foreground mb-1.5" />
        <p className="text-xs font-medium text-muted-foreground">EAC غير متاح</p>
        <p className="text-[10px] text-muted-foreground mt-1">اعتمد خط الأساس لتفعيله</p>
      </div>
    )}
  </div>
    </>
  );
}
