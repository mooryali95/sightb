import { ProjectSummary, EVMMetrics } from '@/types/project';
import { formatCurrency } from './format';
import type { MonthlyBudgetPlanRow } from './monthly-plan';

export type SmartAlertSeverity = 'critical' | 'warning' | 'info';
export type SmartAlertCategory = 'budget' | 'profit' | 'burn' | 'evm' | 'schedule' | 'cashflow';

export interface SmartAlert {
  id: string;
  severity: SmartAlertSeverity;
  category: SmartAlertCategory;
  title: string;
  message: string;
  /** target tab key inside ProjectDetail to navigate to */
  targetTab?: string;
  /** human label for the action button */
  actionLabel?: string;
  metric?: string;
}

export interface SmartAlertContext {
  summary: ProjectSummary;
  evm?: EVMMetrics | null;
  monthlyPlan: MonthlyBudgetPlanRow[];
  durationMonths: number;
  currentMonth: number;
  pendingChangeOrders: number;
  openHighRisks: number;
}

/**
 * Generate structured smart alerts (no toasts). Caller renders them however they want.
 */
export function generateSmartAlerts(ctx: SmartAlertContext): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const { summary, evm, monthlyPlan, durationMonths, currentMonth, pendingChangeOrders, openHighRisks } = ctx;

  // 1. Budget overspend
  if (summary.totalPlanned > 0) {
    const pct = summary.spendRate;
    if (pct > 100) {
      alerts.push({
        id: 'budget-over', severity: 'critical', category: 'budget',
        title: 'تجاوز الموازنة المخططة',
        message: `الصرف الفعلي تجاوز الموازنة المخططة بنسبة ${(pct - 100).toFixed(1)}%`,
        metric: `${pct.toFixed(1)}%`,
        targetTab: 'expenses', actionLabel: 'راجع المصروفات',
      });
    } else if (pct >= 90) {
      alerts.push({
        id: 'budget-near', severity: 'warning', category: 'budget',
        title: 'الموازنة قاربت على النفاد',
        message: `صُرف ${formatCurrency(summary.totalActual)} من ${formatCurrency(summary.totalPlanned)}`,
        metric: `${pct.toFixed(1)}%`,
        targetTab: 'budget', actionLabel: 'راجع الموازنة',
      });
    } else if (pct >= 75) {
      alerts.push({
        id: 'budget-info', severity: 'info', category: 'budget',
        title: 'الصرف يقترب من ثلاثة أرباع الموازنة',
        message: `${pct.toFixed(1)}% من الموازنة المخططة`,
        metric: `${pct.toFixed(1)}%`,
        targetTab: 'budget',
      });
    }
  }

  // 2. Contract spend
  if (summary.effectiveContractValue > 0 && summary.contractSpendRate > 100) {
    alerts.push({
      id: 'contract-over', severity: 'critical', category: 'budget',
      title: 'تجاوز قيمة العقد',
      message: `المصروفات تجاوزت قيمة العقد المعدّلة`,
      metric: `${summary.contractSpendRate.toFixed(1)}%`,
      targetTab: 'changeorders', actionLabel: 'راجع أوامر التغيير',
    });
  }

  // 3. Profit margin
  if (summary.plannedProfit < 0) {
    alerts.push({
      id: 'profit-negative', severity: 'critical', category: 'profit',
      title: 'الربح المخطط سالب',
      message: `الموازنة المخططة أكبر من قيمة العقد بمقدار ${formatCurrency(Math.abs(summary.plannedProfit))}`,
      metric: `${summary.plannedProfitMargin.toFixed(1)}%`,
      targetTab: 'budget', actionLabel: 'راجع الموازنة',
    });
  } else if (summary.plannedProfitMargin > 0 && summary.plannedProfitMargin < 5) {
    alerts.push({
      id: 'profit-low', severity: 'warning', category: 'profit',
      title: 'هامش الربح منخفض',
      message: `هامش الربح المخطط ${summary.plannedProfitMargin.toFixed(1)}% — أقل من المستوى الصحي (5%)`,
      metric: `${summary.plannedProfitMargin.toFixed(1)}%`,
      targetTab: 'budget',
    });
  }

  // 4. Realized profit
  if (summary.collectedRevenue > 0 && summary.realizedProfit < 0) {
    alerts.push({
      id: 'realized-negative', severity: 'warning', category: 'profit',
      title: 'الربح المحقق سالب',
      message: `المصروفات تتجاوز ما تم تحصيله فعلياً`,
      targetTab: 'revenue', actionLabel: 'راجع الإيرادات',
    });
  }

  // 5. Burn rate
  if (summary.burnRate > 0 && summary.budgetRemaining > 0) {
    const monthsLeftByBurn = summary.budgetRemaining / summary.burnRate;
    const monthsLeftByPlan = Math.max(0, durationMonths - currentMonth);
    if (monthsLeftByPlan > 0 && monthsLeftByBurn < monthsLeftByPlan * 0.7) {
      alerts.push({
        id: 'burn-high', severity: 'warning', category: 'burn',
        title: 'معدل الحرق مرتفع',
        message: `بهذا المعدل ستنفد الموازنة خلال ${monthsLeftByBurn.toFixed(1)} شهر بينما المتبقي ${monthsLeftByPlan} شهر`,
        targetTab: 'expenses',
      });
    }
  }

  // 6-8. EVM
  if (evm) {
    if (evm.cpi > 0 && evm.cpi < 0.85) {
      alerts.push({
        id: 'cpi-low', severity: 'critical', category: 'evm',
        title: 'مؤشر أداء التكلفة (CPI) منخفض',
        message: `CPI = ${evm.cpi.toFixed(2)} — المشروع ينفق أكثر من القيمة المكتسبة`,
        metric: evm.cpi.toFixed(2),
        targetTab: 'baseline', actionLabel: 'راجع خط الأساس',
      });
    } else if (evm.cpi > 0 && evm.cpi < 0.95) {
      alerts.push({
        id: 'cpi-warn', severity: 'warning', category: 'evm',
        title: 'مؤشر أداء التكلفة قريب من الحد',
        message: `CPI = ${evm.cpi.toFixed(2)}`,
        metric: evm.cpi.toFixed(2),
        targetTab: 'baseline',
      });
    }

    if (evm.spi > 0 && evm.spi < 0.85) {
      alerts.push({
        id: 'spi-low', severity: 'critical', category: 'schedule',
        title: 'تأخر في الجدول الزمني',
        message: `SPI = ${evm.spi.toFixed(2)} — الإنجاز أبطأ من المخطط`,
        metric: evm.spi.toFixed(2),
        targetTab: 'milestones', actionLabel: 'راجع المراحل',
      });
    } else if (evm.spi > 0 && evm.spi < 0.95) {
      alerts.push({
        id: 'spi-warn', severity: 'warning', category: 'schedule',
        title: 'الجدول الزمني متأخر قليلاً',
        message: `SPI = ${evm.spi.toFixed(2)}`,
        metric: evm.spi.toFixed(2),
        targetTab: 'milestones',
      });
    }

    if (evm.vac < 0 && evm.bac > 0) {
      const overrunPct = (Math.abs(evm.vac) / evm.bac) * 100;
      if (overrunPct >= 10) {
        alerts.push({
          id: 'eac-over', severity: 'critical', category: 'evm',
          title: 'التكلفة المتوقعة عند الإكمال (EAC) تتجاوز الميزانية',
          message: `تجاوز متوقع: ${formatCurrency(Math.abs(evm.vac))} (${overrunPct.toFixed(1)}%)`,
          targetTab: 'baseline',
        });
      }
    }
  }

  // 9. Cash flow
  const currentRow = monthlyPlan.find(r => r.month === currentMonth);
  if (currentRow && currentRow.cumulativeActual > 0) {
    const cumNetActual = monthlyPlan
      .slice(0, currentMonth)
      .reduce((s, r) => s + (r.actualRevenue - r.actual), 0);
    if (cumNetActual < 0 && Math.abs(cumNetActual) > summary.totalPlanned * 0.1) {
      alerts.push({
        id: 'cashflow-neg', severity: 'warning', category: 'cashflow',
        title: 'صافي التدفق النقدي سالب',
        message: `المصروفات المتراكمة تتجاوز التحصيلات بمقدار ${formatCurrency(Math.abs(cumNetActual))}`,
        targetTab: 'revenue', actionLabel: 'راجع الإيرادات',
      });
    }
  }

  // 10. Months over budget
  const overMonths = monthlyPlan.filter(r => r.status === 'over').length;
  if (overMonths >= 2) {
    alerts.push({
      id: 'months-over', severity: 'warning', category: 'budget',
      title: `${overMonths} أشهر تجاوزت خطة الصرف`,
      message: `راجع توزيع البنود الشهري`,
      targetTab: 'budget',
    });
  }

  // 11. Pending change orders / risks
  if (pendingChangeOrders > 0) {
    alerts.push({
      id: 'co-pending', severity: 'info', category: 'budget',
      title: `${pendingChangeOrders} أمر تغيير بانتظار الاعتماد`,
      message: 'قد يؤثر على قيمة العقد والموازنة',
      targetTab: 'changeorders', actionLabel: 'راجع أوامر التغيير',
    });
  }
  if (openHighRisks > 0) {
    alerts.push({
      id: 'risks-high', severity: 'warning', category: 'budget',
      title: `${openHighRisks} مخاطر مرتفعة الأثر مفتوحة`,
      message: 'قد تؤثر على إنجاز المشروع',
      targetTab: 'risks', actionLabel: 'راجع المخاطر',
    });
  }

  return alerts;
}
