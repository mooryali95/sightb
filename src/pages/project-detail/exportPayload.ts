import type { ProjectDetailData } from '@/hooks/useProjectDetailData';

type LoadedData = Extract<ProjectDetailData, { project: object }>;

/** The figures both exports share, from the project's own rows. */
export function buildExportPayload(d: LoadedData) {
  return {
    projectName: d.project.name,
    contractValue: d.summary.effectiveContractValue,
    budgetItems: d.pBudget.map((b) => ({ ...b, actual: d.getActualForItem(b) })),
    expenses: d.pExpenses,
    revenues: d.pRevenues,
    changeOrders: d.pChangeOrders,
    totalPlanned: d.summary.totalPlanned,
    totalActual: d.summary.totalActual,
    totalRevenue: d.totalAllRevenue,
    durationMonths: d.project.durationMonths,
  };
}

/** The Excel export adds the VAT figures. */
export function buildExcelPayload(d: LoadedData) {
  return {
    ...buildExportPayload(d),
    vatRate: d.project.taxPercent,
    contractValueInclVAT: d.summary.contractValueInclVAT,
    totalVATOnExpenses: d.summary.totalVATOnExpenses,
    totalVATOnRevenues: d.summary.totalVATOnRevenues,
    netVATPayable: d.summary.netVATPayable,
  };
}

/** The PDF export adds the planned profit. */
export function buildPdfPayload(d: LoadedData) {
  return { ...buildExportPayload(d), plannedProfit: d.summary.plannedProfit };
}
