/** The planned and actual totals, what is excluded, the advances, and both profits. */
import type { Expense, PaymentRequest, ProjectSummary } from '@/types/project';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Row } from './SsotRow';

interface Props {
  projectId: string;
  currency: string;
  summary: ProjectSummary;
  expenses: Expense[];
  paymentRequests: PaymentRequest[];
}

export function SpendBlock({ projectId, currency, summary, expenses, paymentRequests }: Props) {
  const rejectedExpenses = expenses.filter((e) => e.approvalStatus === 'rejected').reduce((s, e) => s + e.amount, 0);
  const outstandingAdvancesAll = paymentRequests
    .filter((p) => p.projectId === projectId && p.requestType === 'advance' && p.status === 'paid' && p.isAdvanceOutstanding === true)
    .reduce((s, p) => s + Math.max(p.amount - (p.refundedAmount ?? 0), 0), 0);

  return (
    <AccordionItem value="profit" className="border border-border rounded-lg bg-card px-3 md:px-4">
      <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
        المصروفات والربحية
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        <Row
          label="إجمالي المُخطَّط (Budget)"
          value={summary.totalPlanned}
          formula="Σ budget_items.planned_amount (recurring × months)"
          sources={[{ kind: 'fn', label: 'getTotalPlanned()' }]}
          currency={currency}
        />
        <Row
          label="المصروفات الفعلية (AC)"
          value={summary.totalActual}
          formula="Σ expenses.amount WHERE approval_status ≠ 'rejected' AND NOT outstanding advance"
          sources={[
            { kind: 'fn', label: 'getProjectSummary()' },
            { kind: 'db', label: 'expenses' },
          ]}
          currency={currency}
          ssotKey="total_actual_expenses" projectId={projectId}
        />
        <Row
          label="المصروفات المرفوضة (مستبعدة)"
          value={rejectedExpenses}
          sources={[{ kind: 'db', label: "expenses WHERE approval='rejected'" }]}
          currency={currency}
        />
        <Row
          label="سلف قائمة (Outstanding Advances)"
          value={outstandingAdvancesAll}
          formula="Σ (amount − refunded) WHERE type='advance' AND status='paid' AND is_advance_outstanding"
          sources={[{ kind: 'db', label: 'payment_requests' }]}
          currency={currency}
          ssotKey="outstanding_advances" projectId={projectId}
        />

        <Row
          label="الربح المُخطَّط"
          value={summary.plannedProfit}
          formula="effectiveContractValue − totalPlanned"
          sources={[{ kind: 'fn', label: 'getProjectSummary()' }]}
          currency={currency}
        />
        <Row
          label="الربح المحقق (Realized)"
          value={summary.realizedProfit}
          formula="collectedRevenue − totalActual"
          sources={[{ kind: 'fn', label: 'getProjectSummary()' }]}
          currency={currency}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
