/**
 * The project report, as an Excel workbook and as a PDF.
 */
import { bookNew, appendSheet, writeWorkbook } from '../xlsx-writer';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency, getCashFlowForecast, addVAT, getMonthlyBudgetPlan } from '../finance';
import {
  EXPENSE_CATEGORY_LABELS, CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, COST_TYPE_LABELS, APPROVAL_STATUS_LABELS,
  type ExpenseCategory, type ChangeOrder, type BudgetItem, type Revenue, type Expense, type CostType, type ApprovalStatus,
} from '@/types/project';
import { PDF_COLORS, addPdfFooter, addCoverPage, addSectionTitle } from './pdf-helpers';

export interface ExportBudgetData {
  projectName: string;
  contractValue: number;
  /** The project's budget items, each with the actual the page computed for it. */
  budgetItems: (BudgetItem & { actual: number })[];
  expenses: Expense[];
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

function statusLabel(s: string): string {
  switch (s) {
    case 'on_track': return 'ضمن الخطة';
    case 'near_limit': return 'قرب الحد';
    case 'over': return 'تجاوز';
    case 'future': return 'مستقبل';
    default: return 'بدون نشاط';
  }
}

export async function exportToExcel(data: ExportBudgetData) {
  const wb = bookNew();

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
  appendSheet(wb, budgetRows, 'الموازنة');

  // Expenses sheet
  const expenseRows = data.expenses.map(e => ({
    'الفئة': EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
    'الوصف': e.description,
    'المبلغ': e.amount,
    'الشهر': `شهر ${e.month}`,
    'التاريخ': e.date,
    'المسؤول': e.responsible || '',
    // A rejected row is listed for the record; the column says it is not spend.
    'الحالة': APPROVAL_STATUS_LABELS[(e.approvalStatus || 'approved') as ApprovalStatus] || e.approvalStatus,
  }));
  appendSheet(wb, expenseRows, 'المصروفات');

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
  appendSheet(wb, revenueRows, 'الإيرادات');

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
    appendSheet(wb, coRows, 'أوامر التغيير');
  }

  // Cash Flow sheet
  if (data.durationMonths && data.durationMonths > 0) {
    const cashFlow = getCashFlowForecast(data.budgetItems, data.expenses, data.revenues, data.durationMonths);
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
    appendSheet(wb, cfRows, 'التدفق النقدي');

    // Monthly Budget Plan sheet
    const plan = getMonthlyBudgetPlan(data.budgetItems, data.expenses, data.revenues, data.durationMonths);
    const planRows = plan.map(r => ({
      'الشهر': `شهر ${r.month}`,
      'الحالة': statusLabel(r.status),
      'المخطط': r.planned,
      'الفعلي': r.actual,
      'الانحراف': r.variance,
      'النسبة %': r.planned > 0 ? Number(r.utilizationPct.toFixed(1)) : 0,
      'إيراد محصّل': r.actualRevenue,
      'صافي التدفق': r.netCashFlow,
      'تراكمي مخطط': r.cumulativePlanned,
      'تراكمي فعلي': r.cumulativeActual,
      'عدد البنود': r.items.length,
    }));
    appendSheet(wb, planRows, 'الخطة الشهرية');

    // Monthly items detail sheet — every item in every month it appears in
    const itemRows: Record<string, string | number>[] = [];
    plan.forEach(r => {
      r.items.forEach(it => {
        itemRows.push({
          'الشهر': `شهر ${r.month}`,
          'الفئة': EXPENSE_CATEGORY_LABELS[it.category as ExpenseCategory] || it.category,
          'الوصف': it.description,
          'نوع التكلفة': COST_TYPE_LABELS[it.costType as CostType] || it.costType,
          'المبلغ المخصص للشهر': it.amount,
        });
      });
    });
    if (itemRows.length > 0) {
      appendSheet(wb, itemRows, 'تفاصيل البنود شهرياً');
    }
  }


  // Summary sheet. The rate is the project's own; only a missing one falls
  // back to 15, so a project with no VAT prints 0%.
  const vatRate = data.vatRate ?? 15;
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
    { 'البند': `ضريبة المخرجات (${vatRate}%)`, 'المبلغ': data.totalVATOnRevenues || 0 },
    { 'البند': 'ضريبة المدخلات (قابلة للاسترداد)', 'المبلغ': data.totalVATOnExpenses || 0 },
    { 'البند': 'المستحق لهيئة الزكاة', 'المبلغ': data.netVATPayable || 0 },
    { 'البند': 'قيمة العقد شامل الضريبة', 'المبلغ': data.contractValueInclVAT ?? addVAT(data.contractValue, vatRate) },
  ];
  appendSheet(wb, summaryRows, 'الملخص');

  await writeWorkbook(wb, `${data.projectName}_تقرير_مالي.xlsx`);
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
