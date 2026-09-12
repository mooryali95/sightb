/**
 * The two payables reports: outstanding advances and the settlement events
 * log, each as an Excel workbook and as a PDF.
 */
import { bookNew, appendSheet, writeWorkbook } from '../xlsx-writer';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency } from '../finance';
import { PDF_COLORS, addPdfFooter, addCoverPage, addSectionTitle } from './pdf-helpers';

// ======== Outstanding Advances Export ========
export interface OutstandingAdvanceRow {
  resourceName: string;
  paidDate: string;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  ageDays: number;
  source: string;
  description?: string;
}

function ageLabelAr(days: number): string {
  if (days >= 90) return 'حرج';
  if (days >= 60) return 'متأخر';
  if (days >= 30) return 'تنبيه';
  return 'حديث';
}

export async function exportOutstandingAdvancesExcel(rows: OutstandingAdvanceRow[], projectName: string) {
  const wb = bookNew();
  const data: Record<string, string | number>[] = rows.map(r => ({
    'المورد': r.resourceName,
    'تاريخ السلفة': r.paidDate,
    'المبلغ الأصلي': r.originalAmount,
    'المسوّى': r.settledAmount,
    'المتبقي': r.remainingAmount,
    'العمر (يوم)': r.ageDays,
    'حالة العمر': ageLabelAr(r.ageDays),
    'المصدر': r.source,
    'الوصف': r.description || '',
  }));
  const total = rows.reduce((s, r) => s + r.remainingAmount, 0);
  data.push({
    'المورد': 'الإجمالي', 'تاريخ السلفة': '', 'المبلغ الأصلي': '',
    'المسوّى': '', 'المتبقي': total, 'العمر (يوم)': '',
    'حالة العمر': '', 'المصدر': '', 'الوصف': '',
  });
  appendSheet(wb, data, 'السلف القائمة');
  await writeWorkbook(wb, `${projectName}_السلف_القائمة.xlsx`);
}

export function exportOutstandingAdvancesPDF(rows: OutstandingAdvanceRow[], projectName: string, currency?: string) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });
  addCoverPage(doc, projectName, 'Outstanding Advances Report');

  doc.addPage();
  const y = addSectionTitle(doc, 'Outstanding Advances', 20);

  const total = rows.reduce((s, r) => s + r.remainingAmount, 0);
  doc.autoTable({
    startY: y,
    head: [['Resource', 'Paid Date', 'Original', 'Settled', 'Remaining', 'Age (days)', 'Status', 'Source']],
    body: rows.map(r => [
      r.resourceName,
      r.paidDate,
      formatCurrency(r.originalAmount, currency),
      formatCurrency(r.settledAmount, currency),
      formatCurrency(r.remainingAmount, currency),
      String(r.ageDays),
      r.ageDays >= 90 ? 'Critical' : r.ageDays >= 60 ? 'Overdue' : r.ageDays >= 30 ? 'Warning' : 'Recent',
      r.source,
    ]),
    foot: [['TOTAL', '', '', '', formatCurrency(total, currency), '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    footStyles: { fillColor: PDF_COLORS.light, textColor: PDF_COLORS.dark, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  addPdfFooter(doc);
  doc.save(`${projectName}_Outstanding_Advances.pdf`);
}

// ======== Settlement Events Export ========
export interface SettlementEventRow {
  date: string;
  resourceName: string;
  eventType: string;
  amount: number;
  overflowAmount?: number;
  overflowSource?: string;
  notes?: string;
}

const EVENT_TYPE_LABELS_AR: Record<string, string> = {
  documented: 'تسوية بمستندات',
  cash_refund: 'رد نقدي',
  payroll_deduction: 'خصم من الراتب',
  written_off: 'شطب',
  reverse: 'تراجع',
};

export async function exportSettlementEventsExcel(rows: SettlementEventRow[], projectName: string) {
  const wb = bookNew();
  const data = rows.map(r => ({
    'التاريخ': r.date,
    'المورد': r.resourceName,
    'نوع الحدث': EVENT_TYPE_LABELS_AR[r.eventType] || r.eventType,
    'المبلغ': r.amount,
    'الفائض': r.overflowAmount || 0,
    'مصدر الفائض': r.overflowSource || '',
    'ملاحظات': r.notes || '',
  }));
  appendSheet(wb, data, 'سجل التسويات');
  await writeWorkbook(wb, `${projectName}_سجل_التسويات.xlsx`);
}

export function exportSettlementEventsPDF(rows: SettlementEventRow[], projectName: string, currency?: string) {
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });
  addCoverPage(doc, projectName, 'Settlement Events Log');

  doc.addPage();
  const y = addSectionTitle(doc, 'Settlement Events', 20);

  doc.autoTable({
    startY: y,
    head: [['Date', 'Resource', 'Event Type', 'Amount', 'Overflow', 'Overflow Source', 'Notes']],
    body: rows.map(r => [
      r.date,
      r.resourceName,
      r.eventType,
      formatCurrency(r.amount, currency),
      r.overflowAmount ? formatCurrency(r.overflowAmount, currency) : '-',
      r.overflowSource || '-',
      r.notes || '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  addPdfFooter(doc);
  doc.save(`${projectName}_Settlement_Events.pdf`);
}
