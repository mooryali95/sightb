/**
 * Unit tests for the smart alerts and the cash flow forecast. The alerts
 * are the project page's early warnings, so what is pinned is which
 * threshold raises which alert at which severity, where it sends the
 * reader, and that a healthy project raises nothing. The forecast is the
 * per-month net the cash flow chart draws.
 */
import { describe, it, expect } from 'vitest';
import type { BudgetItem, EVMMetrics, Expense, ProjectSummary, Revenue } from '@/types/project';
import type { MonthlyBudgetPlanRow } from '@/lib/finance/monthly-plan';
import { generateSmartAlerts, getCashFlowForecast, type SmartAlertContext } from '@/lib/finance';

const one = <T,>(row: Partial<T>): T => row as T;

/** A healthy project: 100k contract, 80k planned, 40k spent, 50k collected, half way through a year. */
const healthy = (over: Partial<ProjectSummary> = {}): ProjectSummary => one<ProjectSummary>({
  contractValue: 100000, effectiveContractValue: 100000, totalPlanned: 80000, totalActual: 40000, budgetRemaining: 40000,
  plannedProfit: 20000, plannedProfitMargin: 20, collectedRevenue: 50000, realizedProfit: 10000, spendRate: 50,
  contractSpendRate: 40, burnRate: 40000 / 6, ...over,
});
const evm = (over: Partial<EVMMetrics> = {}): EVMMetrics => one<EVMMetrics>({ cpi: 1, spi: 1, vac: 0, bac: 80000, ...over });
const row = (month: number, over: Partial<MonthlyBudgetPlanRow> = {}): MonthlyBudgetPlanRow => one<MonthlyBudgetPlanRow>({
  month, planned: 0, actual: 0, actualRevenue: 0, cumulativeActual: 0, status: 'ok' as MonthlyBudgetPlanRow['status'], ...over,
});
const ctx = (over: Partial<SmartAlertContext> = {}): SmartAlertContext => ({
  summary: healthy(), evm: evm(), monthlyPlan: [], durationMonths: 12, currentMonth: 6, pendingChangeOrders: 0, openHighRisks: 0, ...over,
});
const ids = (c: SmartAlertContext) => generateSmartAlerts(c).map((a) => a.id);
const find = (c: SmartAlertContext, id: string) => generateSmartAlerts(c).find((a) => a.id === id);

describe('a healthy project', () => {
  it('raises nothing, with or without earned value', () => {
    expect(ids(ctx())).toEqual([]);
    expect(ids(ctx({ evm: null }))).toEqual([]);
  });
});

describe('budget alerts', () => {
  it('escalates by spend rate: info from 75%, warning from 90%, critical past 100%', () => {
    expect(find(ctx({ summary: healthy({ spendRate: 74.9 }) }), 'budget-info')).toBeUndefined();
    expect(find(ctx({ summary: healthy({ spendRate: 75 }) }), 'budget-info')).toMatchObject({ severity: 'info', category: 'budget', metric: '75.0%', targetTab: 'budget' });
    expect(find(ctx({ summary: healthy({ spendRate: 90, totalActual: 72000 }) }), 'budget-near')).toMatchObject({ severity: 'warning', message: 'صُرف 72,000.00 ر.س من 80,000.00 ر.س', targetTab: 'budget' });
    expect(find(ctx({ summary: healthy({ spendRate: 112.5 }) }), 'budget-over')).toMatchObject({ severity: 'critical', message: 'الصرف الفعلي تجاوز الموازنة المخططة بنسبة 12.5%', targetTab: 'expenses', actionLabel: 'راجع المصروفات' });
    expect(ids(ctx({ summary: healthy({ spendRate: 112.5 }) })).filter((id) => id.startsWith('budget-'))).toEqual(['budget-over']);
  });

  it('stays quiet on spend rate when nothing was planned', () => {
    expect(ids(ctx({ summary: healthy({ totalPlanned: 0, spendRate: 500 }) }))).toEqual([]);
  });

  it('flags spend past the revised contract and sends the reader to the change orders', () => {
    expect(find(ctx({ summary: healthy({ contractSpendRate: 101 }) }), 'contract-over')).toMatchObject({ severity: 'critical', metric: '101.0%', targetTab: 'changeorders' });
    expect(find(ctx({ summary: healthy({ contractSpendRate: 100 }) }), 'contract-over')).toBeUndefined();
    expect(find(ctx({ summary: healthy({ effectiveContractValue: 0, contractSpendRate: 300 }) }), 'contract-over')).toBeUndefined();
  });

  it('warns when two or more months ran over their plan', () => {
    const over = (m: number) => row(m, { status: 'over' as MonthlyBudgetPlanRow['status'] });
    expect(find(ctx({ monthlyPlan: [over(1)] }), 'months-over')).toBeUndefined();
    expect(find(ctx({ monthlyPlan: [over(1), row(2), over(3)] }), 'months-over')).toMatchObject({ severity: 'warning', title: '2 أشهر تجاوزت خطة الصرف' });
  });
});

describe('profit alerts', () => {
  it('is critical on a negative planned profit and a warning under a 5% margin, never both', () => {
    expect(find(ctx({ summary: healthy({ plannedProfit: -2500, plannedProfitMargin: -2.5 }) }), 'profit-negative')).toMatchObject({ severity: 'critical', message: 'الموازنة المخططة أكبر من قيمة العقد بمقدار 2,500.00 ر.س', metric: '-2.5%' });
    expect(ids(ctx({ summary: healthy({ plannedProfit: -2500, plannedProfitMargin: -2.5 }) }))).not.toContain('profit-low');
    expect(find(ctx({ summary: healthy({ plannedProfit: 4000, plannedProfitMargin: 4 }) }), 'profit-low')).toMatchObject({ severity: 'warning', metric: '4.0%' });
    expect(find(ctx({ summary: healthy({ plannedProfit: 5000, plannedProfitMargin: 5 }) }), 'profit-low')).toBeUndefined();
    expect(find(ctx({ summary: healthy({ plannedProfit: 0, plannedProfitMargin: 0 }) }), 'profit-low')).toBeUndefined();
  });

  it('warns on a negative realized profit only once something was collected', () => {
    expect(find(ctx({ summary: healthy({ collectedRevenue: 30000, realizedProfit: -10000 }) }), 'realized-negative')).toMatchObject({ severity: 'warning', targetTab: 'revenue' });
    expect(find(ctx({ summary: healthy({ collectedRevenue: 0, realizedProfit: -40000 }) }), 'realized-negative')).toBeUndefined();
  });
});

describe('the burn rate', () => {
  it('warns when the remaining budget runs out well before the remaining months', () => {
    // 40,000 left at 10,000 a month is 4 months; 6 months remain, 70% of which is 4.2 → warn.
    const hot = ctx({ summary: healthy({ burnRate: 10000 }) });
    expect(find(hot, 'burn-high')).toMatchObject({ severity: 'warning', message: 'بهذا المعدل ستنفد الموازنة خلال 4.0 شهر بينما المتبقي 6 شهر', targetTab: 'expenses' });
    // 4.2 months by burn is not under 4.2 → quiet.
    expect(find(ctx({ summary: healthy({ burnRate: 40000 / 4.2 }) }), 'burn-high')).toBeUndefined();
  });

  it('stays quiet in the last month, with no budget left, or before any spend', () => {
    expect(find(ctx({ summary: healthy({ burnRate: 10000 }), currentMonth: 12 }), 'burn-high')).toBeUndefined();
    expect(find(ctx({ summary: healthy({ burnRate: 10000, budgetRemaining: 0 }) }), 'burn-high')).toBeUndefined();
    expect(find(ctx({ summary: healthy({ burnRate: 0 }) }), 'burn-high')).toBeUndefined();
  });
});

describe('earned value alerts', () => {
  it('grades CPI and SPI at 0.85 and 0.95, ignoring a zero index', () => {
    expect(find(ctx({ evm: evm({ cpi: 0.84 }) }), 'cpi-low')).toMatchObject({ severity: 'critical', metric: '0.84', targetTab: 'baseline' });
    expect(find(ctx({ evm: evm({ cpi: 0.85 }) }), 'cpi-warn')).toMatchObject({ severity: 'warning', metric: '0.85' });
    expect(ids(ctx({ evm: evm({ cpi: 0.95 }) }))).toEqual([]);
    expect(find(ctx({ evm: evm({ spi: 0.5 }) }), 'spi-low')).toMatchObject({ severity: 'critical', category: 'schedule', targetTab: 'milestones' });
    expect(find(ctx({ evm: evm({ spi: 0.9 }) }), 'spi-warn')).toMatchObject({ severity: 'warning' });
    expect(ids(ctx({ evm: evm({ cpi: 0, spi: 0 }) }))).toEqual([]);
  });

  it('flags a forecast overrun of at least a tenth of the budget', () => {
    expect(find(ctx({ evm: evm({ vac: -8000, bac: 80000 }) }), 'eac-over')).toMatchObject({ severity: 'critical', message: 'تجاوز متوقع: 8,000.00 ر.س (10.0%)' });
    expect(find(ctx({ evm: evm({ vac: -7999, bac: 80000 }) }), 'eac-over')).toBeUndefined();
    expect(find(ctx({ evm: evm({ vac: -8000, bac: 0 }) }), 'eac-over')).toBeUndefined();
  });
});

describe('the cash flow alert', () => {
  const plan = (deficit: number) => [
    row(1, { actual: 10000, actualRevenue: 0 }),
    row(2, { actual: deficit - 10000, actualRevenue: 0, cumulativeActual: deficit }),
    row(3, { actual: 50000, actualRevenue: 0 }), // beyond the current month, must not count
  ];

  it('warns once the cumulative shortfall to date passes a tenth of the plan', () => {
    expect(find(ctx({ monthlyPlan: plan(8001), currentMonth: 2 }), 'cashflow-neg')).toMatchObject({ severity: 'warning', message: 'المصروفات المتراكمة تتجاوز التحصيلات بمقدار 8,001.00 ر.س', targetTab: 'revenue' });
    expect(find(ctx({ monthlyPlan: plan(8000), currentMonth: 2 }), 'cashflow-neg')).toBeUndefined();
  });

  it('stays quiet without a row for the current month or before any spend in it', () => {
    expect(find(ctx({ monthlyPlan: plan(50000), currentMonth: 4 }), 'cashflow-neg')).toBeUndefined();
    expect(find(ctx({ monthlyPlan: [row(2, { actual: 50000, cumulativeActual: 0 })], currentMonth: 2 }), 'cashflow-neg')).toBeUndefined();
  });
});

describe('pending items', () => {
  it('lists pending change orders as info and open high risks as a warning, in that order at the end', () => {
    const alerts = generateSmartAlerts(ctx({ pendingChangeOrders: 2, openHighRisks: 3, summary: healthy({ spendRate: 75 }) }));
    expect(alerts.map((a) => a.id)).toEqual(['budget-info', 'co-pending', 'risks-high']);
    expect(alerts[1]).toMatchObject({ severity: 'info', title: '2 أمر تغيير بانتظار الاعتماد', targetTab: 'changeorders' });
    expect(alerts[2]).toMatchObject({ severity: 'warning', title: '3 مخاطر مرتفعة الأثر مفتوحة', targetTab: 'risks' });
  });
});

describe('the cash flow forecast', () => {
  const budget: BudgetItem[] = [one<BudgetItem>({ id: 'b1', projectId: 'p', category: 'salary', plannedAmount: 1000, costType: 'recurring', startMonth: 1, endMonth: 3 })];
  const expenses: Expense[] = [one<Expense>({ id: 'e1', projectId: 'p', amount: 1500, month: 1, approvalStatus: 'approved' })];
  const revenues: Revenue[] = [
    one<Revenue>({ id: 'r1', projectId: 'p', amount: 2000, month: 2, status: 'collected' }),
    one<Revenue>({ id: 'r2', projectId: 'p', amount: 3000, month: 3, status: 'invoiced' }),
    one<Revenue>({ id: 'r3', projectId: 'p', amount: 9999, month: 4, status: 'collected' }), // outside the duration
  ];

  it('nets revenue against spend per month and accumulates, counting every revenue as planned and only collected as actual', () => {
    const rows = getCashFlowForecast(budget, expenses, revenues, 3);
    expect(rows).toEqual([
      { month: 1, plannedExpenses: 1000, actualExpenses: 1500, plannedRevenue: 0, actualRevenue: 0, netPlanned: -1000, netActual: -1500, cumulativePlanned: -1000, cumulativeActual: -1500 },
      { month: 2, plannedExpenses: 1000, actualExpenses: 0, plannedRevenue: 2000, actualRevenue: 2000, netPlanned: 1000, netActual: 2000, cumulativePlanned: 0, cumulativeActual: 500 },
      { month: 3, plannedExpenses: 1000, actualExpenses: 0, plannedRevenue: 3000, actualRevenue: 0, netPlanned: 2000, netActual: 0, cumulativePlanned: 2000, cumulativeActual: 500 },
    ]);
  });

  it('answers an empty forecast for a zero duration', () => {
    expect(getCashFlowForecast(budget, expenses, revenues, 0)).toEqual([]);
  });
});
