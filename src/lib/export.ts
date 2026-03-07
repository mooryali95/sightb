import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency } from './finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';

// Extend jsPDF type for autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ExportBudgetData {
  projectName: string;
  contractValue: number;
  budgetItems: { category: string; description: string; plannedAmount: number; month?: number; actual: number }[];
  expenses: { category: string; description: string; amount: number; month: number; date: string; responsible?: string }[];
  revenues: { description: string; amount: number; month: number; date: string }[];
  totalPlanned: number;
  totalActual: number;
  totalRevenue: number;
  currency?: string;
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
    'نسبة الصرف %': b.plannedAmount > 0 ? ((b.actual / b.plannedAmount) * 100).toFixed(1) : '0',
    'الشهر': b.month ? `شهر ${b.month}` : 'موزع',
  }));
  budgetRows.push({
    'الفئة': 'الإجمالي',
    'الوصف': '',
    'المبلغ المخطط': data.totalPlanned,
    'الفعلي': data.totalActual,
    'المتبقي': data.totalPlanned - data.totalActual,
    'نسبة الصرف %': data.totalPlanned > 0 ? ((data.totalActual / data.totalPlanned) * 100).toFixed(1) : '0',
    'الشهر': '',
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
    'الشهر': `شهر ${r.month}`,
    'التاريخ': r.date,
  }));
  const wsRevenue = XLSX.utils.json_to_sheet(revenueRows);
  XLSX.utils.book_append_sheet(wb, wsRevenue, 'الإيرادات');

  // Summary sheet
  const summaryRows = [
    { 'البند': 'قيمة العقد', 'المبلغ': data.contractValue },
    { 'البند': 'إجمالي الموازنة المخططة', 'المبلغ': data.totalPlanned },
    { 'البند': 'إجمالي المصروفات', 'المبلغ': data.totalActual },
    { 'البند': 'إجمالي الإيرادات', 'المبلغ': data.totalRevenue },
    { 'البند': 'صافي الربح', 'المبلغ': data.totalRevenue - data.totalActual },
    { 'البند': 'المتبقي من العقد', 'المبلغ': data.contractValue - data.totalActual },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

  XLSX.writeFile(wb, `${data.projectName}_تقرير_مالي.xlsx`);
}

export function exportToPDF(data: ExportBudgetData) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });

  // Use default font (no Arabic shaping in basic jsPDF, but numbers/layout work)
  doc.setFontSize(16);
  doc.text(data.projectName, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.text(`Contract: ${formatCurrency(data.contractValue)}  |  Planned: ${formatCurrency(data.totalPlanned)}  |  Actual: ${formatCurrency(data.totalActual)}  |  Revenue: ${formatCurrency(data.totalRevenue)}`, doc.internal.pageSize.getWidth() / 2, 23, { align: 'center' });

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
