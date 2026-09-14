/** Row 1: the contract, the budget, the planned profit, and what is left of the contract. */
import { StatCard } from '@/components/StatCard';
import { formatCurrency, addVAT } from '@/lib/finance';
import type { ProjectSummary } from '@/types/project';
import { DollarSign, TrendingUp, Target, Receipt, PiggyBank } from 'lucide-react';

interface Props {
  summary: ProjectSummary;
  vatRate: number;
}

export function ContractRow({ summary, vatRate }: Props) {
  return (
    <>
  {/* الصف 1 — العقد والربحية المخططة */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
    <StatCard
      title={summary.effectiveContractValue !== summary.contractValue ? 'قيمة العقد المعدّلة' : 'قيمة العقد'}
      value={formatCurrency(summary.effectiveContractValue)}
      icon={<DollarSign className="w-4 h-4" />}
      tooltip="إجمالي قيمة العقد قبل الضريبة، شاملاً أوامر التغيير المعتمدة. هذه هي قاعدة كل حسابات الربحية."
      subtitle={summary.effectiveContractValue !== summary.contractValue
        ? `الأصلية: ${formatCurrency(summary.contractValue)}`
        : vatRate > 0 ? `شامل الضريبة: ${formatCurrency(addVAT(summary.effectiveContractValue, vatRate))}` : undefined}
    />
    <StatCard
      title="الموازنة المعتمدة"
      value={formatCurrency(summary.totalPlanned)}
      icon={<PiggyBank className="w-4 h-4" />}
      tooltip="إجمالي التكاليف المخططة لتنفيذ المشروع — تمثّل سقف الإنفاق المتوقع."
      subtitle={summary.effectiveContractValue > 0 ? `${((summary.totalPlanned / summary.effectiveContractValue) * 100).toFixed(1)}% من العقد` : undefined}
    />
    <StatCard
      title="الربح المخطط"
      value={formatCurrency(summary.plannedProfit)}
      icon={<TrendingUp className="w-4 h-4" />}
      trend={summary.plannedProfit >= 0 ? 'up' : 'down'}
      subtitle={`هامش: ${summary.plannedProfitMargin.toFixed(1)}%`}
      tooltip="= قيمة العقد − الموازنة المعتمدة. الربح المتوقع إذا التزمت التنفيذ بالخطة."
    />
    <StatCard
      title="المتبقي من العقد"
      value={formatCurrency(summary.contractRemaining)}
      icon={<Receipt className="w-4 h-4" />}
      trend={summary.contractRemaining >= 0 ? 'neutral' : 'down'}
      subtitle={summary.effectiveContractValue > 0 ? `${((summary.contractRemaining / summary.effectiveContractValue) * 100).toFixed(0)}% لم يُفوتر` : undefined}
      tooltip="= قيمة العقد − (المحصّل + الذمم المدينة). الجزء الذي لم يُفوتر للعميل بعد."
    />
  </div>
    </>
  );
}
