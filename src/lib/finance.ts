import {
  BudgetItem, Expense, Revenue, ProjectSummary, Project,
  BaselineItem, EVMMetrics, ChangeOrder, MonthlyCashFlow, CostType, ExpenseCategory,
} from '@/types/project';

export function formatCurrency(amount: number, currency = 'ر.س'): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function calcVAT(amount: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return 0;
  return Math.round(amount * vatRate / 100 * 100) / 100;
}
export function addVAT(amountExcl: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return amountExcl;
  return Math.round((amountExcl * (1 + vatRate / 100)) * 100) / 100;
}
export function removeVAT(amountIncl: number, vatRate: number): number {
  if (!vatRate || vatRate <= 0) return amountIncl;
  return Math.round(amountIncl / (1 + vatRate / 100) * 100) / 100;
}

/**
 * Calculate the effective contract value after approved change orders
 */
export function getEffectiveContractValue(contractValue: number, changeOrders: ChangeOrder[]): number {
  const approvedImpact = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + co.amountImpact, 0);
  return contractValue + approvedImpact;
}

/**
 * Get the current month of the project based on startDate
 */
export function getCurrentMonth(startDate: string, durationMonths: number): number {
  if (!startDate) return Math.ceil(durationMonths / 2);
  const start = new Date(startDate);
  const now = new Date();
  const diff = (now.getFullYear() - start.getFullYear()) * 12
    + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, Math.min(diff, durationMonths));
}

/**
 * Calculate the TRUE total planned value for budget items,
 * accounting for recurring items that repeat monthly.
 * - fixed: plannedAmount is the total (distributed evenly over months)
 * - one_time: plannedAmount is the total (all in one month)
 * - recurring: plannedAmount is the MONTHLY amount (multiply by number of months)
 */
export function getTotalPlanned(budgetItems: { plannedAmount: number; costType?: string; startMonth?: number | null; endMonth?: number | null }[]): number {
  return budgetItems.reduce((sum, b) => {
    if (b.costType === 'recurring') {
      const start = b.startMonth || 1;
      const end = b.endMonth || b.startMonth || 1;
      const months = Math.max(1, end - start + 1);
      return sum + (b.plannedAmount * months);
    }
    return sum + b.plannedAmount;
  }, 0);
}

export function getProjectSummary(
  project: Project,
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  changeOrders: ChangeOrder[] = []
): ProjectSummary {
  const totalPlanned = getTotalPlanned(budgetItems);
  // استبعاد المرفوضات + السلف غير المسوّاة (Outstanding Advances) من AC
  const totalActual = expenses
    .filter(e => (e as any).approvalStatus !== 'rejected' && !(e as any).isOutstandingAdvance)
    .reduce((sum, e) => sum + e.amount, 0);

  const effectiveContractValue = getEffectiveContractValue(project.contractValue, changeOrders);
  const contractRemaining = effectiveContractValue - totalActual;
  const budgetRemaining = totalPlanned - totalActual;
  // budgetVariance as percentage
  const budgetVariance = totalPlanned > 0 ? ((totalPlanned - totalActual) / totalPlanned) * 100 : 0;

  const plannedProfit = effectiveContractValue - totalPlanned;
  const plannedProfitMargin = effectiveContractValue > 0 ? (plannedProfit / effectiveContractValue) * 100 : 0;

  const collectedRevenue = revenues.filter(r => r.status === 'collected').reduce((sum, r) => sum + r.amount, 0);
  const invoicedRevenue = revenues.filter(r => r.status === 'invoiced').reduce((sum, r) => sum + r.amount, 0);
  const totalPlannedRevenue = revenues.filter(r => r.status === 'planned').reduce((sum, r) => sum + r.amount, 0);
  const realizedProfit = collectedRevenue - totalActual;
  const realizedProfitMargin = collectedRevenue > 0 ? (realizedProfit / collectedRevenue) * 100 : 0;
  const accountsReceivable = invoicedRevenue; // invoiced but not yet collected

  const spendRate = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const contractSpendRate = effectiveContractValue > 0 ? (totalActual / effectiveContractValue) * 100 : 0;

  // Burn rate = average monthly actual spend
  const currentMonth = getCurrentMonth(project.startDate, project.durationMonths);
  const projectStarted = project.startDate ? new Date(project.startDate) <= new Date() : true;
  const burnRate = projectStarted && currentMonth > 0 ? totalActual / currentMonth : 0;

  // Management reserve
  const managementReserve = project.managementReserve || 0;
  const bacWithoutReserve = totalPlanned - managementReserve;

  // === VAT ===
  const vatRate = (project as any).taxPercent || 0;
  const contractValueInclVAT = vatRate > 0 ? addVAT(effectiveContractValue, vatRate) : effectiveContractValue;

  const totalVATOnExpenses = expenses
    .filter(e => (e as any).approvalStatus !== 'rejected' && !(e as any).isOutstandingAdvance && !(e as any).isVatExempt)
    .reduce((sum, e) => sum + calcVAT(e.amount, vatRate), 0);
  const totalActualInclVAT = totalActual + totalVATOnExpenses;

  const totalVATOnRevenues = revenues
    .filter(r => r.status === 'invoiced' || r.status === 'collected')
    .reduce((sum, r) => sum + calcVAT(r.amount, vatRate), 0);

  const netVATPayable = totalVATOnRevenues - totalVATOnExpenses;

  return {
    contractValue: project.contractValue,
    effectiveContractValue,
    contractRemaining,
    totalPlanned,
    totalActual,
    budgetRemaining,
    budgetVariance,
    plannedProfit,
    plannedProfitMargin,
    collectedRevenue,
    invoicedRevenue,
    totalPlannedRevenue,
    realizedProfit,
    realizedProfitMargin,
    accountsReceivable,
    spendRate,
    contractSpendRate,
    burnRate,
    percentComplete: project.percentComplete,
    managementReserve,
    bacWithoutReserve,
    vatRate,
    contractValueInclVAT,
    totalActualInclVAT,
    totalVATOnExpenses,
    totalVATOnRevenues,
    netVATPayable,
  };
}

export function getExpensesByCategory(expenses: Expense[]) {
  const map: Record<string, number> = {};
  expenses.forEach((e) => {
    map[e.category] = (map[e.category] || 0) + e.amount;
  });
  return map;
}

export function getMonthlyBreakdown(expenses: Expense[], months: number) {
  const result: number[] = Array(months).fill(0);
  expenses.forEach((e) => {
    if ((e as any).isOutstandingAdvance) return; // exclude unsettled advances
    if (e.month >= 1 && e.month <= months) {
      result[e.month - 1] += e.amount;
    }
  });
  return result;
}

/**
 * Distribute a single item across monthly buckets based on costType + start/end range.
 * Shared by both getBaselineMonthlyPV and getPlannedMonthlyCashFlow.
 */
function distributeItem(
  result: number[],
  plannedAmount: number,
  costType: CostType | undefined,
  startMonth: number | undefined,
  endMonth: number | undefined,
  month: number | undefined,
  totalMonths: number,
) {
  const hasRange = startMonth || endMonth;
  const hasMonth = month;

  if (!hasRange && !hasMonth) {
    // No month info — distribute evenly
    const perMonth = plannedAmount / totalMonths;
    for (let m = 0; m < totalMonths; m++) {
      result[m] += perMonth;
    }
    return;
  }

  // Use startMonth/endMonth if available, fallback to legacy month field
  const s = Math.max(1, startMonth || month || 1);
  const e = Math.min(totalMonths, endMonth || startMonth || month || totalMonths);

  const type = costType || 'fixed';

  switch (type) {
    case 'one_time':
      if (s >= 1 && s <= totalMonths) {
        result[s - 1] += plannedAmount;
      }
      break;
    case 'recurring':
      for (let m = s; m <= e; m++) {
        result[m - 1] += plannedAmount;
      }
      break;
    case 'fixed':
    default: {
      const span = e - s + 1;
      const perMonth = span > 0 ? plannedAmount / span : plannedAmount;
      for (let m = s; m <= e; m++) {
        result[m - 1] += perMonth;
      }
      break;
    }
  }
}

/**
 * Get monthly planned values from baseline items (time-phased budget)
 * Supports startMonth/endMonth + costType with fallback for legacy data
 */
export function getBaselineMonthlyPV(items: BaselineItem[], months: number): number[] {
  const result: number[] = Array(months).fill(0);

  items.forEach(item => {
    distributeItem(
      result,
      item.plannedAmount,
      item.costType,
      item.startMonth,
      item.endMonth,
      item.month,
      months,
    );
  });

  return result;
}

/**
 * Get monthly planned cash flow from budget items using startMonth/endMonth + costType
 */
export function getPlannedMonthlyCashFlow(budgetItems: BudgetItem[], durationMonths: number): number[] {
  const result: number[] = Array(durationMonths).fill(0);

  budgetItems.forEach(item => {
    distributeItem(
      result,
      item.plannedAmount,
      item.costType,
      item.startMonth,
      item.endMonth,
      item.month,
      durationMonths,
    );
  });

  return result;
}

/**
 * Get cash flow forecast combining budget, expenses, and revenues
 */
export function getCashFlowForecast(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  durationMonths: number
): MonthlyCashFlow[] {
  const plannedExp = getPlannedMonthlyCashFlow(budgetItems, durationMonths);
  const actualExp = getMonthlyBreakdown(expenses, durationMonths);

  const plannedRev: number[] = Array(durationMonths).fill(0);
  const actualRev: number[] = Array(durationMonths).fill(0);

  revenues.forEach(r => {
    if (r.month >= 1 && r.month <= durationMonths) {
      // All revenues (planned, invoiced, collected) count as expected revenue
      plannedRev[r.month - 1] += r.amount;
      // Only collected counts as actual
      if (r.status === 'collected') {
        actualRev[r.month - 1] += r.amount;
      }
    }
  });

  let cumPlanned = 0;
  let cumActual = 0;

  return Array.from({ length: durationMonths }, (_, i) => {
    const netPlanned = plannedRev[i] - plannedExp[i];
    const netActual = actualRev[i] - actualExp[i];
    cumPlanned += netPlanned;
    cumActual += netActual;

    return {
      month: i + 1,
      plannedExpenses: plannedExp[i],
      actualExpenses: actualExp[i],
      plannedRevenue: plannedRev[i],
      actualRevenue: actualRev[i],
      netPlanned,
      netActual,
      cumulativePlanned: cumPlanned,
      cumulativeActual: cumActual,
    };
  });
}

/**
 * Calculate EVM metrics given baseline, expenses, and current month
 * Uses independent percentComplete (from milestones) instead of AC/BAC ratio
 */
export function calculateEVM(
  baselineItems: BaselineItem[],
  expenses: Expense[],
  durationMonths: number,
  currentMonth: number,
  percentComplete: number = 0,
  managementReserve: number = 0
): EVMMetrics {
  const monthlyPV = getBaselineMonthlyPV(baselineItems, durationMonths);
  const monthlyAC = getMonthlyBreakdown(expenses, durationMonths);

  // BAC = baseline total MINUS management reserve (per PMI standard)
  const rawBac = monthlyPV.reduce((s, v) => s + v, 0);
  const bac = Math.max(0, rawBac - managementReserve);

  // PV = cumulative planned value up to current month
  const pv = monthlyPV.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // AC = cumulative actual cost up to current month
  const ac = monthlyAC.slice(0, currentMonth).reduce((s, v) => s + v, 0);

  // EV = % of work completed × BAC (independent from spending)
  const ev = (percentComplete / 100) * bac;

  const cv = ev - ac;
  const sv = ev - pv;
  // When AC=0 and EV=0: no deviation → CPI=1; otherwise compute normally
  const cpi = ac > 0 ? ev / ac : (ev === 0 ? 1 : 0);
  const spi = pv > 0 ? ev / pv : (ev === 0 ? 1 : 0);

  // EAC variants
  const eacTypical = cpi > 0 ? bac / cpi : bac;           // Current performance continues
  const eacAtypical = ac + (bac - ev);                      // Performance will improve
  const eacCombined = cpi > 0 && spi > 0 ? ac + ((bac - ev) / (cpi * spi)) : bac;  // Weighted

  const eac = eacTypical;
  const etc = eac - ac;
  const vac = bac - eac;

  // TCPI
  const tcpiBAC = (bac - ac) !== 0 ? (bac - ev) / (bac - ac) : 0;
  const tcpiEAC = (eac - ac) !== 0 ? (bac - ev) / (eac - ac) : 0;

  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac, tcpiBAC, tcpiEAC, eacAtypical, eacCombined };
}

// ======== Monthly Budget Plan ========

export interface MonthlyBudgetItemDetail {
  budgetItemId: string;
  category: ExpenseCategory | string;
  description: string;
  amount: number;        // amount allocated to this specific month
  costType: CostType | string;
}

export type MonthStatus = 'future' | 'on_track' | 'near_limit' | 'over' | 'inactive';

export interface MonthlyBudgetPlanRow {
  month: number;
  planned: number;          // planned spend for this month (from budget items)
  actual: number;           // actual expenses recorded this month
  variance: number;         // planned - actual (positive = under budget)
  utilizationPct: number;   // actual / planned * 100
  plannedRevenue: number;
  actualRevenue: number;    // collected
  netCashFlow: number;      // actualRevenue - actual
  cumulativePlanned: number;
  cumulativeActual: number;
  status: MonthStatus;
  isCurrent: boolean;
  isPast: boolean;
  items: MonthlyBudgetItemDetail[];
}

/**
 * Build a precise monthly distribution of budget items, expenses, and revenues.
 * Each budget item is distributed across months according to its costType + range:
 *  - one_time: full amount in startMonth
 *  - recurring: amount per month from startMonth → endMonth
 *  - fixed (with range): evenly distributed across startMonth → endMonth
 *  - fixed (no range): evenly distributed across all months
 */
export function getMonthlyBudgetPlan(
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  durationMonths: number,
  startDate?: string,
): MonthlyBudgetPlanRow[] {
  const months = Math.max(1, durationMonths);
  const plannedPerMonth: number[] = Array(months).fill(0);
  const itemsPerMonth: MonthlyBudgetItemDetail[][] = Array.from({ length: months }, () => []);

  // Distribute budget items per month with full traceability
  budgetItems.forEach((item) => {
    const costType = (item.costType || 'fixed') as CostType;
    const startMonth = item.startMonth || item.month;
    const endMonth = item.endMonth || item.startMonth || item.month;

    const pushDetail = (monthIdx: number, amount: number) => {
      if (amount <= 0) return;
      if (monthIdx < 0 || monthIdx >= months) return;
      plannedPerMonth[monthIdx] += amount;
      itemsPerMonth[monthIdx].push({
        budgetItemId: item.id,
        category: item.category,
        description: item.description,
        amount,
        costType,
      });
    };

    // No month info → distribute evenly
    if (!startMonth && !endMonth) {
      const perMonth = item.plannedAmount / months;
      for (let m = 0; m < months; m++) pushDetail(m, perMonth);
      return;
    }

    const s = Math.max(1, startMonth || 1);
    const e = Math.min(months, endMonth || s);

    switch (costType) {
      case 'one_time':
        pushDetail(s - 1, item.plannedAmount);
        break;
      case 'recurring':
        for (let m = s; m <= e; m++) pushDetail(m - 1, item.plannedAmount);
        break;
      case 'fixed':
      default: {
        const span = Math.max(1, e - s + 1);
        const perMonth = item.plannedAmount / span;
        for (let m = s; m <= e; m++) pushDetail(m - 1, perMonth);
      }
    }
  });

  // Aggregate actual expenses per month
  const actualPerMonth: number[] = Array(months).fill(0);
  expenses.forEach((exp) => {
    if ((exp as any).approvalStatus === 'rejected') return;
    if ((exp as any).isOutstandingAdvance) return;
    if (exp.month >= 1 && exp.month <= months) {
      actualPerMonth[exp.month - 1] += exp.amount;
    }
  });

  // Aggregate revenues per month
  const plannedRevPerMonth: number[] = Array(months).fill(0);
  const actualRevPerMonth: number[] = Array(months).fill(0);
  revenues.forEach((r) => {
    if (r.month >= 1 && r.month <= months) {
      plannedRevPerMonth[r.month - 1] += r.amount;
      if (r.status === 'collected') actualRevPerMonth[r.month - 1] += r.amount;
    }
  });

  const currentMonth = startDate ? getCurrentMonth(startDate, months) : Math.ceil(months / 2);

  let cumulativePlanned = 0;
  let cumulativeActual = 0;

  return Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const planned = plannedPerMonth[i];
    const actual = actualPerMonth[i];
    const variance = planned - actual;
    const utilizationPct = planned > 0 ? (actual / planned) * 100 : (actual > 0 ? 999 : 0);
    cumulativePlanned += planned;
    cumulativeActual += actual;
    const isCurrent = month === currentMonth;
    const isPast = month < currentMonth;

    let status: MonthStatus;
    if (planned === 0 && actual === 0) {
      status = 'inactive';
    } else if (month > currentMonth) {
      status = 'future';
    } else if (utilizationPct > 100) {
      status = 'over';
    } else if (utilizationPct >= 85) {
      status = 'near_limit';
    } else {
      status = 'on_track';
    }

    return {
      month,
      planned,
      actual,
      variance,
      utilizationPct,
      plannedRevenue: plannedRevPerMonth[i],
      actualRevenue: actualRevPerMonth[i],
      netCashFlow: actualRevPerMonth[i] - actual,
      cumulativePlanned,
      cumulativeActual,
      status,
      isCurrent,
      isPast,
      items: itemsPerMonth[i],
    };
  });
}

// ======== Smart Alerts ========

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
  metric?: string; // e.g., "92.3%"
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
 * Generate structured smart alerts (no toasts).
 * Caller renders them however they want.
 */
export function generateSmartAlerts(ctx: SmartAlertContext): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const { summary, evm, monthlyPlan, durationMonths, currentMonth, pendingChangeOrders, openHighRisks } = ctx;

  // 1. Budget overspend (overall)
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

  // 3. Profit margin negative / low
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

  // 4. Realized profit warning
  if (summary.collectedRevenue > 0 && summary.realizedProfit < 0) {
    alerts.push({
      id: 'realized-negative', severity: 'warning', category: 'profit',
      title: 'الربح المحقق سالب',
      message: `المصروفات تتجاوز ما تم تحصيله فعلياً`,
      targetTab: 'revenue', actionLabel: 'راجع الإيرادات',
    });
  }

  // 5. Burn rate too high
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

  // 6. EVM CPI alerts
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

    // 7. SPI schedule
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

    // 8. EAC overrun
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

  // 9. Cash flow negative this month / cumulative
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

