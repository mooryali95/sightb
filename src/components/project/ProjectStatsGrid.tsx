import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, addVAT } from '@/lib/finance';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type Project, type ProjectSummary, type EVMMetrics } from '@/types/project';
import {
  DollarSign, TrendingUp, TrendingDown, Target, Receipt, PiggyBank,
  BarChart3, Shield, Clock, FileEdit,
} from 'lucide-react';

interface Props {
  project: Project;
  summary: ProjectSummary;
  evm: EVMMetrics | null;
  currentMonth: number;
  daysRemaining: number | null;
  monthsRemaining: number | null;
  totalCommitted: number;
  availableBudget: number;
  vatRate: number;
  healthScore: { label: string; color: string; bg: string };
  openRisksCount: number;
  pendingExpensesCount: number;
  pendingChangeOrders: number;
  invoicedCount: number;
}

/** Health strip + KPI card rows + quick alerts for the project overview. */
export function ProjectStatsGrid({
  project, summary, evm, currentMonth, daysRemaining, monthsRemaining,
  totalCommitted, availableBudget, vatRate, healthScore,
  openRisksCount, pendingExpensesCount, pendingChangeOrders, invoicedCount,
}: Props) {
  return (
    <>
      {/* شريط الحالة السريع */}
      <div className={`flex flex-wrap items-center gap-2 text-xs p-2.5 rounded-lg border mb-4 ${healthScore.bg}`}>
        <span className={`font-bold ${healthScore.color}`}>{healthScore.label}</span>
        <span className="text-muted-foreground">|</span>
        <Badge className={`text-xs ${PROJECT_STATUS_COLORS[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
        <span className="text-muted-foreground">|</span>
        <span>الإنجاز {project.percentComplete}%</span>
        <span className="text-muted-foreground">|</span>
        <span>الشهر {currentMonth} من {project.durationMonths}</span>
        {daysRemaining !== null && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className={daysRemaining < 30 ? 'text-destructive font-medium' : ''}>{daysRemaining} يوم متبقي</span>
          </>
        )}
        {evm && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className={evm.cpi >= 1 ? 'health-good' : 'health-critical'}>CPI {evm.cpi.toFixed(2)}</span>
            <span className={evm.spi >= 1 ? 'health-good' : 'health-critical'}>SPI {evm.spi.toFixed(2)}</span>
          </>
        )}
        {openRisksCount > 0 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span>{openRisksCount} خطر مفتوح</span>
          </>
        )}
      </div>

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
            ? '= الموازنة − المصروف − الالتزامات المفتوحة. سالب = تجاوز محتمل.'
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

      {/* تنبيهات سريعة */}
      {(pendingExpensesCount > 0 || pendingChangeOrders > 0) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {pendingExpensesCount > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
              <Clock className="w-3 h-3" />
              {pendingExpensesCount} مصروف بانتظار الاعتماد
            </div>
          )}
          {pendingChangeOrders > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
              <FileEdit className="w-3 h-3" />
              {pendingChangeOrders} أمر تغيير مقترح
            </div>
          )}
        </div>
      )}
    </>
  );
}
