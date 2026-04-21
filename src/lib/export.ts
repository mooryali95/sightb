import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, getCashFlowForecast, addVAT, getMonthlyBudgetPlan } from './finance';
import { EXPENSE_CATEGORY_LABELS, CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, COST_TYPE_LABELS, type ExpenseCategory, type ChangeOrder, type BudgetItem, type Revenue, type CostType } from '@/types/project';

// Extend jsPDF type for autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ExportBudgetData {
  projectName: string;
  contractValue: number;
  budgetItems: { category: string; description: string; plannedAmount: number; month?: number; actual: number; startMonth?: number; endMonth?: number; costType?: string }[];
  expenses: { category: string; description: string; amount: number; month: number; date: string; responsible?: string }[];
  revenues: Revenue[];
  changeOrders?: ChangeOrder[];
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  currency?: string;
  durationMonths?: number;
  plannedProfit?: number;
  vatRate?: number;
  contractValueInclVAT?: number;
  totalVATOnExpenses?: number;
  totalVATOnRevenues?: number;
  netVATPayable?: number;
}

export function exportToExcel(data: ExportBudgetData) {
  const wb = XLSX.utils.book_new();

  // Budget sheet
  const budgetRows = data.budgetItems.map(b => ({
    'الفئة': EXPENSE_CATEGORY_LABELS[b.category as ExpenseCategory] || b.category,
    'الوصف': b.description,
    'المبلغ المخطط': b.plannedAmount,
    'الفعلي': b.actual,
    'المتبقي': b.plannedAmount - b.actual,
    'نسبة الصرف': b.plannedAmount > 0 ? (b.actual / b.plannedAmount) * 100 : 0,
    'الفترة': b.startMonth && b.endMonth ? `${b.startMonth}-${b.endMonth}` : b.month ? `شهر ${b.month}` : 'موزع',
  }));
  budgetRows.push({
    'الفئة': 'الإجمالي',
    'الوصف': '',
    'المبلغ المخطط': data.totalPlanned,
    'الفعلي': data.totalActual,
    'المتبقي': data.totalPlanned - data.totalActual,
    'نسبة الصرف': data.totalPlanned > 0 ? (data.totalActual / data.totalPlanned) * 100 : 0,
    'الفترة': '',
  });
  const wsBudget = XLSX.utils.json_to_sheet(budgetRows);
  XLSX.utils.book_append_sheet(wb, wsBudget, 'الموازنة');

  // Expenses sheet
  const expenseRows = data.expenses.map(e => ({
    'الفئة': EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
    'الوصف': e.description,
    'المبلغ': e.amount,
    'الشهر': `شهر ${e.month}`,
    'التاريخ': e.date,
    'المسؤول': e.responsible || '',
  }));
  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'المصروفات');

  // Revenue sheet
  const revenueRows = data.revenues.map(r => ({
    'الوصف': r.description,
    'المبلغ': r.amount,
    'النوع': r.revenueType || 'milestone',
    'الحالة': r.status || 'collected',
    'الشهر': `شهر ${r.month}`,
    'التاريخ': r.date,
    'رقم الفاتورة': r.invoiceNumber || '',
  }));
  const wsRevenue = XLSX.utils.json_to_sheet(revenueRows);
  XLSX.utils.book_append_sheet(wb, wsRevenue, 'الإيرادات');

  // Change Orders sheet
  if (data.changeOrders && data.changeOrders.length > 0) {
    const coRows = data.changeOrders.map(co => ({
      'الوصف': co.description,
      'النوع': CHANGE_ORDER_TYPE_LABELS[co.changeType] || co.changeType,
      'الأثر المالي': co.amountImpact,
      'أثر المدة (أشهر)': co.durationImpact,
      'الحالة': CHANGE_ORDER_STATUS_LABELS[co.status] || co.status,
      'طلب بواسطة': co.requestedBy || '',
    }));
    const wsCO = XLSX.utils.json_to_sheet(coRows);
    XLSX.utils.book_append_sheet(wb, wsCO, 'أوامر التغيير');
  }

  // Cash Flow sheet
  if (data.durationMonths && data.durationMonths > 0) {
    const cashFlow = getCashFlowForecast(
      data.budgetItems as any,
      data.expenses as any,
      data.revenues as any,
      data.durationMonths
    );
    const cfRows = cashFlow.map(cf => ({
      'الشهر': `شهر ${cf.month}`,
      'مصروفات مخططة': cf.plannedExpenses,
      'مصروفات فعلية': cf.actualExpenses,
      'إيرادات مخططة': cf.plannedRevenue,
      'إيرادات فعلية': cf.actualRevenue,
      'صافي مخطط': cf.netPlanned,
      'صافي فعلي': cf.netActual,
      'تراكمي مخطط': cf.cumulativePlanned,
      'تراكمي فعلي': cf.cumulativeActual,
    }));
    const wsCF = XLSX.utils.json_to_sheet(cfRows);
    XLSX.utils.book_append_sheet(wb, wsCF, 'التدفق النقدي');
  }

  // Summary sheet
  const collectedRevenue = data.revenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const approvedCOImpact = (data.changeOrders || []).filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveContract = data.contractValue + approvedCOImpact;

  const summaryRows = [
    { 'البند': 'قيمة العقد الأصلية', 'المبلغ': data.contractValue },
    { 'البند': 'أوامر التغيير المعتمدة', 'المبلغ': approvedCOImpact },
    { 'البند': 'القيمة المعدّلة للعقد', 'المبلغ': effectiveContract },
    { 'البند': 'إجمالي الموازنة المخططة', 'المبلغ': data.totalPlanned },
    { 'البند': 'الربح المخطط', 'المبلغ': effectiveContract - data.totalPlanned },
    { 'البند': 'إجمالي المصروفات', 'المبلغ': data.totalActual },
    { 'البند': 'الإيرادات المحصّلة', 'المبلغ': collectedRevenue },
    { 'البند': 'المتبقي من الموازنة', 'المبلغ': data.totalPlanned - data.totalActual },
    { 'البند': 'المتبقي من العقد', 'المبلغ': effectiveContract - data.totalActual },
    { 'البند': '─── الضريبة ───', 'المبلغ': '' },
    { 'البند': `ضريبة المخرجات (${data.vatRate || 15}%)`, 'المبلغ': data.totalVATOnRevenues || 0 },
    { 'البند': 'ضريبة المدخلات (قابلة للاسترداد)', 'المبلغ': data.totalVATOnExpenses || 0 },
    { 'البند': 'المستحق لهيئة الزكاة', 'المبلغ': data.netVATPayable || 0 },
    { 'البند': 'قيمة العقد شامل الضريبة', 'المبلغ': data.contractValueInclVAT || addVAT(data.contractValue, data.vatRate || 15) },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

  XLSX.writeFile(wb, `${data.projectName}_تقرير_مالي.xlsx`);
}

// ======== PDF Helpers ========
const PDF_COLORS = {
  primary: [45, 80, 120] as [number, number, number],
  accent: [180, 150, 80] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [46, 125, 50] as [number, number, number],
  danger: [198, 40, 40] as [number, number, number],
};

function addPdfFooter(doc: jsPDF) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.dark);
    doc.text(`${i} / ${pageCount}`, pageW / 2, pageH - 6, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, pageH - 6);
    doc.text('Powered by BASSERH', pageW - 14, pageH - 6, { align: 'right' });
  }
}

function addCoverPage(doc: jsPDF, title: string, subtitle?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Background accent bar
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageW, 80, 'F');

  // Title
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFontSize(28);
  doc.text(title, pageW / 2, 40, { align: 'center' });

  if (subtitle) {
    doc.setFontSize(14);
    doc.text(subtitle, pageW / 2, 55, { align: 'center' });
  }

  // Date
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.dark);
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-GB')}`, pageW / 2, 100, { align: 'center' });

  // Decorative line
  doc.setDrawColor(...PDF_COLORS.accent);
  doc.setLineWidth(1.5);
  doc.line(pageW * 0.3, 110, pageW * 0.7, 110);
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(14, y - 5, pageW - 28, 9, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text(title, pageW / 2, y + 1, { align: 'center' });
  return y + 12;
}

export function exportToPDF(data: ExportBudgetData) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });

  const approvedCOImpact = (data.changeOrders || []).filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveContract = data.contractValue + approvedCOImpact;
  const plannedProfit = data.plannedProfit !== undefined ? data.plannedProfit : effectiveContract - data.totalPlanned;
  const collectedRevenue = data.revenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);

  // Cover page
  addCoverPage(doc, data.projectName, 'Financial Report');

  // Executive Summary page
  doc.addPage();
  let y = addSectionTitle(doc, 'Executive Summary', 20);

  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Original Contract Value', formatCurrency(data.contractValue, data.currency)],
      ['Approved Change Orders', formatCurrency(approvedCOImpact, data.currency)],
      ['Effective Contract Value', formatCurrency(effectiveContract, data.currency)],
      ['Total Budget (Planned)', formatCurrency(data.totalPlanned, data.currency)],
      ['Total Expenses (Actual)', formatCurrency(data.totalActual, data.currency)],
      ['Budget Remaining', formatCurrency(data.totalPlanned - data.totalActual, data.currency)],
      ['Planned Profit', formatCurrency(plannedProfit, data.currency)],
      ['Planned Profit Margin', data.totalPlanned > 0 ? `${((plannedProfit / effectiveContract) * 100).toFixed(1)}%` : 'N/A'],
      ['Collected Revenue', formatCurrency(collectedRevenue, data.currency)],
      ['Budget Utilization', data.totalPlanned > 0 ? `${((data.totalActual / data.totalPlanned) * 100).toFixed(1)}%` : '0%'],
    ],
    theme: 'striped',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: PDF_COLORS.light },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
  });

  // Budget table
  doc.addPage();
  y = addSectionTitle(doc, 'Budget Breakdown', 20);

  doc.autoTable({
    startY: y,
    head: [['Category', 'Description', 'Planned', 'Actual', 'Remaining', 'Spend %']],
    body: data.budgetItems.map(b => [
      EXPENSE_CATEGORY_LABELS[b.category as ExpenseCategory] || b.category,
      b.description,
      formatCurrency(b.plannedAmount, data.currency),
      formatCurrency(b.actual, data.currency),
      formatCurrency(b.plannedAmount - b.actual, data.currency),
      b.plannedAmount > 0 ? `${((b.actual / b.plannedAmount) * 100).toFixed(1)}%` : '0%',
    ]),
    foot: [['TOTAL', '', formatCurrency(data.totalPlanned, data.currency), formatCurrency(data.totalActual, data.currency), formatCurrency(data.totalPlanned - data.totalActual, data.currency), data.totalPlanned > 0 ? `${((data.totalActual / data.totalPlanned) * 100).toFixed(1)}%` : '0%']],
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    footStyles: { fillColor: PDF_COLORS.light, textColor: PDF_COLORS.dark, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  // Expenses table
  doc.addPage();
  y = addSectionTitle(doc, 'Expenses Detail', 20);

  doc.autoTable({
    startY: y,
    head: [['Category', 'Description', 'Amount', 'Month', 'Date', 'Responsible']],
    body: data.expenses.map(e => [
      EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      e.description,
      formatCurrency(e.amount, data.currency),
      `Month ${e.month}`,
      e.date,
      e.responsible || '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  // Revenue table
  if (data.revenues.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Revenue', 20);

    doc.autoTable({
      startY: y,
      head: [['Description', 'Amount', 'Type', 'Status', 'Invoice #', 'Date']],
      body: data.revenues.map(r => [
        r.description,
        formatCurrency(r.amount, data.currency),
        r.revenueType || 'milestone',
        r.status || 'collected',
        r.invoiceNumber || '-',
        r.date,
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  // Change Orders table
  if (data.changeOrders && data.changeOrders.length > 0) {
    doc.addPage();
    y = addSectionTitle(doc, 'Change Orders', 20);

    doc.autoTable({
      startY: y,
      head: [['Description', 'Type', 'Amount Impact', 'Duration Impact', 'Status', 'Requested By']],
      body: data.changeOrders.map(co => [
        co.description,
        CHANGE_ORDER_TYPE_LABELS[co.changeType] || co.changeType,
        formatCurrency(co.amountImpact, data.currency),
        `${co.durationImpact} months`,
        CHANGE_ORDER_STATUS_LABELS[co.status] || co.status,
        co.requestedBy || '-',
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
      styles: { fontSize: 7.5 },
    });
  }

  addPdfFooter(doc);
  doc.save(`${data.projectName}_Financial_Report.pdf`);
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
      ['Net Profit (After Indirect)', formatCurrency(data.summary.netProfitAfterIndirect)],
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

  addPdfFooter(doc);
  doc.save(`${data.companyName}_Company_Report.pdf`);
}

// ======== Portfolio Export ========
interface PortfolioExportData {
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

export function exportPortfolioToExcel(data: PortfolioExportData) {
  const wb = XLSX.utils.book_new();

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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'الملخص');

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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), 'مقارنة المشاريع');

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riskRows), 'المخاطر');
  }

  XLSX.writeFile(wb, `${data.portfolioName}_تقرير_محفظة.xlsx`);
}

// ======== Company Export ========
interface CompanyExportData {
  companyName: string;
  summary: {
    totalContractValue: number;
    totalActual: number;
    totalPlannedProfit: number;
    totalIndirectCosts: number;
    netProfitAfterIndirect: number;
    netProfitMargin: number;
    totalAtRiskProjects: number;
  };
  portfolioSummaries: { name: string; projects: number; contractValue: number; actual: number; profit: number; completion: number; health: string }[];
  indirectCosts: { category: string; description: string; amount: number; month: number }[];
}

export function exportCompanyToExcel(data: CompanyExportData) {
  const wb = XLSX.utils.book_new();

  // Summary
  const summaryRows = [
    { 'البند': 'اسم الشركة', 'القيمة': data.companyName },
    { 'البند': 'إجمالي العقود', 'القيمة': data.summary.totalContractValue },
    { 'البند': 'إجمالي المصروفات', 'القيمة': data.summary.totalActual },
    { 'البند': 'الربح المخطط', 'القيمة': data.summary.totalPlannedProfit },
    { 'البند': 'تكاليف غير مباشرة', 'القيمة': data.summary.totalIndirectCosts },
    { 'البند': 'صافي الربح', 'القيمة': data.summary.netProfitAfterIndirect },
    { 'البند': 'هامش صافي الربح %', 'القيمة': data.summary.netProfitMargin.toFixed(1) },
    { 'البند': 'مشاريع متعثرة', 'القيمة': data.summary.totalAtRiskProjects },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'الملخص');

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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pRows), 'أداء المحافظ');
  }

  // Indirect costs
  if (data.indirectCosts.length > 0) {
    const icRows = data.indirectCosts.map(ic => ({
      'الفئة': ic.category,
      'الوصف': ic.description,
      'المبلغ': ic.amount,
      'الشهر': `شهر ${ic.month}`,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(icRows), 'تكاليف غير مباشرة');
  }

  XLSX.writeFile(wb, `${data.companyName}_تقرير_شركة.xlsx`);
}
