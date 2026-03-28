import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  ChangeOrder, Milestone, Risk, IndirectCost,
  PortfolioSummary, CompanySummary, HealthStatus, ProjectSummary,
} from '@/types/project';
import { getProjectSummary, calculateEVM, getCurrentMonth } from './finance';

/**
 * Get a summary of a portfolio by aggregating its project summaries
 */
export function getPortfolioSummary(
  portfolio: Portfolio,
  allProjects: Project[],
  allBudgetItems: BudgetItem[],
  allExpenses: Expense[],
  allRevenues: Revenue[],
  allChangeOrders: ChangeOrder[],
  allMilestones: Milestone[],
  allRisks: Risk[],
): PortfolioSummary {
  const projects = allProjects.filter(p => p.portfolioId === portfolio.id);
  const projectIds = new Set(projects.map(p => p.id));

  let totalContractValue = 0;
  let totalEffectiveValue = 0;
  let totalPlanned = 0;
  let totalActual = 0;
  let totalCollectedRevenue = 0;
  let totalInvoicedRevenue = 0;
  let aggregatePlannedProfit = 0;
  let aggregateRealizedProfit = 0;
  let weightedCompleteNum = 0;
  let weightedCPINum = 0;
  let totalWeight = 0;
  let cpiWeight = 0;
  let atRiskProjects = 0;

  projects.forEach(project => {
    const pBudget = allBudgetItems.filter(b => b.projectId === project.id);
    const pExpenses = allExpenses.filter(e => e.projectId === project.id);
    const pRevenues = allRevenues.filter(r => r.projectId === project.id);
    const pCO = allChangeOrders.filter(co => co.projectId === project.id);

    const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pCO);

    totalContractValue += summary.contractValue;
    totalEffectiveValue += summary.effectiveContractValue;
    totalPlanned += summary.totalPlanned;
    totalActual += summary.totalActual;
    totalCollectedRevenue += summary.collectedRevenue;
    totalInvoicedRevenue += summary.invoicedRevenue;
    aggregatePlannedProfit += summary.plannedProfit;
    aggregateRealizedProfit += summary.realizedProfit;

    const w = summary.effectiveContractValue;
    weightedCompleteNum += project.percentComplete * w;
    totalWeight += w;

    // Only projects with actual spending contribute to CPI average
    if (summary.totalActual > 0 && summary.totalPlanned > 0) {
      const approxCPI = (project.percentComplete / 100 * summary.totalPlanned) / summary.totalActual;
      weightedCPINum += approxCPI * w;
      cpiWeight += w;
    }
    // Projects without expenses are excluded from CPI calculation

    // At risk: on-hold, cancelled, or spendRate > 100%
    if (project.status === 'on-hold' || project.status === 'cancelled' || summary.spendRate > 100) {
      atRiskProjects++;
    }
  });

  const risks = allRisks.filter(r =>
    r.portfolioId === portfolio.id || (r.projectId && projectIds.has(r.projectId))
  );
  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating').length;
  const totalFinancialExposure = risks
    .filter(r => r.status === 'open' || r.status === 'mitigating')
    .reduce((s, r) => s + r.financialImpact, 0);

  const aggregatePlannedMargin = totalEffectiveValue > 0 ? (aggregatePlannedProfit / totalEffectiveValue) * 100 : 0;
  const aggregateRealizedMargin = totalCollectedRevenue > 0 ? (aggregateRealizedProfit / totalCollectedRevenue) * 100 : 0;
  const weightedPercentComplete = totalWeight > 0 ? weightedCompleteNum / totalWeight : 0;
  const averageCPI = cpiWeight > 0 ? weightedCPINum / cpiWeight : 0;
  const revenueAchievement = portfolio.targetRevenue > 0 ? (totalCollectedRevenue / portfolio.targetRevenue) * 100 : 0;

  const healthStatus = getHealthScore({
    atRiskProjects,
    aggregatePlannedMargin,
    targetMargin: portfolio.targetMargin,
    projectCount: projects.length,
    averageCPI,
  });

  return {
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    projectCount: projects.length,
    totalContractValue,
    totalEffectiveValue,
    totalPlanned,
    totalActual,
    totalCollectedRevenue,
    totalInvoicedRevenue,
    aggregatePlannedProfit,
    aggregatePlannedMargin,
    aggregateRealizedProfit,
    aggregateRealizedMargin,
    weightedPercentComplete,
    averageCPI,
    atRiskProjects,
    openRisks,
    totalFinancialExposure,
    revenueAchievement,
    healthStatus,
  };
}

/**
 * Build summary for standalone projects (no portfolio)
 */
export function getStandaloneProjectsSummary(
  companyId: string,
  allProjects: Project[],
  allBudgetItems: BudgetItem[],
  allExpenses: Expense[],
  allRevenues: Revenue[],
  allChangeOrders: ChangeOrder[],
  allRisks: Risk[],
): PortfolioSummary {
  const fakePortfolio: Portfolio = {
    id: '__standalone__',
    companyId,
    name: 'مشاريع مستقلة',
    targetRevenue: 0,
    targetMargin: 0,
    createdAt: '',
  };
  const standaloneProjects = allProjects.filter(p => p.companyId === companyId && !p.portfolioId);

  return getPortfolioSummary(
    fakePortfolio,
    standaloneProjects.map(p => ({ ...p, portfolioId: '__standalone__' })),
    allBudgetItems, allExpenses, allRevenues, allChangeOrders, [], allRisks,
  );
}

/**
 * Get company-level summary
 */
export function getCompanySummary(
  company: Company,
  portfolios: Portfolio[],
  allProjects: Project[],
  allBudgetItems: BudgetItem[],
  allExpenses: Expense[],
  allRevenues: Revenue[],
  allChangeOrders: ChangeOrder[],
  allMilestones: Milestone[],
  allRisks: Risk[],
  indirectCosts: IndirectCost[],
): CompanySummary {
  const compPortfolios = portfolios.filter(p => p.companyId === company.id);

  const portfolioSummaries = compPortfolios.map(p =>
    getPortfolioSummary(p, allProjects, allBudgetItems, allExpenses, allRevenues, allChangeOrders, allMilestones, allRisks)
  );

  const standaloneProjectsSummary = getStandaloneProjectsSummary(
    company.id, allProjects, allBudgetItems, allExpenses, allRevenues, allChangeOrders, allRisks,
  );

  const allSummaries = [...portfolioSummaries, standaloneProjectsSummary];
  const totalContractValue = allSummaries.reduce((s, ps) => s + ps.totalEffectiveValue, 0);
  const totalActual = allSummaries.reduce((s, ps) => s + ps.totalActual, 0);
  const totalPlannedProfit = allSummaries.reduce((s, ps) => s + ps.aggregatePlannedProfit, 0);
  const totalAtRiskProjects = allSummaries.reduce((s, ps) => s + ps.atRiskProjects, 0);

  const compIndirectCosts = indirectCosts.filter(ic => ic.companyId === company.id);
  const totalIndirectCosts = compIndirectCosts.reduce((s, ic) => s + ic.amount, 0);
  const netProfitAfterIndirect = totalPlannedProfit - totalIndirectCosts;
  const netProfitMargin = totalContractValue > 0 ? (netProfitAfterIndirect / totalContractValue) * 100 : 0;

  const healthStatus = getHealthScore({
    atRiskProjects: totalAtRiskProjects,
    aggregatePlannedMargin: netProfitMargin,
    targetMargin: 0,
    projectCount: allSummaries.reduce((s, ps) => s + ps.projectCount, 0),
    averageCPI: undefined,
  });

  return {
    companyId: company.id,
    companyName: company.name,
    portfolioSummaries,
    standaloneProjectsSummary,
    totalContractValue,
    totalActual,
    totalPlannedProfit,
    totalIndirectCosts,
    netProfitAfterIndirect,
    netProfitMargin,
    totalAtRiskProjects,
    healthStatus,
  };
}

/**
 * Determine health score based on risk metrics
 */
export function getHealthScore(params: {
  atRiskProjects: number;
  aggregatePlannedMargin: number;
  targetMargin: number;
  projectCount: number;
  averageCPI?: number;
}): HealthStatus {
  const { atRiskProjects, aggregatePlannedMargin, targetMargin, projectCount, averageCPI } = params;

  const riskRatio = projectCount > 0 ? atRiskProjects / projectCount : 0;

  // Critical: 50%+ at risk, negative margin, or very low CPI
  if (
    riskRatio >= 0.5 ||
    aggregatePlannedMargin < 0 ||
    (averageCPI !== undefined && averageCPI > 0 && averageCPI < 0.7)
  ) return 'critical';

  // Warning: 25%+ at risk, margin below target, or low CPI
  if (
    riskRatio >= 0.25 ||
    (targetMargin > 0 && aggregatePlannedMargin < targetMargin) ||
    (averageCPI !== undefined && averageCPI > 0 && averageCPI < 0.9)
  ) return 'warning';

  return 'healthy';
}
