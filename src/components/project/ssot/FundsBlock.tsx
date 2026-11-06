/** Every fund, each live one's draw-down, the cash in hand, and the approved settlements. */
import { formatCurrency } from '@/lib/finance';
import {
  getProjectFundsSummary, getFundDirectSpent, getFundCustodyDraw, getFundOutstandingAdvances, getFundCashTransfersOut,
} from '@/lib/funds';
import type { CashTransfer, Custody, Expense, FundSettlement, PaymentRequest, ProjectFund } from '@/types/project';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Row } from './SsotRow';
import { countAr } from '@/lib/plural';

interface Props {
  projectId: string;
  currency: string;
  funds: ProjectFund[];
  settlements: FundSettlement[];
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
}

export function FundsBlock({ projectId, currency, funds, settlements, expenses, custodies, paymentRequests, cashTransfers }: Props) {
  const fundsSummary = getProjectFundsSummary(
    projectId, funds, settlements, expenses, custodies, paymentRequests, cashTransfers,
  );
  const activeOrAck = funds.filter(
    (f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'),
  );

  return (
    <AccordionItem value="funds" className="border border-border rounded-lg bg-card px-3 md:px-4">
      <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
        الدفعات (Revolving Fund) والنقد بيد المدير
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4">
        <Row
          label={`إجمالي المُحوَّل (${countAr(fundsSummary.fundCount, 'fund')})`}
          value={fundsSummary.totalTransferred}
          formula="Σ project_funds.amount WHERE project_id = ?"
          sources={[{ kind: 'db', label: 'project_funds' }]}
          currency={currency}
          ssotKey="total_transferred_funds" projectId={projectId}
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
                <Badge variant="outline" className="ms-2 text-xs">{f.status}</Badge>
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
          ssotKey="settled_amount" projectId={projectId}
        />


      </AccordionContent>
    </AccordionItem>
  );
}
