/**
 * The payload both portfolio exports (Excel and PDF) receive. One builder so
 * the two reports cannot describe the portfolio differently.
 */
import type { PortfolioExportData } from '@/lib/export-lazy';
import {
  HEALTH_STATUS_LABELS, RISK_PROBABILITY_LABELS, RISK_STATUS_LABELS,
  type Portfolio, type PortfolioSummary, type Project, type Risk,
} from '@/types/project';
import type { RankedProject } from './portfolioFigures';

export function buildPortfolioExport(
  portfolio: Portfolio, summary: PortfolioSummary, ranked: RankedProject[], risks: Risk[], allProjects: Project[],
): PortfolioExportData {
  return {
    portfolioName: portfolio.name,
    summary: { ...summary },
    projectSummaries: ranked.map(ps => ({
      name: ps.project.name,
      contractValue: ps.summary.effectiveContractValue,
      planned: ps.summary.totalPlanned,
      actual: ps.summary.totalActual,
      plannedProfit: ps.summary.plannedProfit,
      percentComplete: ps.project.percentComplete,
      health: HEALTH_STATUS_LABELS[ps.health],
    })),
    risks: risks.map(r => ({
      title: r.title,
      project: (r.projectId ? allProjects.find(p => p.id === r.projectId)?.name : portfolio.name) || '-',
      probability: RISK_PROBABILITY_LABELS[r.probability],
      impact: r.impact,
      financialImpact: r.financialImpact,
      status: RISK_STATUS_LABELS[r.status],
    })),
  };
}
