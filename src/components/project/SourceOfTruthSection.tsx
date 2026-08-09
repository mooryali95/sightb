/**
 * SourceOfTruthSection — لوحة "تفسير مصدر الحقيقة"
 * تعرض تفصيل كل معادلة مالية رئيسية مع ربط كل رقم بمصدره في الكود / DB.
 * الهدف: شفافية كاملة عن كيف نحسب المتبقي / الربح / EVM / التحويلات.
 */
import { formatCurrency } from '@/lib/finance';
import {
  getProjectFundsSummary,
  getFundDirectSpent,
  getFundCustodyDraw,
  getFundOutstandingAdvances,
  getFundCashTransfersOut,
  getCustodyBreakdown,
} from '@/lib/funds';

import type {
  Project, BudgetItem, Expense, Revenue, ChangeOrder,
  ProjectFund, FundSettlement, Custody, PaymentRequest, CashTransfer,
} from '@/types/project';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Info, FunctionSquare, Database, Calculator } from 'lucide-react';
import type { ProjectSummary, EVMMetrics } from '@/types/project';
import { SsotExplainButton } from './SsotExplainButton';
import { ServerTruthCard } from './ServerTruthCard';
import { SsotReportExportButton } from './SsotReportExportButton';
import { buildSsotAudit } from '@/lib/ssot-report';




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

function SourceBadge({ kind, label }: { kind: 'fn' | 'db' | 'calc'; label: string }) {
  const Icon = kind === 'fn' ? FunctionSquare : kind === 'db' ? Database : Calculator;
  const color =
    kind === 'fn' ? 'bg-primary/10 text-primary border-primary/25'
    : kind === 'db' ? 'bg-warning/10 text-warning border-warning/25'
    : 'bg-success/10 text-success border-success/25';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${color}`}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

function Row({
  label, value, formula, sources, currency, ssotKey, projectId,
}: {
  label: string;
  value: number;
  formula?: string;
  sources: { kind: 'fn' | 'db' | 'calc'; label: string }[];
  currency: string;
  ssotKey?: string;
  projectId?: string;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 py-2 items-start border-b border-border/40 last:border-b-0">
      <div className="col-span-6 md:col-span-5 text-sm text-foreground flex items-center gap-2">
        <span>{label}</span>
        {ssotKey && projectId && (
          <SsotExplainButton ssotKey={ssotKey} label={label} projectId={projectId} currency={currency} />
        )}
      </div>
      <div className="col-span-6 md:col-span-3 text-sm font-mono font-semibold text-left" dir="ltr">
        {formatCurrency(value, currency)}
      </div>
      <div className="col-span-12 md:col-span-4 flex flex-wrap gap-1 justify-start md:justify-end">
        {sources.map((s, i) => <SourceBadge key={i} {...s} />)}
      </div>
      {formula && (
        <div className="col-span-12 text-[11px] font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1" dir="ltr">
          {formula}
        </div>
      )}
    </div>
  );
}


export function SourceOfTruthSection({
  project, summary, evm, budgetItems, expenses, revenues, changeOrders,
  funds, settlements, custodies, paymentRequests, cashTransfers,
}: Props) {
  const currency = project.currency;
  const fundsSummary = getProjectFundsSummary(
    project.id, funds, settlements, expenses, custodies, paymentRequests, cashTransfers,
  );

  const activeOrAck = funds.filter(
    (f) => f.projectId === project.id && (f.status === 'transferred' || f.status === 'acknowledged'),
  );

  const approvedCO = changeOrders.filter((c) => c.status === 'approved');
  const approvedCOImpact = approvedCO.reduce((s, c) => s + c.amountImpact, 0);

  const collectedRevenue = revenues.filter((r) => r.status === 'collected').reduce((s, r) => s + r.amount, 0);
  const invoicedRevenue = revenues.filter((r) => r.status === 'invoiced' || r.status === 'collected').reduce((s, r) => s + r.amount, 0);

  const rejectedExpenses = expenses.filter((e) => e.approvalStatus === 'rejected').reduce((s, e) => s + e.amount, 0);
  const outstandingAdvancesAll = paymentRequests
    .filter((p) => p.projectId === project.id && p.requestType === 'advance' && p.status === 'paid' && p.isAdvanceOutstanding === true)
    .reduce((s, p) => s + Math.max(p.amount - (p.refundedAmount ?? 0), 0), 0);

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
        {/* عقد + إيرادات */}
        <AccordionItem value="contract" className="border border-border rounded-lg bg-card px-3 md:px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            قيمة العقد والإيرادات
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <Row
              label="قيمة العقد الأصلية"
              value={project.contractValue}
              sources={[{ kind: 'db', label: 'projects.contract_value' }]}
              currency={currency}
              ssotKey="contract_value" projectId={project.id}
            />
            <Row
              label={`أثر أوامر التغيير المعتمدة (${approvedCO.length})`}
              value={approvedCOImpact}
              formula="Σ change_orders.amount_impact WHERE status = 'approved'"
              sources={[{ kind: 'db', label: 'change_orders' }]}
              currency={currency}
              ssotKey="approved_change_orders" projectId={project.id}
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
              formula="Σ revenues.amount WHERE status = 'received'"
              sources={[{ kind: 'db', label: 'revenues' }]}
              currency={currency}
              ssotKey="collected_revenue" projectId={project.id}
            />

            <Row
              label="الإيرادات المُفوترة (شاملة المحصَّل)"
              value={invoicedRevenue}
              formula="Σ revenues.amount WHERE status IN ('invoiced','received')"
              sources={[{ kind: 'db', label: 'revenues' }]}
              currency={currency}
            />
          </AccordionContent>
        </AccordionItem>

        {/* المصروفات والربحية */}
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
              ssotKey="total_actual_expenses" projectId={project.id}
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
              ssotKey="outstanding_advances" projectId={project.id}
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

        {/* دفعات + عهد */}
        <AccordionItem value="funds" className="border border-border rounded-lg bg-card px-3 md:px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            الدفعات (Revolving Fund) والنقد بيد المدير
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            <Row
              label={`إجمالي المُحوَّل (${fundsSummary.fundCount} دفعة)`}
              value={fundsSummary.totalTransferred}
              formula="Σ project_funds.amount WHERE project_id = ?"
              sources={[{ kind: 'db', label: 'project_funds' }]}
              currency={currency}
              ssotKey="total_transferred_funds" projectId={project.id}
            />


            <div className="mt-3 mb-2 text-xs font-semibold text-muted-foreground">
              تفصيل الاستنزاف للدفعات النشطة ({activeOrAck.length}):
            </div>
            {activeOrAck.map((f) => {
              const direct = getFundDirectSpent(f.id, expenses, custodies);
              const custody = getFundCustodyDraw(f.id, custodies);
              const adv = getFundOutstandingAdvances(f.id, paymentRequests);
              const transfers = getFundCashTransfersOut(f.id, cashTransfers);
              const spent = direct + custody + adv + transfers;
              const remaining = f.amount - spent;
              return (
                <div key={f.id} className="rounded border border-border/60 bg-muted/30 p-2 mb-2">
                  <div className="text-xs font-semibold mb-1">
                    دفعة #{f.fundNumber} — <span dir="ltr">{formatCurrency(f.amount, currency)}</span>
                    <Badge variant="outline" className="mr-2 text-[10px]">{f.status}</Badge>
                  </div>
                  <Row label="مصروف مباشر" value={direct} sources={[{ kind: 'fn', label: 'getFundDirectSpent()' }]} currency={currency} />
                  <Row label="عهد مسحوبة" value={custody} sources={[{ kind: 'fn', label: 'getFundCustodyDraw()' }]} currency={currency} />
                  <Row label="سلف قائمة" value={adv} sources={[{ kind: 'fn', label: 'getFundOutstandingAdvances()' }]} currency={currency} />
                  <Row label="تحويلات نقدية صادرة → عهدة" value={transfers} sources={[{ kind: 'fn', label: 'getFundCashTransfersOut()' }, { kind: 'db', label: 'cash_transfers' }]} currency={currency} />
                  <Row
                    label="المتبقي بيد المدير لهذه الدفعة"
                    value={remaining}
                    formula="amount − direct − custody − advances − transfersOut"
                    sources={[{ kind: 'fn', label: 'getFundRemaining()' }, { kind: 'db', label: 'validate_cash_transfer()' }]}
                    currency={currency}
                  />
                </div>
              );
            })}

            <Row
              label="إجمالي النقد بيد المدير (كل الدفعات النشطة)"
              value={fundsSummary.remainingInManagerHand}
              formula="Σ (activeFund.amount − direct − custody − advances − transfersOut)"
              sources={[
                { kind: 'fn', label: 'getProjectFundsSummary()' },
                { kind: 'db', label: 'check_fund_balance()' },
              ]}
              currency={currency}
            />
            <Row
              label="إجمالي التسويات المعتمدة"
              value={fundsSummary.totalSettled}
              formula="Σ fund_settlements.total_spent WHERE status='approved'"
              sources={[
                { kind: 'db', label: 'fund_settlements' },
                { kind: 'db', label: 'recalc_fund_settlement_spent()' },
              ]}
              currency={currency}
              ssotKey="settled_amount" projectId={project.id}
            />


          </AccordionContent>
        </AccordionItem>

        {/* EVM */}
        <AccordionItem value="evm" className="border border-border rounded-lg bg-card px-3 md:px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            مقاييس الأداء (EVM — PMI PMBOK 7)
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            {!evm ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                لا يوجد خط أساس معتمد — اعتمد خط أساس لتفعيل EVM.
              </div>
            ) : (
              <>
                <Row
                  label="BAC — الميزانية الإجمالية"
                  value={evm.bac}
                  formula="Σ baseline_items.planned − managementReserve"
                  sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
                  currency={currency}
                />
                <Row
                  label="PV — القيمة المخططة حتى تاريخه"
                  value={evm.pv}
                  formula="Σ baseline distribution up to currentMonth"
                  sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
                  currency={currency}
                />
                <Row
                  label="EV — القيمة المكتسبة"
                  value={evm.ev}
                  formula="(percentComplete / 100) × BAC"
                  sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
                  currency={currency}
                />
                <Row
                  label="AC — التكلفة الفعلية"
                  value={evm.ac}
                  formula="Σ expenses.amount (excluding rejected + outstanding advances)"
                  sources={[{ kind: 'fn', label: 'calculateEVM()' }]}
                  currency={currency}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                  <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">CPI</div>
                    <div className="font-mono font-bold">{evm.cpi.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">EV / AC</div>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">SPI</div>
                    <div className="font-mono font-bold">{evm.spi.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">EV / PV</div>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">EAC</div>
                    <div className="font-mono font-bold" dir="ltr">{formatCurrency(evm.eac, currency)}</div>
                    <div className="text-[10px] text-muted-foreground">BAC / CPI</div>
                  </div>
                  <div className="rounded border border-border/60 bg-muted/30 p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">VAC</div>
                    <div className="font-mono font-bold" dir="ltr">{formatCurrency(evm.vac, currency)}</div>
                    <div className="text-[10px] text-muted-foreground">BAC − EAC</div>
                  </div>
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* حراس السلامة */}
        <AccordionItem value="guards" className="border border-border rounded-lg bg-card px-3 md:px-4">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            حراس السلامة (DB Triggers) — الحماية النهائية للـ SSOT
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4 space-y-2 text-xs">
            {[
              ['check_fund_balance', 'يمنع أي مصروف يتجاوز رصيد الدفعة/العهدة (يحسب: مباشر + عهد + سلف + تحويلات)'],
              ['validate_cash_transfer', 'يمنع تحويل نقدي يتجاوز رصيد الدفعة، ويمنع التحويل لعهدة مُقفلة'],
              ['auto_close_custody_on_exhaustion', 'يغلق العهدة تلقائياً عند استنزافها (spent ≥ amount + cash_in)'],
              ['enforce_expense_fund_link', 'يفرض ربط المصروف بدفعة نشطة أو عهدة'],
              ['enforce_single_expense_source', 'يمنع ربط المصروف بدفعة وعهدة معاً (مصدر واحد فقط)'],
              ['recalc_payment_request_from_events', 'يعيد حساب حالة السلفة من settlement_events (SSOT للتسويات)'],
              ['recalc_fund_settlement_spent', 'يعيد حساب إجمالي التسوية من المصروفات الفعلية'],
              ['protect_signed_settlement', 'يمنع تعديل/حذف تسوية موقعة (غير المدير)'],
              ['protect_pr_with_settlements', 'يمنع حذف طلب صرف عليه أحداث تسوية'],
              ['protect_last_owner', 'يمنع حذف/تخفيض آخر Owner للنظام'],
            ].map(([name, desc]) => (
              <div key={name} className="flex items-start gap-2 border-b border-border/40 last:border-b-0 pb-2 last:pb-0">
                <Database className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <div>
                  <code className="text-[11px] font-mono text-warning">{name}</code>
                  <div className="text-muted-foreground mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
