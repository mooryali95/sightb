/**
 * The payload both company exports (Excel and PDF) receive. One builder so
 * the two reports cannot describe the company differently.
 */
import type { CompanyExportData } from '@/lib/export-lazy';
import type { CompanySummary, IndirectCost } from '@/types/project';
import { HEALTH_STATUS_LABELS, INDIRECT_COST_CATEGORY_LABELS } from '@/types/project';

export function buildCompanyExport(companyName: string, summary: CompanySummary, indirectCosts: IndirectCost[]): CompanyExportData {
  return {
    companyName,
    summary,
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
