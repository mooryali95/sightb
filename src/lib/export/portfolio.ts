/**
 * The portfolio report, as an Excel workbook and as a PDF.
 */
import { bookNew, appendSheet, writeWorkbook } from '../xlsx-writer';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency } from '../finance';
import { PDF_COLORS, addPdfFooter, addCoverPage, addSectionTitle } from './pdf-helpers';

// ======== Portfolio Export ========
export interface PortfolioExportData {
  portfolioName: string;
  summary: {
    totalContractValue: number;
    totalEffectiveValue: number;
    totalPlanned: number;
    totalActual: number;
    totalCollectedRevenue: number;
    aggregatePlannedProfit: number;
    aggregatePlannedMargin: number;
    weightedPercentComplete: number;
    averageCPI: number;
    atRiskProjects: number;
    openRisks: number;
    totalFinancialExposure: number;
    revenueAchievement: number;
    healthStatus: string;
    projectCount: number;
  };
  projectSummaries: { name: string; contractValue: number; planned: number; actual: number; plannedProfit: number; percentComplete: number; health: string }[];
  risks: { title: string; project: string; probability: string; impact: string; financialImpact: number; status: string }[];
}

export async function exportPortfolioToExcel(data: PortfolioExportData) {
  const wb = bookNew();

  // Summary sheet
  const summaryRows = [
    { 'البند': 'اسم المحفظة', 'القيمة': data.portfolioName },
    { 'البند': 'عدد المشاريع', 'القيمة': data.summary.projectCount },
    { 'البند': 'إجمالي العقود', 'القيمة': data.summary.totalEffectiveValue },
    { 'البند': 'إجمالي المخطط', 'القيمة': data.summary.totalPlanned },
    { 'البند': 'إجمالي المصروفات', 'القيمة': data.summary.totalActual },
    { 'البند': 'الربح المخطط', 'القيمة': data.summary.aggregatePlannedProfit },
    { 'البند': 'هامش الربح %', 'القيمة': data.summary.aggregatePlannedMargin.toFixed(1) },
    { 'البند': 'الإنجاز المرجّح %', 'القيمة': data.summary.weightedPercentComplete.toFixed(1) },
    { 'البند': 'متوسط CPI', 'القيمة': data.summary.averageCPI.toFixed(2) },
    { 'البند': 'مشاريع متعثرة', 'القيمة': data.summary.atRiskProjects },
    { 'البند': 'مخاطر مفتوحة', 'القيمة': data.summary.openRisks },
    { 'البند': 'التعرض المالي', 'القيمة': data.summary.totalFinancialExposure },
  ];
  appendSheet(wb, summaryRows, 'الملخص');

  // Projects comparison
  const projectRows = data.projectSummaries.map(p => ({
    'المشروع': p.name,
    'قيمة العقد': p.contractValue,
    'المخطط': p.planned,
    'المصروف': p.actual,
    'الربح المخطط': p.plannedProfit,
    'الإنجاز %': p.percentComplete,
    'الصحة': p.health,
  }));
  appendSheet(wb, projectRows, 'مقارنة المشاريع');

  // Risks
  if (data.risks.length > 0) {
    const riskRows = data.risks.map(r => ({
      'العنوان': r.title,
      'المشروع': r.project,
      'الاحتمال': r.probability,
      'الأثر': r.impact,
      'الأثر المالي': r.financialImpact,
      'الحالة': r.status,
    }));
    appendSheet(wb, riskRows, 'المخاطر');
  }

  await writeWorkbook(wb, `${data.portfolioName}_تقرير_محفظة.xlsx`);
}

// ======== Portfolio PDF Export ========
export function exportPortfolioToPDF(data: PortfolioExportData) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });

  addCoverPage(doc, data.portfolioName, 'Portfolio Report');

  // Executive Summary
  doc.addPage();
  let y = addSectionTitle(doc, 'Portfolio Summary', 20);

  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Projects', String(data.summary.projectCount)],
      ['Total Contract Value', formatCurrency(data.summary.totalEffectiveValue)],
      ['Total Planned', formatCurrency(data.summary.totalPlanned)],
      ['Total Expenses', formatCurrency(data.summary.totalActual)],
      ['Planned Profit', formatCurrency(data.summary.aggregatePlannedProfit)],
      ['Planned Margin', `${data.summary.aggregatePlannedMargin.toFixed(1)}%`],
      ['Weighted Completion', `${data.summary.weightedPercentComplete.toFixed(1)}%`],
      ['Average CPI', data.summary.averageCPI.toFixed(2)],
      ['At-Risk Projects', String(data.summary.atRiskProjects)],
      ['Open Risks', String(data.summary.openRisks)],
      ['Financial Exposure', formatCurrency(data.summary.totalFinancialExposure)],
      ['Revenue Achievement', `${data.summary.revenueAchievement.toFixed(1)}%`],
      ['Health Status', data.summary.healthStatus],
    ],
    theme: 'striped',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
  });

  // Projects comparison
  doc.addPage();
  y = addSectionTitle(doc, 'Projects Comparison', 20);

  doc.autoTable({
    startY: y,
    head: [['Project', 'Contract Value', 'Planned', 'Actual', 'Planned Profit', 'Completion %', 'Health']],
    body: data.projectSummaries.map(p => [
      p.name, formatCurrency(p.contractValue), formatCurrency(p.planned),
      formatCurrency(p.actual), formatCurrency(p.plannedProfit),
      `${p.percentComplete}%`, p.health,
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  // Risks
  if (data.risks.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Risks', 20);

    doc.autoTable({
      startY: y,
      head: [['Title', 'Project', 'Probability', 'Impact', 'Financial Impact', 'Status']],
      body: data.risks.map(r => [
        r.title, r.project, r.probability, r.impact,
        formatCurrency(r.financialImpact), r.status,
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  addPdfFooter(doc);
  doc.save(`${data.portfolioName}_Portfolio_Report.pdf`);
}
