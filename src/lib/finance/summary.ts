import { BudgetItem, Expense, Revenue, ProjectSummary, Project, ChangeOrder } from '@/types/project';
import { getEffectiveContractValue, getCurrentMonth } from './contract';
import { getTotalPlanned } from './budget';
import { addVAT, calcVAT } from './vat';

export function getProjectSummary(
  project: Project,
  budgetItems: BudgetItem[],
  expenses: Expense[],
  revenues: Revenue[],
  changeOrders: ChangeOrder[] = [],
): ProjectSummary {
  const totalPlanned = getTotalPlanned(budgetItems);
  // استبعاد المرفوضات + السلف غير المسوّاة (Outstanding Advances) من AC
  const totalActual = expenses
    .filter(e => (e as any).approvalStatus !== 'rejected' && !(e as any).isOutstandingAdvance)
    .reduce((sum, e) => sum + e.amount, 0);

  const effectiveContractValue = getEffectiveContractValue(project.contractValue, changeOrders);
  const contractRemaining = effectiveContractValue - totalActual;
  const budgetRemaining = totalPlanned - totalActual;
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
  const vatInclusive = (project as any).vatInclusive === true;
  const contractValueInclVAT = vatRate > 0 && !vatInclusive
    ? addVAT(effectiveContractValue, vatRate)
    : effectiveContractValue;

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
