import type { ResourceReimbursement, Resource, PaymentRequest, ResourceSettlement } from '@/types/project';
import {
  filterResourceReimbursements,
  filterVendorReimbursements,
  getProjectPayablesSummary,
  getVendorPayablesSummary,
  type ProjectPayablesSummary,
} from './resource-payables';
import { REIMBURSEMENT_STATUS_LABELS, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';

function esc(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Text starting with a formula character would run as a formula in a
  // spreadsheet; a leading apostrophe makes it plain text. Numbers stay numbers.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells: unknown[]): string {
  return cells.map(esc).join(',');
}

function summaryRows(label: string, s: ProjectPayablesSummary): string[] {
  return [
    row([label, 'عدد السجلات', s.totalReimbursementsCount]),
    row([label, 'إجمالي المعتمد', s.totalApprovedAmount]),
    row([label, 'إجمالي المدفوع', s.totalPaidAmount]),
    row([label, 'المستحق غير المدفوع', s.totalOutstandingAmount]),
    row([label, 'قيد المراجعة', s.totalPendingReview]),
  ];
}

export interface PayablesCsvInput {
  projectId: string;
  projectName: string;
  resources: Resource[];
  reimbursements: ResourceReimbursement[];
  paymentRequests: PaymentRequest[];
  settlements: ResourceSettlement[];
}

/**
 * CSV يفصل دفتر مستحقات الفريق (Resource) عن مستحقات الموردين (Vendor)
 * في كتلتين مستقلتين — لا تُجمع الأرقام أبداً بين الدفترين.
 */
export function buildPayablesCSV(input: PayablesCsvInput): string {
  const projReimbs = input.reimbursements.filter((r) => r.projectId === input.projectId);
  const resourceReimbs = filterResourceReimbursements(projReimbs);
  const vendorReimbs = filterVendorReimbursements(projReimbs);

  const resourceSummary = getProjectPayablesSummary(
    input.projectId,
    input.resources,
    resourceReimbs,
    input.paymentRequests,
    input.settlements,
  );
  const vendorSummary = getVendorPayablesSummary(input.projectId, vendorReimbs);

  const lines: string[] = [];
  lines.push(row(['المشروع', input.projectName]));
  lines.push(row(['تاريخ التصدير', new Date().toISOString().split('T')[0]]));
  lines.push('');
  lines.push(row(['الدفتر', 'المؤشر', 'القيمة']));
  lines.push(...summaryRows('مستحقات الفريق (Resource)', resourceSummary));
  lines.push(...summaryRows('مستحقات الموردين (Vendor)', vendorSummary));
  lines.push('');

  const detailHeader = row([
    'الدفتر', 'التاريخ', 'الجهة', 'الفئة', 'الوصف', 'المبلغ', 'الحالة',
  ]);

  const detail = (label: string, rs: ResourceReimbursement[]) => {
    lines.push(row([`تفاصيل — ${label}`]));
    lines.push(detailHeader);
    if (rs.length === 0) {
      lines.push(row([label, '—', '—', '—', 'لا توجد سجلات', 0, '—']));
    }
    for (const r of rs) {
      const party = (r.sourceKind ?? 'resource') === 'vendor'
        ? (r.vendorName || '—')
        : (input.resources.find((x) => x.id === r.resourceId)?.name || '—');
      lines.push(row([
        label,
        r.expenseDate,
        party,
        EXPENSE_CATEGORY_LABELS[r.category as ExpenseCategory] || r.category,
        r.description,
        r.amount,
        REIMBURSEMENT_STATUS_LABELS[r.status] || r.status,
      ]));
    }
    lines.push('');
  };

  detail('مستحقات الفريق (Resource)', resourceReimbs);
  detail('مستحقات الموردين (Vendor)', vendorReimbs);

  return lines.join('\n');
}

export function downloadCSV(filename: string, csv: string) {
  // BOM يضمن قراءة العربية بشكل صحيح في Excel
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPayablesSummaryCSV(input: PayablesCsvInput) {
  const csv = buildPayablesCSV(input);
  const safe = (input.projectName || 'project').replace(/[\\/:*?"<>|]/g, '_');
  downloadCSV(`payables-${safe}.csv`, csv);
}
