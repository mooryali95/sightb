import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import {
  type Expense,
  type Custody,
  type ProjectFund,
  type FundSettlement,
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
} from '@/types/project';
import { getProjectFundsSummary, getFundSpent, getFundRemaining, getSettlementForFund } from '@/lib/funds';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronLeft, Wallet, HandCoins, Banknote, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  funds: ProjectFund[];
  settlements: FundSettlement[];
  expenses: Expense[];
  custodies: Custody[];
}

export function CashLedgerSection({ projectId, funds, settlements, expenses, custodies }: Props) {
  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === projectId),
    [expenses, projectId],
  );

  const summary = useMemo(
    () => getProjectFundsSummary(projectId, funds, settlements, projectExpenses, custodies),
    [projectId, funds, settlements, projectExpenses, custodies],
  );

  const projectFundsList = useMemo(
    () => funds.filter((f) => f.projectId === projectId).sort((a, b) => a.fundNumber - b.fundNumber),
    [funds, projectId],
  );

  const projectCustodies = useMemo(
    () => custodies.filter((c) => c.projectId === projectId),
    [custodies, projectId],
  );

  const custodySpent = (id: string) =>
    projectExpenses.filter((e) => e.custodyId === id).reduce((s, e) => s + e.amount, 0);

  // عُهد نشطة فقط
  const activeCustodies = projectCustodies.filter((c) => c.status === 'active');
  const activeCustodyAmount = activeCustodies.reduce((s, c) => s + c.amount, 0);
  const activeCustodySpent = activeCustodies.reduce((s, c) => s + custodySpent(c.id), 0);
  const inHandsOfHolders = activeCustodyAmount - activeCustodySpent;

  // إجمالي المصروف الموثّق (بدون double counting)
  const directSpend = summary.totalDocumentedSpend;
  const custodyTotalSpend = projectCustodies.reduce((s, c) => s + custodySpent(c.id), 0);
  const totalDocumentedExpense = directSpend + custodyTotalSpend;

  const openFundsCount = projectFundsList.filter((f) => f.status !== 'settled').length;

  const unlinkedExpenses = projectExpenses.filter((e) => !e.fundId && !e.custodyId);
  const unlinkedTotal = unlinkedExpenses.reduce((s, e) => s + e.amount, 0);
  const unlinkedCustodies = projectCustodies.filter((c) => !c.sourceFundId);
  const unlinkedCustodyTotal = unlinkedCustodies.reduce((s, c) => s + c.amount, 0);

  const [openFunds, setOpenFunds] = useState<Set<string>>(new Set());
  const [openCustodies, setOpenCustodies] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    setter(n);
  };

  const transferred = summary.totalTransferred;
  const pct = (v: number) => (transferred > 0 ? (v / transferred) * 100 : 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── البطاقات الأربع: مصدر الأموال ومآلها ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Wallet className="w-3.5 h-3.5" /> إجمالي ما تحوّل من الإدارة
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(summary.totalTransferred)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {projectFundsList.length} دفعة{openFundsCount > 0 ? ` · ${openFundsCount} مفتوحة` : ''}
          </p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Banknote className="w-3.5 h-3.5" /> في يد مدير المشروع
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(summary.remainingInManagerHand)}</p>
          <p className="text-xs text-muted-foreground mt-1">نقد لم يُصرف ولم يُسلَّم كعهدة</p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <HandCoins className="w-3.5 h-3.5" /> في يد حاملي العُهد
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(inHandsOfHolders)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeCustodies.length} عهدة نشطة من أصل {projectCustodies.length}
          </p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Receipt className="w-3.5 h-3.5" /> مصروف موثّق
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(totalDocumentedExpense)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            مباشر: {formatCurrency(directSpend)} · عبر عُهد: {formatCurrency(custodyTotalSpend)}
          </p>
        </Card>
      </div>

      {/* ─── شريط التدفّق المالي ─── */}
      {transferred > 0 && (
        <Card className="p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">مسار توزيع الأموال</p>
            <span className="text-[10px] text-muted-foreground">من إجمالي {formatCurrency(transferred)}</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
            <div className="bg-primary h-full" style={{ width: `${pct(directSpend)}%` }} title={`مصروف مباشر: ${formatCurrency(directSpend)}`} />
            <div className="bg-amber-500 h-full" style={{ width: `${pct(custodyTotalSpend)}%` }} title={`مصروف عبر عُهد: ${formatCurrency(custodyTotalSpend)}`} />
            <div className="bg-orange-300 h-full" style={{ width: `${pct(inHandsOfHolders)}%` }} title={`في يد حاملي العُهد: ${formatCurrency(inHandsOfHolders)}`} />
            <div className="bg-emerald-500 h-full" style={{ width: `${pct(summary.remainingInManagerHand)}%` }} title={`في يد المدير: ${formatCurrency(summary.remainingInManagerHand)}`} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary" /> مصروف مباشر {formatCurrency(directSpend)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" /> صُرف من العُهد {formatCurrency(custodyTotalSpend)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-orange-300" /> بيد حاملي العُهد {formatCurrency(inHandsOfHolders)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> بيد المدير {formatCurrency(summary.remainingInManagerHand)}</span>
          </div>
        </Card>
      )}

      {/* Two columns: Funds + Custodies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funds */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> الدفعات
          </h3>
          {projectFundsList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد دفعات</p>
          ) : (
            <div className="space-y-2">
              {projectFundsList.map((f) => {
                const directSpent = projectExpenses
                  .filter((e) => e.fundId === f.id)
                  .filter((e) => {
                    if (!e.custodyId) return true;
                    const cu = projectCustodies.find((c) => c.id === e.custodyId);
                    return cu?.sourceFundId !== f.id;
                  })
                  .reduce((s, e) => s + e.amount, 0);
                const fundCustodies = projectCustodies.filter((c) => c.sourceFundId === f.id);
                const custodyDraw = fundCustodies.reduce((s, c) => s + c.amount, 0);
                const spent = directSpent + custodyDraw;
                const remaining = f.amount - spent;
                const settlement = getSettlementForFund(f.id, settlements);
                const linked = projectExpenses.filter((e) => e.fundId === f.id && (!e.custodyId || projectCustodies.find(c => c.id === e.custodyId)?.sourceFundId !== f.id));
                const isOpen = openFunds.has(f.id);
                return (
                  <div key={f.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggle(openFunds, setOpenFunds, f.id)}
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
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.min(100, (directSpent / Math.max(1, f.amount)) * 100)}%` }}
                            title="مصروف مباشر"
                          />
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${Math.min(100 - (directSpent / Math.max(1, f.amount)) * 100, (custodyDraw / Math.max(1, f.amount)) * 100)}%` }}
                            title="عُهد مسحوبة"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                          <span>مباشر: {formatCurrency(directSpent)}</span>
                          {custodyDraw > 0 && <span className="text-amber-600">عُهد: {formatCurrency(custodyDraw)}</span>}
                          <span className={cn(remaining < 0 && 'text-destructive')}>متبقي بيد المدير: {formatCurrency(remaining)}</span>
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 p-2 space-y-2">
                        {fundCustodies.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">عُهد مسحوبة من هذه الدفعة:</p>
                            {fundCustodies.map((cu) => {
                              const cuSpent = projectExpenses.filter(e => e.custodyId === cu.id).reduce((s, e) => s + e.amount, 0);
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
                              {linked.map((e) => (
                                <tr key={e.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5">{e.description}</td>
                                  <td className="py-1.5 text-muted-foreground">{e.date}</td>
                                  <td className="py-1.5 font-mono text-left">{formatCurrency(e.amount)}</td>
                                </tr>
                              ))}
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

        {/* Custodies */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <HandCoins className="w-4 h-4" /> العُهد
          </h3>
          {projectCustodies.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد عُهد</p>
          ) : (
            <div className="space-y-2">
              {projectCustodies.map((c) => {
                const spent = custodySpent(c.id);
                const remaining = c.amount - spent;
                const linked = projectExpenses.filter((e) => e.custodyId === c.id);
                const isOpen = openCustodies.has(c.id);
                return (
                  <div key={c.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggle(openCustodies, setOpenCustodies, c.id)}
                      className="w-full p-3 flex items-center gap-2 text-right hover:bg-muted/50 transition-colors"
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm">{c.resourceName}</span>
                            <Badge className={cn(
                              'text-xs',
                              c.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground',
                            )}>
                              {c.status === 'active' ? 'نشطة' : 'مغلقة'}
                            </Badge>
                            {c.sourceFundId ? (() => {
                              const sf = projectFundsList.find(f => f.id === c.sourceFundId);
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
                            {formatCurrency(spent)} / {formatCurrency(c.amount)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              remaining < 0 ? 'bg-destructive' : 'bg-emerald-500',
                            )}
                            style={{ width: `${Math.min(100, (spent / Math.max(1, c.amount)) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {linked.length} مصروف · متبقي: {formatCurrency(remaining)}
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
                              {linked.map((e) => (
                                <tr key={e.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5">{e.description}</td>
                                  <td className="py-1.5 text-muted-foreground">{e.date}</td>
                                  <td className="py-1.5 font-mono text-left">{formatCurrency(e.amount)}</td>
                                </tr>
                              ))}
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
      </div>

      {/* Unlinked expenses warning */}
      {unlinkedExpenses.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            ⚠️ {unlinkedExpenses.length} مصروف غير مرتبط بأي دفعة أو عهدة (إجمالي {formatCurrency(unlinkedTotal)}).
            انتقل لتبويب المصروفات لربطها.
          </p>
        </div>
      )}
    </div>
  );
}
