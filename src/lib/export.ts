import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, getCashFlowForecast } from './finance';
import { EXPENSE_CATEGORY_LABELS, CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, type ExpenseCategory, type ChangeOrder, type BudgetItem, type Revenue } from '@/types/project';

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
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

  XLSX.writeFile(wb, `${data.projectName}_تقرير_مالي.xlsx`);
}

export function exportToPDF(data: ExportBudgetData) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });

  doc.setFontSize(16);
  doc.text(data.projectName, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  const approvedCOImpact = (data.changeOrders || []).filter(co => co.status === 'approved').reduce((s, co) => s + co.amountImpact, 0);
  const effectiveContract = data.contractValue + approvedCOImpact;
  const plannedProfit = data.plannedProfit !== undefined ? data.plannedProfit : effectiveContract - data.totalPlanned;

  doc.setFontSize(10);
  doc.text(
    `Contract: ${formatCurrency(effectiveContract)}  |  Planned: ${formatCurrency(data.totalPlanned)}  |  Actual: ${formatCurrency(data.totalActual)}  |  Planned Profit: ${formatCurrency(plannedProfit)}`,
    doc.internal.pageSize.getWidth() / 2, 23, { align: 'center' }
  );

  // Budget table
  doc.autoTable({
    startY: 30,
    head: [['Category', 'Description', 'Planned', 'Actual', 'Remaining', 'Spend %']],
    body: data.budgetItems.map(b => [
      EXPENSE_CATEGORY_LABELS[b.category as ExpenseCategory] || b.category,
      b.description,
      formatCurrency(b.plannedAmount),
      formatCurrency(b.actual),
      formatCurrency(b.plannedAmount - b.actual),
      b.plannedAmount > 0 ? `${((b.actual / b.plannedAmount) * 100).toFixed(1)}%` : '0%',
    ]),
    foot: [['Total', '', formatCurrency(data.totalPlanned), formatCurrency(data.totalActual), formatCurrency(data.totalPlanned - data.totalActual), data.totalPlanned > 0 ? `${((data.totalActual / data.totalPlanned) * 100).toFixed(1)}%` : '0%']],
    theme: 'grid',
    headStyles: { fillColor: [180, 150, 80] },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 8 },
  });

  // Expenses table on new page
  doc.addPage();
  doc.setFontSize(12);
  doc.text('Expenses', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  doc.autoTable({
    startY: 22,
    head: [['Category', 'Description', 'Amount', 'Month', 'Date', 'Responsible']],
    body: data.expenses.map(e => [
      EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      e.description,
      formatCurrency(e.amount),
      `Month ${e.month}`,
      e.date,
      e.responsible || '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: [180, 150, 80] },
    styles: { fontSize: 8 },
  });

  doc.save(`${data.projectName}_Financial_Report.pdf`);
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
