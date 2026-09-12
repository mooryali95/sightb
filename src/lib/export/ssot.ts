/**
 * The SSOT report: profitability, settlements and the server reconciliation
 * with the source of every figure, as a PDF.
 */
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatCurrency } from '../finance';
import type { SsotReportInput } from '../ssot-report';
import { PDF_COLORS, addPdfFooter, addCoverPage, addSectionTitle } from './pdf-helpers';

// ======== SSOT Reconciliation / Profitability report ========


/**
 * PDF يجمع الربحية + التسويات + مطابقة الخادم مع سبب كل فرق.
 * (نصوص PDF بالإنجليزية لأن خطوط jsPDF المدمجة لا تدعم العربية.)
 */
export function exportSsotReportPDF(data: SsotReportInput & { currency?: string }) {
  const cur = data.currency || 'SAR';
  const doc = new jsPDF({ orientation: 'landscape', putOnlyUsedFonts: true });
  const p = data.profitability;

  const collected = p.revenues.filter(r => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const invoiced = p.revenues.filter(r => r.status === 'invoiced' || r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const effectiveContract = p.contractValue + p.approvedChangeOrders;
  const profit = effectiveContract - p.totalActualExpenses;

  addCoverPage(doc, p.projectName, 'Profitability, Settlements & Server Reconciliation');

  doc.addPage();
  let y = addSectionTitle(doc, 'Profitability Summary', 20);
  doc.autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Contract Value', formatCurrency(p.contractValue, cur)],
      ['Approved Change Orders', formatCurrency(p.approvedChangeOrders, cur)],
      ['Effective Contract Value', formatCurrency(effectiveContract, cur)],
      ['Collected Revenue', formatCurrency(collected, cur)],
      ['Invoiced Revenue', formatCurrency(invoiced, cur)],
      ['Actual Expenses', formatCurrency(p.totalActualExpenses, cur)],
      ['Expected Profit', formatCurrency(profit, cur)],
      ['Margin %', effectiveContract > 0 ? `${((profit / effectiveContract) * 100).toFixed(1)}%` : 'N/A'],
      ['Server Computed At', data.computedAt ? new Date(data.computedAt).toISOString() : 'N/A'],
    ],
    theme: 'striped',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 12;
  y = addSectionTitle(doc, 'Settlements', y);
  doc.autoTable({
    startY: y,
    head: [['Fund', 'Status', 'Received', 'Spent', 'Remaining']],
    body: data.settlements.length
      ? data.settlements.map(s => [
          s.label, s.status,
          formatCurrency(s.totalReceived, cur),
          formatCurrency(s.totalSpent, cur),
          formatCurrency(s.remaining, cur),
        ])
      : [['-', 'No settlements', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  doc.addPage();
  y = addSectionTitle(doc, 'Server Reconciliation (SSOT)', 20);
  doc.autoTable({
    startY: y,
    head: [['Item', 'Server', 'UI', 'Diff', 'Status', 'Reason']],
    body: data.reconciliation.map(r => [
      r.key,
      formatCurrency(r.serverValue, cur),
      formatCurrency(r.clientValue, cur),
      formatCurrency(r.diff, cur),
      r.mismatch ? 'MISMATCH' : 'OK',
      r.mismatch ? 'See audit trail below' : '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7.5 },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 12;
  y = addSectionTitle(doc, 'Audit Trail — source of every figure', y);
  doc.autoTable({
    startY: y,
    head: [['Item', 'Component', 'Sign', 'Value', 'Source table']],
    body: data.reconciliation.flatMap(r =>
      r.components.map(c => [r.key, c.label, c.sign === '−' ? '-' : c.sign, formatCurrency(c.value, cur), c.source])),
    theme: 'striped',
    headStyles: { fillColor: PDF_COLORS.primary, fontSize: 8 },
    styles: { fontSize: 7 },
  });

  addPdfFooter(doc);
  doc.save(`${p.projectName}_SSOT_Report.pdf`);
}
