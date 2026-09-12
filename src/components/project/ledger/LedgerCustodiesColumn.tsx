/**
 * The ledger's custodies column: each custody with what it holds, what was
 * spent from it (split into direct and request-driven) and its expenses,
 * expandable per custody.
 */
import { formatCurrency } from '@/lib/finance';
import {
  PAYMENT_REQUEST_TYPE_LABELS,
  type CashTransfer,
  type Custody,
  type Expense,
  type PaymentRequest,
  type ProjectFund,
} from '@/types/project';
import { getCustodyBreakdown } from '@/lib/funds';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronLeft, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenSet } from './useOpenSet';

interface Props {
  funds: ProjectFund[];
  custodies: Custody[];
  expenses: Expense[];
  payReqs: PaymentRequest[];
  transfers: CashTransfer[];
  expenseToPayReq: Map<string, PaymentRequest>;
}

export function LedgerCustodiesColumn({ funds, custodies, expenses, payReqs, transfers, expenseToPayReq }: Props) {
  const open = useOpenSet();

  return (
<div className="stat-card">
  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
    <HandCoins className="w-4 h-4" /> العُهد
  </h3>
  {custodies.length === 0 ? (
    <p className="text-xs text-muted-foreground text-center py-4">لا توجد عُهد</p>
  ) : (
    <div className="space-y-2">
      {custodies.map((c) => {
        const bd = getCustodyBreakdown(c, expenses, transfers, payReqs);
        const linked = expenses.filter((e) => e.custodyId === c.id);
        const spent = bd.spent;
        const available = bd.availableAmount;
        const remaining = bd.remaining;
        const fromPR = linked.filter((e) => expenseToPayReq.has(e.id));
        const fromPRTotal = fromPR.reduce((s, e) => s + e.amount, 0);
        const directTotal = spent - fromPRTotal;

        const isOpen = open.isOpen(c.id);
        return (
          <div key={c.id} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => open.toggle(c.id)}
              className="w-full p-3 flex items-center gap-2 text-right hover:bg-muted/50 transition-colors"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{c.resourceName}</span>
                    <Badge className={cn('text-xs', c.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground')}>
                      {c.status === 'active' ? 'نشطة' : 'مغلقة'}
                    </Badge>
                    {c.sourceFundId ? (() => {
                      const sf = funds.find(f => f.id === c.sourceFundId);
                      return sf ? (
                        <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">
                          من دفعة #{sf.fundNumber}
                        </Badge>
                      ) : null;
                    })() : (
                      <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                        غير مربوطة بدفعة
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatCurrency(spent)} / {formatCurrency(available)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, (directTotal / Math.max(1, available)) * 100)}%` }} />
                  <div className="h-full bg-violet-500" style={{ width: `${Math.min(100 - (directTotal / Math.max(1, available)) * 100, (fromPRTotal / Math.max(1, available)) * 100)}%` }} />
                </div>

                <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  <span>مصروفات مباشرة: {formatCurrency(directTotal)}</span>
                  {fromPRTotal > 0 && <span className="text-violet-600">طلبات صرف: {formatCurrency(fromPRTotal)}</span>}
                  <span className={cn(remaining < 0 && 'text-destructive')}>متبقي: {formatCurrency(remaining)}</span>
                </p>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border bg-muted/30 p-2">
                {linked.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">لا توجد مصروفات مرتبطة</p>
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
