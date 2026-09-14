/** Row 3: the collected, the receivables, the realised profit, and the TCPI; and the baseline prompt. */
import { StatCard } from '@/components/StatCard';
import { formatCurrency } from '@/lib/finance';
import type { ProjectSummary, EVMMetrics } from '@/types/project';
import { DollarSign, TrendingUp, Receipt, Target, Shield } from 'lucide-react';

interface Props {
  summary: ProjectSummary;
  evm: EVMMetrics | null;
  invoicedCount: number;
}

export function CollectionRow({ summary, evm, invoicedCount }: Props) {
  return (
    <>
  {/* الصف 3 — التحصيل والربحية الفعلية */}
  {(summary.collectedRevenue > 0 || summary.accountsReceivable > 0 || summary.totalActual > 0) && (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <StatCard
        title="المحصّل فعلياً"
        value={formatCurrency(summary.collectedRevenue)}
        icon={<DollarSign className="w-4 h-4" />}
        trend="up"
        subtitle={summary.effectiveContractValue > 0
          ? `${(summary.collectedRevenue / summary.effectiveContractValue * 100).toFixed(0)}% من العقد`
          : undefined}
        tooltip="المبالغ النقدية المستلمة فعلياً من العميل — بدون الضريبة."
      />
      <StatCard
        title="ذمم مدينة (مفوتر)"
        value={formatCurrency(summary.accountsReceivable)}
        icon={<Receipt className="w-4 h-4" />}
        trend={summary.accountsReceivable > 0 ? 'neutral' : undefined}
        subtitle={summary.accountsReceivable > 0 ? `${invoicedCount} فاتورة قيد التحصيل` : 'لا فواتير معلّقة'}
        tooltip="فواتير أُصدرت للعميل ولم تُحصّل بعد."
      />
      <StatCard
        title="الربح المحقق"
        value={formatCurrency(summary.realizedProfit)}
        icon={<TrendingUp className="w-4 h-4" />}
        trend={summary.realizedProfit >= 0 ? 'up' : 'down'}
        subtitle={summary.plannedProfit !== 0 ? `المخطط: ${formatCurrency(summary.plannedProfit)}` : undefined}
        tooltip="= المحصّل − المصروف الفعلي. الربح النقدي الذي دخل حسابك فعلاً حتى الآن."
      />
      {evm ? (
        <StatCard
          title="الأداء المطلوب (TCPI)"
          value={evm.tcpiBAC.toFixed(2)}
          icon={<Target className="w-4 h-4" />}
          trend={evm.tcpiBAC <= 1 ? 'up' : evm.tcpiBAC <= 1.1 ? 'neutral' : 'down'}
          subtitle={evm.tcpiBAC <= 1.0 ? 'مريح — الأداء كافٍ'
            : evm.tcpiBAC <= 1.1 ? 'ممكن — تحسين طفيف'
            : evm.tcpiBAC <= 1.2 ? 'صعب — يحتاج تدخل'
            : 'شبه مستحيل — راجع الخطة'}
          tooltip="To-Complete Performance Index — الكفاءة المطلوبة في باقي العمل لإنجاز المشروع ضمن الموازنة."
        />
      ) : (
        <div className="stat-card flex flex-col items-center justify-center text-center bg-muted/30 border-dashed">
          <Shield className="w-5 h-5 text-muted-foreground mb-1.5" />
          <p className="text-xs font-medium text-muted-foreground">CPI / SPI / TCPI</p>
          <p className="text-[10px] text-muted-foreground mt-1">اعتمد خط الأساس لعرض مؤشرات الأداء (EVM)</p>
        </div>
      )}
    </div>
  )}

  {/* تنبيه EVM عند غياب خط الأساس */}
  {!evm && summary.totalActual === 0 && summary.collectedRevenue === 0 && (
    <div className="mb-4 p-3 rounded-lg border border-dashed bg-muted/20 text-center text-xs text-muted-foreground">
      <Shield className="w-4 h-4 inline-block ml-1" />
      اعتمد خط الأساس من تبويب «خط الأساس» لتفعيل مؤشرات الأداء (CPI / SPI / EAC / TCPI).
    </div>
  )}
    </>
  );
}
