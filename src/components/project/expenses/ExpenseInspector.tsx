/**
 * The read-only expense inspector: net, VAT and inclusive amounts, what the
 * row is linked to, and where its money came from.
 */
import { formatCurrency, calcVAT, addVAT } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS,
  type ExpenseCategory, type ApprovalStatus, type Resource, type Custody, type BudgetItem, type Expense, type ProjectFund,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';

interface Props {
  /** The row being inspected; the panel is closed when absent. */
  expense: Expense | undefined;
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
  projectFunds: ProjectFund[];
  taxPercent: number;
  readOnly: boolean;
  onEdit: (expense: Expense) => void;
  onClose: () => void;
}

export function ExpenseInspector({
  expense, resources, custodies, budgetItems, projectFunds, taxPercent, readOnly, onEdit, onClose,
}: Props) {
  const exp = expense;
  if (!exp) return null;
  const resource = resources.find(r => r.id === exp.resourceId);
  const custody = custodies.find(c => c.id === exp.custodyId);
  const budgetItem = budgetItems.find(b => b.id === exp.budgetItemId);
  const fund = projectFunds.find((f) => f.id === exp.fundId);
  const status = exp.approvalStatus || 'approved';
  const vatAmount = exp.isVatExempt ? 0 : calcVAT(exp.amount, taxPercent);
  const inclusive = addVAT(exp.amount, exp.isVatExempt ? 0 : taxPercent);
  return (
    <InspectorPanel
      open={!!expense}
      onOpenChange={(v) => !v && onClose()}
      title={exp.description || 'تفاصيل المصروف'}
      description={
        <span className="flex items-center gap-2">
          <span className="badge-gold">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</span>
          <span>شهر {exp.month} · {exp.date}</span>
        </span>
      }
      meta={
        <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[status as ApprovalStatus] || ''}`}>
          {APPROVAL_STATUS_LABELS[status as ApprovalStatus] || status}
        </Badge>
      }
      width="md"
      footer={!readOnly && (
        <>
          <Button variant="outline" size="sm" onClick={() => onEdit(exp)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" />تعديل
          </Button>
          <Button variant="default" size="sm" onClick={onClose}>إغلاق</Button>
        </>
      )}
    >
      <InspectorKpiStrip
        items={[
          { label: 'صافي', value: formatCurrency(exp.amount), tone: 'default' },
          { label: 'ضريبة', value: exp.isVatExempt ? 'معفى' : formatCurrency(vatAmount), tone: 'info' },
          { label: 'شامل', value: formatCurrency(inclusive), tone: 'success' },
          { label: 'الشهر', value: `#${exp.month}`, tone: 'default' },
        ]}
      />

      <InspectorSection title="التصنيف والربط">
        <InspectorField label="بند الموازنة" value={budgetItem?.description || '—'} />
        <InspectorField label="المورد / المسؤول" value={resource?.name || exp.responsible || '—'} />
        <InspectorField label="الجهة المورّدة" value={exp.vendor || '—'} />
        <InspectorField label="مرجع الفاتورة" value={exp.invoiceRef || '—'} />
      </InspectorSection>

      <InspectorSection title="مصدر التمويل">
        <InspectorField label="العهدة" value={custody?.resourceName || '—'} />
        <InspectorField label="دفعة التمويل" value={fund ? `#${fund.fundNumber}` : '—'} />
        {exp.sourcePaymentRequestId && (
          <InspectorField
            label="نوع المصروف"
            value={<Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">تسوية سلفة</Badge>}
          />
        )}
      </InspectorSection>

      <InspectorSection title="معلومات إضافية">
        <InspectorField label="التاريخ" value={exp.date} mono />
        <InspectorField label="معرّف السجل" value={<span className="text-[10px] font-mono text-muted-foreground">{exp.id}</span>} />
      </InspectorSection>
    </InspectorPanel>
  );
}
