/**
 * The ledger's funds column: each fund with its spend broken down, the
 * custodies drawn from it and its direct expenses, expandable per fund.
 * Every figure comes from lib/funds; nothing is summed by hand here.
 */
import { formatCurrency } from '@/lib/finance';
import {
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  PAYMENT_REQUEST_TYPE_LABELS,
  type CashTransfer,
  type Custody,
  type Expense,
  type FundSettlement,
  type PaymentRequest,
  type ProjectFund,
} from '@/types/project';
import { getSettlementForFund, getFundRemainingBreakdown, getCustodyBreakdown } from '@/lib/funds';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Info, ChevronDown, ChevronLeft, Wallet, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenSet } from './useOpenSet';

interface Props {
  funds: ProjectFund[];
  custodies: Custody[];
  expenses: Expense[];
  payReqs: PaymentRequest[];
  transfers: CashTransfer[];
  settlements: FundSettlement[];
  expenseToPayReq: Map<string, PaymentRequest>;
}

export function LedgerFundsColumn({ funds, custodies, expenses, payReqs, transfers, settlements, expenseToPayReq }: Props) {
  const open = useOpenSet();
  const custodyBd = (c: Custody) => getCustodyBreakdown(c, expenses, transfers, payReqs);

  return (
<div className="stat-card">
  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
    <Wallet className="w-4 h-4" /> الدفعات
  </h3>
  {funds.length === 0 ? (
    <p className="text-xs text-muted-foreground text-center py-4">لا توجد دفعات</p>
  ) : (
    <div className="space-y-2">
      {funds.map((f) => {
        const bd = getFundRemainingBreakdown(f, expenses, custodies, payReqs, transfers);
        const { direct: directSpent, custodyDraw, outstandingAdvances, cashTransfersOut, spent, remaining } = bd;
        const fundCustodies = custodies.filter((c) => c.sourceFundId === f.id);
        const settlement = getSettlementForFund(f.id, settlements);
        const linked = expenses.filter((e) => e.fundId === f.id && (!e.custodyId || custodies.find(c => c.id === e.custodyId)?.sourceFundId !== f.id));
        const isOpen = open.isOpen(f.id);
        return (
          <div key={f.id} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => open.toggle(f.id)}
              className="w-full p-3 flex items-center gap-2 text-right hover:bg-muted/50 transition-colors"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">دفعة #{f.fundNumber}</span>
                    <Badge className={cn('text-xs', FUND_STATUS_COLORS[f.status])}>
                      {FUND_STATUS_LABELS[f.status]}
                    </Badge>
                    {settlement && (
                      <Badge className={cn('text-xs', SETTLEMENT_STATUS_COLORS[settlement.status])}>
                        {SETTLEMENT_STATUS_LABELS[settlement.status]}
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatCurrency(spent)} / {formatCurrency(f.amount)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, (directSpent / Math.max(1, f.amount)) * 100)}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(100 - (directSpent / Math.max(1, f.amount)) * 100, (custodyDraw / Math.max(1, f.amount)) * 100)}%` }} />
                  <div className="h-full bg-purple-500" style={{ width: `${Math.min(Math.max(0, 100 - ((directSpent + custodyDraw) / Math.max(1, f.amount)) * 100), (cashTransfersOut / Math.max(1, f.amount)) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3">
                  <span>مباشر: {formatCurrency(directSpent)}</span>
                  {custodyDraw > 0 && <span className="text-amber-600">عُهد: {formatCurrency(custodyDraw)}</span>}
                  {outstandingAdvances > 0 && <span className="text-blue-600">سلف قائمة: {formatCurrency(outstandingAdvances)}</span>}
                  {cashTransfersOut > 0 && <span className="text-purple-600">تحويلات نقد: {formatCurrency(cashTransfersOut)}</span>}
                  <span className={cn('flex items-center gap-1', remaining <= 0 && 'text-destructive font-semibold')}>
                    متبقي بيد المدير: {formatCurrency(remaining)}
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 opacity-60" onClick={(e) => e.stopPropagation()} />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="space-y-0.5 font-mono">
                            <div>المبلغ الأصلي: {formatCurrency(bd.amount)}</div>
                            <div>− مباشر: {formatCurrency(bd.direct)}</div>
                            <div>− عُهد مسحوبة: {formatCurrency(bd.custodyDraw)}</div>
                            <div>− سلف قائمة: {formatCurrency(bd.outstandingAdvances)}</div>
                            <div>− تحويلات نقد صادرة: {formatCurrency(bd.cashTransfersOut)}</div>
                            <div className="border-t border-border pt-0.5">= المتبقي: {formatCurrency(bd.remaining)}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </p>
              </div>
            </button>


            {isOpen && (
              <div className="border-t border-border bg-muted/30 p-2 space-y-2">
                {fundCustodies.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">عُهد مسحوبة من هذه الدفعة:</p>
                    {fundCustodies.map((cu) => {
                      // The same figure the custody's own row shows: rejected rows excluded.
                      const cuSpent = custodyBd(cu).spent;
                      return (
                        <div key={cu.id} className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-900/10 px-2 py-1.5 rounded">
                          <span className="flex items-center gap-1.5"><HandCoins className="w-3 h-3" />{cu.resourceName}</span>
                          <span className="font-mono text-muted-foreground">{formatCurrency(cuSpent)} / {formatCurrency(cu.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {linked.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">لا توجد مصروفات مباشرة على الدفعة</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {linked.map((e) => {
                        const pr = expenseToPayReq.get(e.id);
                        return (
                          <tr key={e.id} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{e.description}</span>
                                {pr && (
                                  <Badge variant="outline" className="text-[10px] border-violet-400/50 text-violet-700 dark:text-violet-400">
                                    {PAYMENT_REQUEST_TYPE_LABELS[pr.requestType]}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 text-muted-foreground">{e.date}</td>
                            <td className="py-1.5 font-mono text-left">{formatCurrency(e.amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
  );
}
