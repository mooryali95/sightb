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
