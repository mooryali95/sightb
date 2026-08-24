/**
 * export-lazy
 * ---------------------------------------------------------------
 * The spreadsheet writer and `jspdf` are only needed the
 * moment a user clicks "export". These thin async wrappers keep the
 * heavy libraries out of every page chunk — they load on first use.
 *
 * Import from here in components; never from `@/lib/export` directly.
 */

import type {
  ExportBudgetData,
  PortfolioExportData,
  CompanyExportData,
  OutstandingAdvanceRow,
  SettlementEventRow,
} from './export';

const load = () => import('./export');

export type {
  ExportBudgetData,
  PortfolioExportData,
  CompanyExportData,
  OutstandingAdvanceRow,
  SettlementEventRow,
};

export async function exportToExcel(data: ExportBudgetData) {
  return (await load()).exportToExcel(data);
}

export async function exportToPDF(data: ExportBudgetData) {
  return (await load()).exportToPDF(data);
}

export async function exportPortfolioToExcel(data: PortfolioExportData) {
  return (await load()).exportPortfolioToExcel(data);
}

export async function exportPortfolioToPDF(data: PortfolioExportData) {
  return (await load()).exportPortfolioToPDF(data);
}

export async function exportCompanyToExcel(data: CompanyExportData) {
  return (await load()).exportCompanyToExcel(data);
}

export async function exportCompanyToPDF(data: CompanyExportData) {
  return (await load()).exportCompanyToPDF(data);
}

export async function exportOutstandingAdvancesExcel(rows: OutstandingAdvanceRow[], projectName: string) {
  return (await load()).exportOutstandingAdvancesExcel(rows, projectName);
}

export async function exportOutstandingAdvancesPDF(
  rows: OutstandingAdvanceRow[],
  projectName: string,
  currency?: string
) {
  return (await load()).exportOutstandingAdvancesPDF(rows, projectName, currency);
}

export async function exportSettlementEventsExcel(rows: SettlementEventRow[], projectName: string) {
  return (await load()).exportSettlementEventsExcel(rows, projectName);
}

export async function exportSettlementEventsPDF(
  rows: SettlementEventRow[],
  projectName: string,
  currency?: string
) {
  return (await load()).exportSettlementEventsPDF(rows, projectName, currency);
}

export async function exportSsotReportPDF(
  data: import('./ssot-report').SsotReportInput & { currency?: string },
) {
  return (await load()).exportSsotReportPDF(data);
}
