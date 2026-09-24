/**
 * Unit tests for the portfolio and company roll-ups. These are the figures
 * the dashboard and the company page print for a whole book of projects,
 * so what is pinned is which projects and risks are counted, how the
 * weighted figures are weighted, and where the health thresholds sit.
 * Fixtures carry only the fields under test.
 */
import { describe, it, expect } from 'vitest';
import type { BudgetItem, ChangeOrder, Company, Expense, IndirectCost, Portfolio, Project, Revenue, Risk } from '@/types/project';
import { getCompanySummary, getHealthScore, getPortfolioSummary, getStandaloneProjectsSummary } from '../portfolio';

const one = <T,>(row: Partial<T>): T => row as T;

const portfolio = one<Portfolio>({ id: 'pf1', companyId: 'c1', name: 'محفظة أ', targetRevenue: 100000, targetMargin: 20 });
const project = (over: Partial<Project>): Project => one<Project>({
  companyId: 'c1', portfolioId: 'pf1', currency: 'SAR', status: 'active', percentComplete: 0, contractValue: 0,
  durationMonths: 12, startDate: '', managementReserve: 0, taxPercent: 0, vatInclusive: false, ...over,
});
const budget = (projectId: string, plannedAmount: number): BudgetItem => one<BudgetItem>({ id: `b-${projectId}-${plannedAmount}`, projectId, category: 'salary', plannedAmount, costType: 'fixed' });
const expense = (projectId: string, amount: number, over: Partial<Expense> = {}): Expense => one<Expense>({ id: `e-${projectId}-${amount}`, projectId, amount, approvalStatus: 'approved', month: 1, ...over });
const revenue = (projectId: string, amount: number, status: Revenue['status']): Revenue => one<Revenue>({ id: `r-${projectId}-${amount}`, projectId, amount, status, month: 1 });
const risk = (over: Partial<Risk>): Risk => one<Risk>({ id: 'k', status: 'open', financialImpact: 0, ...over });

// Two projects in the portfolio, one elsewhere. A: 100k contract, 80k planned, 40k spent, half done.
// B: 50k contract with a 10k approved order, 50k planned, 60k spent (over budget), fully done, 5k reserve.
const A = project({ id: 'A', contractValue: 100000, percentComplete: 50 });
const B = project({ id: 'B', contractValue: 50000, percentComplete: 100, managementReserve: 5000 });
const elsewhere = project({ id: 'Z', portfolioId: 'pf2', contractValue: 999999, percentComplete: 100 });
const projects = [A, B, elsewhere];
const budgets = [budget('A', 80000), budget('B', 50000), budget('Z', 1), budget('N', 50000)];
const expenses = [expense('A', 40000), expense('B', 60000), expense('Z', 999999), expense('A', 5000, { approvalStatus: 'rejected' })];
const revenues = [revenue('A', 30000, 'collected'), revenue('B', 20000, 'invoiced'), revenue('Z', 5, 'collected')];
const orders: ChangeOrder[] = [one<ChangeOrder>({ id: 'co', projectId: 'B', amountImpact: 10000, status: 'approved' }), one<ChangeOrder>({ id: 'co2', projectId: 'B', amountImpact: 99999, status: 'proposed' })];

const summarize = (risks: Risk[] = [], ps = projects) => getPortfolioSummary(portfolio, ps, budgets, expenses, revenues, orders, [], risks);

describe('a portfolio summary', () => {
  it('sums only its own projects, with approved orders in the effective value and rejected expenses out', () => {
    const s = summarize();
    expect(s.projectCount).toBe(2);
    expect(s.totalContractValue).toBe(150000);
    expect(s.totalEffectiveValue).toBe(160000);
    expect(s.totalPlanned).toBe(130000);
    expect(s.totalActual).toBe(100000);
    expect(s.totalCollectedRevenue).toBe(30000);
    expect(s.totalInvoicedRevenue).toBe(20000);
  });

  it('derives the margins from the effective value and the collected revenue', () => {
    const s = summarize();
    expect(s.aggregatePlannedProfit).toBe(30000); // 160,000 − 130,000
    expect(s.aggregatePlannedMargin).toBeCloseTo(18.75);
    expect(s.aggregateRealizedProfit).toBe(-70000); // 30,000 − 100,000
    expect(s.aggregateRealizedMargin).toBeCloseTo(-233.33, 2);
    expect(s.revenueAchievement).toBe(30); // 30,000 of the 100,000 target
  });

  it('weights completion by effective contract value', () => {
    // (50 × 100,000 + 100 × 60,000) / 160,000
    expect(summarize().weightedPercentComplete).toBeCloseTo(68.75);
  });

  it('approximates CPI from earned value over spend, BAC being the plan, and leaves unspent projects out', () => {
    // A: EV = 0.5 × 80,000 = 40,000 over 40,000 spent → 1.0, weight 100,000
    // B: EV = 1.0 × 50,000 over 60,000 → 0.833, weight 60,000. Its 5,000 reserve
    // sits outside the plan and is not taken away again (decided 24 September).
    expect(summarize().averageCPI).toBeCloseTo((1.0 * 100000 + (50000 / 60000) * 60000) / 160000);
    const unspent = summarize([], [A, project({ id: 'N', contractValue: 50000, percentComplete: 100 })]);
    expect(unspent.averageCPI).toBe(1); // only A counts; N has a plan but no spend
  });

  it('counts a project at risk when it is on hold, cancelled, or over its plan', () => {
    expect(summarize().atRiskProjects).toBe(1); // B is over plan
    const held = summarize([], [project({ ...A, status: 'on-hold' }), project({ ...B, status: 'cancelled' })]);
    expect(held.atRiskProjects).toBe(2);
  });

  it('counts open and mitigating risks raised on the portfolio or on one of its projects', () => {
    const s = summarize([
      risk({ id: 'k1', portfolioId: 'pf1', financialImpact: 1000 }),
      risk({ id: 'k2', projectId: 'B', status: 'mitigating', financialImpact: 2000 }),
      risk({ id: 'k3', projectId: 'A', status: 'closed', financialImpact: 4000 }),
      risk({ id: 'k4', projectId: 'Z', financialImpact: 8000 }),
      risk({ id: 'k5', portfolioId: 'pf2', financialImpact: 16000 }),
    ]);
    expect(s.openRisks).toBe(2);
    expect(s.totalFinancialExposure).toBe(3000);
  });

  it('reports the currency mix so a sum across currencies is never printed as one', () => {
    expect(summarize()).toMatchObject({ currency: 'SAR', isMixedCurrency: false, currencies: ['SAR'] });
    const mixed = summarize([], [A, project({ ...B, currency: 'USD' })]);
    expect(mixed).toMatchObject({ isMixedCurrency: true, currencies: ['SAR', 'USD'] });
  });

  it('answers zeros, not NaN, for an empty portfolio', () => {
    const s = summarize([], []);
    expect(s).toMatchObject({ projectCount: 0, aggregatePlannedMargin: 0, weightedPercentComplete: 0, averageCPI: 0, revenueAchievement: 0 });
    // Recorded, not changed: a zero margin under a positive target reads as a warning even with nothing in the book.
    expect(s.healthStatus).toBe('warning');
  });
});

describe('the health score', () => {
  it('is critical at half the projects at risk, a negative margin, or a CPI under 0.7', () => {
    expect(getHealthScore({ atRiskProjects: 2, aggregatePlannedMargin: 30, targetMargin: 0, projectCount: 4 })).toBe('critical');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: -1, targetMargin: 0, projectCount: 4 })).toBe('critical');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 30, targetMargin: 0, projectCount: 4, averageCPI: 0.69 })).toBe('critical');
  });

  it('is a warning at a quarter at risk, a margin under target, or a CPI under 0.9', () => {
    expect(getHealthScore({ atRiskProjects: 1, aggregatePlannedMargin: 30, targetMargin: 0, projectCount: 4 })).toBe('warning');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 19, targetMargin: 20, projectCount: 4 })).toBe('warning');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 30, targetMargin: 0, projectCount: 4, averageCPI: 0.89 })).toBe('warning');
  });

  it('is healthy otherwise, ignores a zero CPI, and ignores a zero target', () => {
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 5, targetMargin: 0, projectCount: 4, averageCPI: 0 })).toBe('healthy');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 5, targetMargin: 0, projectCount: 0 })).toBe('healthy');
    expect(getHealthScore({ atRiskProjects: 0, aggregatePlannedMargin: 30, targetMargin: 20, projectCount: 4, averageCPI: 0.9 })).toBe('healthy');
  });

  it('is what the portfolio summary reports', () => {
    // one of two projects at risk is half the book → critical, whatever the margin
    expect(summarize().healthStatus).toBe('critical');
    // A alone on a 95,000 contract: nothing at risk, CPI 1, a 15.8% margin under the 20% target
    expect(summarize([], [project({ ...A, contractValue: 95000 })]).healthStatus).toBe('warning');
  });
});

describe('the standalone projects summary', () => {
  it('gathers a company\'s projects with no portfolio under one synthetic portfolio and ignores portfolio-level risks', () => {
    const solo = project({ id: 'S', portfolioId: undefined, contractValue: 20000, percentComplete: 10 });
    const otherCompany = project({ id: 'O', companyId: 'c2', portfolioId: undefined, contractValue: 70000 });
    const s = getStandaloneProjectsSummary('c1', [A, solo, otherCompany], [budget('S', 15000)], [expense('S', 3000)], [], [], [
      risk({ id: 'k1', projectId: 'S', financialImpact: 500 }),
      risk({ id: 'k2', portfolioId: 'pf1', financialImpact: 999 }),
    ]);
    expect(s.portfolioId).toBe('__standalone__');
    expect(s.portfolioName).toBe('مشاريع مستقلة');
    expect(s.projectCount).toBe(1);
    expect(s.totalContractValue).toBe(20000);
    expect(s.totalPlanned).toBe(15000);
    expect(s.totalActual).toBe(3000);
    expect(s.openRisks).toBe(1);
    expect(s.totalFinancialExposure).toBe(500);
    expect(s.revenueAchievement).toBe(0);
  });
});

describe('a company summary', () => {
  const company = one<Company>({ id: 'c1', name: 'الشركة' });
  const solo = project({ id: 'S', portfolioId: undefined, contractValue: 20000, percentComplete: 10 });
  const indirect = [
    one<IndirectCost>({ id: 'i1', companyId: 'c1', amount: 7000 }),
    one<IndirectCost>({ id: 'i2', companyId: 'c2', amount: 99999 }),
  ];
  const s = getCompanySummary(company, [portfolio, one<Portfolio>({ id: 'pf2', companyId: 'c2', name: 'غيرها', targetRevenue: 0, targetMargin: 0 })],
    [...projects, solo], [...budgets, budget('S', 15000)], [...expenses, expense('S', 3000)], revenues, orders, [], [], indirect);

  it('rolls up its own portfolios plus the standalone projects, and its own indirect costs only', () => {
    expect(s.portfolioSummaries.map((p) => p.portfolioId)).toEqual(['pf1']);
    expect(s.standaloneProjectsSummary.projectCount).toBe(1);
    expect(s.totalContractValue).toBe(180000); // 160,000 effective + 20,000 standalone
    expect(s.totalActual).toBe(103000);
    expect(s.totalPlannedProfit).toBe(35000); // 30,000 + 5,000
    expect(s.totalIndirectCosts).toBe(7000);
    expect(s.netProfitAfterIndirect).toBe(28000);
    expect(s.netProfitMargin).toBeCloseTo(15.56, 2);
    expect(s.totalAtRiskProjects).toBe(1);
  });

  it('scores health on the net margin with no target and the at-risk share across every project', () => {
    expect(s.healthStatus).toBe('warning'); // 1 of 3 at risk
    const heavy = getCompanySummary(company, [portfolio], projects, budgets, expenses, revenues, orders, [], [],
      [one<IndirectCost>({ id: 'i3', companyId: 'c1', amount: 40000 })]);
    expect(heavy.netProfitAfterIndirect).toBe(-10000);
    expect(heavy.healthStatus).toBe('critical');
  });
});
