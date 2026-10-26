/**
 * The company report, as an Excel workbook and as a PDF.
 */
import { bookNew, appendSheet, writeWorkbook } from '../xlsx-writer';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency } from '../finance';
import { PDF_COLORS, addPdfFooter, addCoverPage, addSectionTitle } from './pdf-helpers';

// ======== Company Export ========
export interface CompanyExportData {
  companyName: string;
  summary: {
    totalContractValue: number;
    totalActual: number;
    totalPlannedProfit: number;
    totalIndirectCosts: number;
    netProfitAfterIndirect: number;
    netProfitMargin: number;
    totalAtRiskProjects: number;
    /** The company's own spend (salaries, rent, fees…), already taken off the net. */
    companyExpenses: number;
  };
  companyExpenses: { date: string; kind: string; description: string; amount: number; allocated: number }[];
  portfolioSummaries: { name: string; projects: number; contractValue: number; actual: number; profit: number; completion: number; health: string }[];
  indirectCosts: { category: string; description: string; amount: number; month: number }[];
}

export async function exportCompanyToExcel(data: CompanyExportData) {
  const wb = bookNew();

  // Summary
  const summaryRows = [
    { 'البند': 'اسم الشركة', 'القيمة': data.companyName },
    { 'البند': 'إجمالي العقود', 'القيمة': data.summary.totalContractValue },
    { 'البند': 'إجمالي المصروفات', 'القيمة': data.summary.totalActual },
    { 'البند': 'الربح المخطط', 'القيمة': data.summary.totalPlannedProfit },
    { 'البند': 'تكاليف غير مباشرة', 'القيمة': data.summary.totalIndirectCosts },
    { 'البند': 'مصاريف المنظومة', 'القيمة': data.summary.companyExpenses },
    { 'البند': 'صافي ربح الشركة', 'القيمة': data.summary.netProfitAfterIndirect },
    { 'البند': 'هامش صافي الربح %', 'القيمة': data.summary.netProfitMargin.toFixed(1) },
    { 'البند': 'مشاريع متعثرة', 'القيمة': data.summary.totalAtRiskProjects },
  ];
  appendSheet(wb, summaryRows, 'الملخص');

  // Portfolios
  if (data.portfolioSummaries.length > 0) {
    const pRows = data.portfolioSummaries.map(p => ({
      'المحفظة': p.name,
      'المشاريع': p.projects,
      'العقود': p.contractValue,
      'المصروفات': p.actual,
      'الربح': p.profit,
      'الإنجاز %': p.completion,
      'الصحة': p.health,
    }));
    appendSheet(wb, pRows, 'أداء المحافظ');
  }

  // Indirect costs
  if (data.indirectCosts.length > 0) {
    const icRows = data.indirectCosts.map(ic => ({
      'الفئة': ic.category,
      'الوصف': ic.description,
      'المبلغ': ic.amount,
      'الشهر': `شهر ${ic.month}`,
    }));
    appendSheet(wb, icRows, 'تكاليف غير مباشرة');
  }

  if (data.companyExpenses.length > 0) {
    appendSheet(wb, data.companyExpenses.map((e) => ({
      'التاريخ': e.date, 'النوع': e.kind, 'الوصف': e.description, 'المبلغ': e.amount,
      'محمَّل على المشاريع': e.allocated, 'باقٍ على المنظومة': Math.round((e.amount - e.allocated) * 100) / 100,
    })), 'مصاريف المنظومة');
  }

  await writeWorkbook(wb, `${data.companyName}_تقرير_شركة.xlsx`);
}

// ======== Company PDF Export ========
export function exportCompanyToPDF(data: CompanyExportData) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });

  addCoverPage(doc, data.companyName, 'Company Report');

  // Executive Summary
  doc.addPage();
  let y = addSectionTitle(doc, 'Company Summary', 20);

  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Contract Value', formatCurrency(data.summary.totalContractValue)],
      ['Total Expenses', formatCurrency(data.summary.totalActual)],
      ['Planned Profit', formatCurrency(data.summary.totalPlannedProfit)],
      ['Indirect Costs', formatCurrency(data.summary.totalIndirectCosts)],
      ['Company Expenses', formatCurrency(data.summary.companyExpenses)],
      ['Company Net Profit', formatCurrency(data.summary.netProfitAfterIndirect)],
      ['Net Profit Margin', `${data.summary.netProfitMargin.toFixed(1)}%`],
      ['At-Risk Projects', String(data.summary.totalAtRiskProjects)],
    ],
    theme: 'striped',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
  });

  // Portfolio performance
  if (data.portfolioSummaries.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Portfolio Performance', 20);

    doc.autoTable({
      startY: y,
      head: [['Portfolio', 'Projects', 'Contracts', 'Expenses', 'Profit', 'Completion %', 'Health']],
      body: data.portfolioSummaries.map(p => [
        p.name, String(p.projects), formatCurrency(p.contractValue),
        formatCurrency(p.actual), formatCurrency(p.profit),
        `${p.completion.toFixed(1)}%`, p.health,
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  // Indirect costs
  if (data.indirectCosts.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Indirect Costs', 20);

    doc.autoTable({
      startY: y,
      head: [['Category', 'Description', 'Amount', 'Month']],
      body: data.indirectCosts.map(ic => [
        ic.category, ic.description, formatCurrency(ic.amount), `Month ${ic.month}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  if (data.companyExpenses.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Company Expenses', 20);
    doc.autoTable({
      startY: y,
      head: [['Date', 'Kind', 'Description', 'Amount', 'Charged to projects']],
      body: data.companyExpenses.map((e) => [e.date, e.kind, e.description, formatCurrency(e.amount), formatCurrency(e.allocated)]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  addPdfFooter(doc);
  doc.save(`${data.companyName}_Company_Report.pdf`);
}
