/**
 * The payload both company exports (Excel and PDF) receive. One builder so
 * the two reports cannot describe the company differently.
 */
import type { CompanyExportData } from '@/lib/export-lazy';
import type { CompanySummary, IndirectCost } from '@/types/project';
import { HEALTH_STATUS_LABELS, INDIRECT_COST_CATEGORY_LABELS } from '@/types/project';
import { COMPANY_EXPENSE_KIND_LABELS, splitOf, type CompanyExpense, type ExpenseAllocation } from '@/lib/finance/company-ledger';
import type { CompanyNet } from '@/lib/finance/company-net';

export function buildCompanyExport(
  companyName: string, summary: CompanySummary, indirectCosts: IndirectCost[],
  /** The ledger, when loaded: its expenses come off the net exactly as on the page. */
  ledger?: { net: CompanyNet; expenses: CompanyExpense[]; allocations: ExpenseAllocation[] },
): CompanyExportData {
  return {
    companyName,
    summary: ledger
      ? { ...summary, netProfitAfterIndirect: ledger.net.net, netProfitMargin: ledger.net.margin, companyExpenses: ledger.net.companyExpenses }
      : { ...summary, companyExpenses: 0 },
    companyExpenses: (ledger?.expenses ?? []).map((e) => ({
      date: e.date, kind: COMPANY_EXPENSE_KIND_LABELS[e.kind], description: e.description, amount: e.amount,
      allocated: splitOf(e, ledger!.allocations).allocated,
    })),
    portfolioSummaries: (summary.portfolioSummaries || []).map(ps => ({
      name: ps.portfolioName,
      projects: ps.projectCount,
      contractValue: ps.totalEffectiveValue,
      actual: ps.totalActual,
      profit: ps.aggregatePlannedProfit,
      completion: ps.weightedPercentComplete,
      health: HEALTH_STATUS_LABELS[ps.healthStatus],
    })),
    indirectCosts: indirectCosts.map(ic => ({
      category: INDIRECT_COST_CATEGORY_LABELS[ic.category],
      description: ic.description,
      amount: ic.amount,
      month: ic.month,
    })),
  };
}
