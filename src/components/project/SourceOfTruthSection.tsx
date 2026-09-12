/**
 * SourceOfTruthSection — لوحة "تفسير مصدر الحقيقة"
 * تعرض تفصيل كل معادلة مالية رئيسية مع ربط كل رقم بمصدره في الكود / DB.
 * الهدف: شفافية كاملة عن كيف نحسب المتبقي / الربح / EVM / التحويلات.
 *
 * The section builds the audit and lays out the blocks; each block and
 * the explained row live under ssot/.
 */
import type {
  Project, BudgetItem, Expense, Revenue, ChangeOrder,
  ProjectFund, FundSettlement, Custody, PaymentRequest, CashTransfer,
  ProjectSummary, EVMMetrics,
} from '@/types/project';
import { Accordion } from '@/components/ui/accordion';
import { Info } from 'lucide-react';
import { ServerTruthCard } from './ServerTruthCard';
import { SsotReportExportButton } from './SsotReportExportButton';
import { buildSsotAudit } from '@/lib/ssot-report';
import { SourceBadge } from './ssot/SsotRow';
import { ContractBlock } from './ssot/ContractBlock';
import { SpendBlock } from './ssot/SpendBlock';
import { FundsBlock } from './ssot/FundsBlock';
import { EvmBlock } from './ssot/EvmBlock';
import { GuardsBlock } from './ssot/GuardsBlock';

interface Props {
  project: Project;
  summary: ProjectSummary;
  evm: EVMMetrics | null;
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];
  changeOrders: ChangeOrder[];
  funds: ProjectFund[];
  settlements: FundSettlement[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
}

export function SourceOfTruthSection({
  project, summary, evm, expenses, revenues, changeOrders,
  funds, settlements, custodies, paymentRequests, cashTransfers,
}: Props) {
  const currency = project.currency;

  const audit = buildSsotAudit({
    projectId: project.id,
    contractValue: project.contractValue,
    expenses, custodies, paymentRequests, cashTransfers, funds, settlements, changeOrders,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <div className="font-semibold mb-1">لوحة تفسير مصدر الحقيقة (SSOT)</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              كل رقم مالي في هذا المشروع يُحسب من دالة واحدة موثّقة (Single Source of Truth).
              اللوحة أدناه تعرض تفصيل المعادلة، وقيمة كل مركّب، ومصدره:
              <SourceBadge kind="fn" label="دالة" /> = دالة TypeScript خالصة،{' '}
              <SourceBadge kind="db" label="DB" /> = تريجر / دالة Postgres،{' '}
              <SourceBadge kind="calc" label="مباشر" /> = جمع مباشر من الجدول.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <SsotReportExportButton
          project={project}
          audit={audit}
          revenues={revenues}
          funds={funds}
          settlements={settlements}
        />
      </div>

      <ServerTruthCard
        projectId={project.id}
        currency={currency}
        audit={audit}
      />

      <Accordion type="multiple" defaultValue={['contract', 'funds', 'evm']} className="space-y-2">
        <ContractBlock projectId={project.id} currency={currency} contractValue={project.contractValue} summary={summary} changeOrders={changeOrders} revenues={revenues} />
        <SpendBlock projectId={project.id} currency={currency} summary={summary} expenses={expenses} paymentRequests={paymentRequests} />
        <FundsBlock
          projectId={project.id} currency={currency} funds={funds} settlements={settlements}
          expenses={expenses} custodies={custodies} paymentRequests={paymentRequests} cashTransfers={cashTransfers}
        />
        <EvmBlock evm={evm} currency={currency} />
        <GuardsBlock />
      </Accordion>
    </div>
  );
}
