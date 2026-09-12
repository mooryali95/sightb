/** The contract, the approved orders' impact, the effective value, and the revenues. */
import type { ChangeOrder, ProjectSummary, Revenue } from '@/types/project';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Row } from './SsotRow';

interface Props {
  projectId: string;
  currency: string;
  contractValue: number;
  summary: ProjectSummary;
  changeOrders: ChangeOrder[];
  revenues: Revenue[];
}

export function ContractBlock({ projectId, currency, contractValue, summary, changeOrders, revenues }: Props) {
  const approvedCO = changeOrders.filter((c) => c.status === 'approved');
  const approvedCOImpact = approvedCO.reduce((s, c) => s + c.amountImpact, 0);
  const collectedRevenue = revenues.filter((r) => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const invoicedRevenue = revenues.filter((r) => r.status === 'invoiced' || r.status === 'collected').reduce((s, r) => s + r.amount, 0);

  return (
    <AccordionItem value="contract" className="border border-border rounded-lg bg-card px-3 md:px-4">
      <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
        قيمة العقد والإيرادات
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        <Row
          label="قيمة العقد الأصلية"
          value={contractValue}
          sources={[{ kind: 'db', label: 'projects.contract_value' }]}
          currency={currency}
          ssotKey="contract_value" projectId={projectId}
        />
        <Row
          label={`أثر أوامر التغيير المعتمدة (${approvedCO.length})`}
          value={approvedCOImpact}
          formula="Σ change_orders.amount_impact WHERE status = 'approved'"
          sources={[{ kind: 'db', label: 'change_orders' }]}
          currency={currency}
          ssotKey="approved_change_orders" projectId={projectId}
        />
        <Row
          label="قيمة العقد الفعلية"
          value={summary.effectiveContractValue}
          formula="contractValue + Σ approved change_orders.amount_impact"
          sources={[{ kind: 'fn', label: 'getEffectiveContractValue()' }]}
          currency={currency}
        />
        <Row
          label="الإيرادات المُحصَّلة"
          value={collectedRevenue}
          formula="Σ revenues.amount WHERE status = 'collected'"
          sources={[{ kind: 'db', label: 'revenues' }]}
          currency={currency}
          ssotKey="collected_revenue" projectId={projectId}
        />

        <Row
          label="الإيرادات المُفوترة (شاملة المحصَّل)"
          value={invoicedRevenue}
          formula="Σ revenues.amount WHERE status IN ('invoiced','collected')"
          sources={[{ kind: 'db', label: 'revenues' }]}
          currency={currency}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
