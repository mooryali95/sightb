import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import {
  type Expense,
  type Custody,
  type ProjectFund,
  type FundSettlement,
  type PaymentRequest,
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  PAYMENT_REQUEST_TYPE_LABELS,
} from '@/types/project';
import { getProjectFundsSummary, getSettlementForFund, getFundRemainingBreakdown, getCustodyCashTransfersIn, getCustodyBreakdown } from '@/lib/funds';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ChevronDown, ChevronLeft, Wallet, HandCoins, Banknote, Receipt, Clock,
  ArrowDownToLine, FileCheck2, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  funds: ProjectFund[];
  settlements: FundSettlement[];
  expenses: Expense[];
  custodies: Custody[];
}

type TimelineEvent = {
  id: string;
  date: string;
  type: 'fund' | 'custody' | 'expense' | 'payment_request' | 'settlement';
  title: string;
  subtitle?: string;
  amount: number;
  direction: 'in' | 'out' | 'neutral';
  badge?: { label: string; cls: string };
};

export function CashLedgerSection({ projectId, funds, settlements, expenses, custodies }: Props) {
  const reimbursements = useStore((s) => s.reimbursements);
  const paymentRequests = useStore((s) => s.paymentRequests);
  const resourceSettlements = useStore((s) => s.resourceSettlements);
  const resources = useStore((s) => s.resources);
  const cashTransfers = useStore((s) => s.cashTransfers);

  const projectPayReqs = useMemo(
    () => paymentRequests.filter((p) => p.projectId === projectId),
    [paymentRequests, projectId],
  );

  const projectTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );

  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === projectId),
    [expenses, projectId],
  );

  const summary = useMemo(
    () => getProjectFundsSummary(projectId, funds, settlements, projectExpenses, custodies, projectPayReqs, projectTransfers),
    [projectId, funds, settlements, projectExpenses, custodies, projectPayReqs, projectTransfers],
  );

  const projectFundsList = useMemo(
    () => funds.filter((f) => f.projectId === projectId).sort((a, b) => a.fundNumber - b.fundNumber),
    [funds, projectId],
  );

  const projectCustodies = useMemo(
    () => custodies.filter((c) => c.projectId === projectId),
    [custodies, projectId],
  );



  // خريطة: expense.id -> PaymentRequest (للمصروفات المُولَّدة تلقائياً)
  const expenseToPayReq = useMemo(() => {
    const m = new Map<string, PaymentRequest>();
    projectPayReqs.forEach((p) => {
      if (p.autoCreatedExpenseId) m.set(p.autoCreatedExpenseId, p);
    });
    return m;
  }, [projectPayReqs]);

  const custodyBd = (c: typeof projectCustodies[number]) =>
    getCustodyBreakdown(c, projectExpenses, projectTransfers, projectPayReqs);
  const custodySpent = (id: string) =>
    projectExpenses.filter((e) => e.custodyId === id && e.approvalStatus !== 'rejected').reduce((s, e) => s + e.amount, 0);

  const activeCustodies = projectCustodies.filter((c) => c.status === 'active');
  // SSOT: كل الأرقام من getCustodyBreakdown (المتاح = المبلغ + التحويلات الواردة)
  const activeCustodyAmount = activeCustodies.reduce((s, c) => s + custodyBd(c).availableAmount, 0);
  const activeCustodySpent = activeCustodies.reduce((s, c) => s + custodyBd(c).spent, 0);
  const inHandsOfHolders = activeCustodies.reduce((s, c) => s + custodyBd(c).remaining, 0);

  const directSpend = summary.totalDocumentedSpend;
  const custodyTotalSpend = projectCustodies.reduce((s, c) => s + custodyBd(c).spent, 0);

  const totalDocumentedExpense = directSpend + custodyTotalSpend;
  const openFundsCount = projectFundsList.filter((f) => f.status !== 'settled').length;

  // مدفوع لمستحقات موارد (expenses مُولَّدة عبر طلبات صرف)
  const paidToResources = useMemo(
    () => projectPayReqs
      .filter((p) => p.status === 'paid' && p.autoCreatedExpenseId)
      .reduce((s, p) => s + p.amount, 0),
    [projectPayReqs],
  );

  const pendingPayables = useMemo(() => {
    const approvedNotPaid = reimbursements
      .filter((r) => r.projectId === projectId && r.status === 'approved')
      .reduce((s, r) => s + r.amount, 0);
    const inFlightRequests = projectPayReqs
      .filter((p) => ['submitted', 'under_review', 'approved', 'scheduled'].includes(p.status))
      .reduce((s, p) => s + p.amount, 0);
    return { approvedNotPaid, inFlightRequests, total: approvedNotPaid + inFlightRequests };
  }, [reimbursements, projectPayReqs, projectId]);

  const unlinkedExpenses = projectExpenses.filter((e) => !e.fundId && !e.custodyId);
  const unlinkedTotal = unlinkedExpenses.reduce((s, e) => s + e.amount, 0);
  const unlinkedCustodies = projectCustodies.filter((c) => !c.sourceFundId);
  const unlinkedCustodyTotal = unlinkedCustodies.reduce((s, c) => s + c.amount, 0);

  const [openFunds, setOpenFunds] = useState<Set<string>>(new Set());
  const [openCustodies, setOpenCustodies] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };

  const transferred = summary.totalTransferred;
  const pct = (v: number) => (transferred > 0 ? (v / transferred) * 100 : 0);

  // ─── العمليات (Timeline) ───
  const timeline = useMemo<TimelineEvent[]>(() => {
    const evs: TimelineEvent[] = [];
    projectFundsList.forEach((f) => evs.push({
      id: `f-${f.id}`, date: f.transferDate || f.createdAt,
      type: 'fund', title: `دفعة #${f.fundNumber} — ${FUND_STATUS_LABELS[f.status]}`,
      subtitle: f.notes, amount: f.amount, direction: 'in',
      badge: { label: 'دفعة', cls: 'bg-primary/15 text-primary' },
    }));
    projectCustodies.forEach((c) => {
      const sf = projectFundsList.find((f) => f.id === c.sourceFundId);
      evs.push({
        id: `c-${c.id}`, date: c.receivedDate || c.createdAt,
        type: 'custody', title: `عهدة لـ ${c.resourceName}`,
        subtitle: sf ? `من دفعة #${sf.fundNumber}` : 'غير مربوطة بدفعة',
        amount: c.amount, direction: 'out',
        badge: { label: 'سحب عهدة', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
      });
    });
    projectExpenses.forEach((e) => {
      const pr = expenseToPayReq.get(e.id);
      const r = resources.find((x) => x.id === e.resourceId);
      const cu = e.custodyId ? projectCustodies.find((c) => c.id === e.custodyId) : null;
      const subtitle = pr
        ? `طلب صرف ${PAYMENT_REQUEST_TYPE_LABELS[pr.requestType]}${r ? ` — ${r.name}` : ''}`
        : cu ? `من عهدة ${cu.resourceName}` : e.fundId ? 'مباشر من الدفعة' : 'غير مربوط';
      evs.push({
        id: `e-${e.id}`, date: e.date,
        type: 'expense', title: e.description,
        subtitle, amount: e.amount, direction: 'out',
        badge: pr
          ? { label: 'من طلب صرف', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' }
          : cu
            ? { label: 'من عهدة', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
            : { label: 'مباشر', cls: 'bg-primary/15 text-primary' },
      });
    });
    projectPayReqs.filter((p) => p.status === 'paid').forEach((p) => {
      // إن كان له expense تلقائي، فلا نُكرّره كحدث مالي (الـexpense يمثّله) — نضيفه فقط بدون مبلغ
      if (p.autoCreatedExpenseId) return;
      const r = resources.find((x) => x.id === p.resourceId);
      evs.push({
        id: `pr-${p.id}`, date: p.paidDate || p.updatedAt,
        type: 'payment_request',
        title: `صرف ${PAYMENT_REQUEST_TYPE_LABELS[p.requestType]}${r ? ` لـ ${r.name}` : ''}`,
        subtitle: p.description, amount: p.amount, direction: 'out',
        badge: { label: 'طلب صرف', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
      });
    });
    // ردود نقدية للسلف (cash_refund) — تظهر كحركة inflow في السجل
    projectPayReqs
      .filter((p) => p.requestType === 'advance' && (p.refundedAmount ?? 0) > 0)
      .forEach((p) => {
        const r = resources.find((x) => x.id === p.resourceId);
        evs.push({
          id: `rf-${p.id}`,
          date: p.advanceSettledAt || p.updatedAt,
          type: 'payment_request',
          title: `رد سلفة نقدية${r ? ` من ${r.name}` : ''}`,
          subtitle: p.isAdvanceOutstanding
            ? `رد جزئي — متبقي ${formatCurrency(Math.max(p.amount - (p.refundedAmount ?? 0), 0))}`
            : 'رد كامل',
          amount: p.refundedAmount ?? 0,
          direction: 'in',
          badge: { label: 'رد سلفة', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
        });
      });
    settlements.filter((s) => s.projectId === projectId).forEach((st) => evs.push({
      id: `s-${st.id}`, date: st.settlementDate || st.createdAt,
      type: 'settlement',
      title: `تسوية دفعة — ${SETTLEMENT_STATUS_LABELS[st.status]}`,
      subtitle: `مصروف ${formatCurrency(st.totalSpent)} · متبقي ${formatCurrency(st.remainingCash)}`,
      amount: st.totalSpent, direction: 'neutral',
      badge: { label: 'تسوية', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    }));
    resourceSettlements.filter((s) => s.projectId === projectId && s.status === 'signed').forEach((s) => {
      const r = resources.find((x) => x.id === s.resourceId);
      evs.push({
        id: `rs-${s.id}`, date: s.signedAt || s.updatedAt,
        type: 'settlement', title: `مخالصة مورد${r ? ` — ${r.name}` : ''}`,
        subtitle: `إجمالي ${formatCurrency(s.totalOwed)}`,
        amount: s.totalOwed, direction: 'neutral',
        badge: { label: 'مخالصة', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
      });
    });
    return evs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [projectFundsList, projectCustodies, projectExpenses, projectPayReqs, settlements, resourceSettlements, resources, expenseToPayReq, projectId]);

  return (
    <div className="space-y-4">
      {/* ─── البطاقات: مصدر الأموال ومآلها ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Wallet className="w-3.5 h-3.5" /> إجمالي ما تحوّل
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(summary.totalTransferred)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {projectFundsList.length} دفعة{openFundsCount > 0 ? ` · ${openFundsCount} مفتوحة` : ''}
          </p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Banknote className="w-3.5 h-3.5" /> بيد مدير المشروع
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(summary.remainingInManagerHand)}</p>
          <p className="text-xs text-muted-foreground mt-1">نقد لم يُصرف ولم يُسلَّم عهدة</p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <HandCoins className="w-3.5 h-3.5" /> بيد حاملي العُهد
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(inHandsOfHolders)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeCustodies.length}/{projectCustodies.length} عهدة نشطة
          </p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Receipt className="w-3.5 h-3.5" /> مصروف موثّق
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(totalDocumentedExpense)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            مباشر {formatCurrency(directSpend)} · عُهد {formatCurrency(custodyTotalSpend)}
          </p>
        </Card>

        <Card className="p-4 rounded-xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Send className="w-3.5 h-3.5" /> مدفوع لمستحقات موارد
          </div>
          <p className="text-lg font-mono font-semibold">{formatCurrency(paidToResources)}</p>
          <p className="text-xs text-muted-foreground mt-1">طلبات صرف مدفوعة (داخل المصروف الموثّق)</p>
        </Card>
      </div>

      {/* ─── شريط التدفّق ─── */}
      {transferred > 0 && (
        <Card className="p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">مسار توزيع الأموال</p>
            <span className="text-[10px] text-muted-foreground">من إجمالي {formatCurrency(transferred)}</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
            <div className="bg-primary h-full" style={{ width: `${pct(directSpend)}%` }} title={`مصروف مباشر: ${formatCurrency(directSpend)}`} />
            <div className="bg-amber-500 h-full" style={{ width: `${pct(custodyTotalSpend)}%` }} title={`مصروف عبر عُهد: ${formatCurrency(custodyTotalSpend)}`} />
            <div className="bg-orange-300 h-full" style={{ width: `${pct(inHandsOfHolders)}%` }} title={`بيد حاملي العُهد: ${formatCurrency(inHandsOfHolders)}`} />
            <div className="bg-emerald-500 h-full" style={{ width: `${pct(summary.remainingInManagerHand)}%` }} title={`بيد المدير: ${formatCurrency(summary.remainingInManagerHand)}`} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary" /> مصروف مباشر {formatCurrency(directSpend)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500" /> صُرف من العُهد {formatCurrency(custodyTotalSpend)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-orange-300" /> بيد حاملي العُهد {formatCurrency(inHandsOfHolders)}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> بيد المدير {formatCurrency(summary.remainingInManagerHand)}</span>
          </div>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-2 w-full md:w-fit">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="timeline">العمليات ({timeline.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
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
                    const bd = getFundRemainingBreakdown(f, projectExpenses, projectCustodies, projectPayReqs, projectTransfers);
                    const { direct: directSpent, custodyDraw, outstandingAdvances, cashTransfersOut, spent, remaining } = bd;
                    const fundCustodies = projectCustodies.filter((c) => c.sourceFundId === f.id);
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
                    const bd = getCustodyBreakdown(c, projectExpenses, projectTransfers, projectPayReqs);
                    const linked = projectExpenses.filter((e) => e.custodyId === c.id);
                    const spent = bd.spent;
                    const available = bd.availableAmount;
                    const remaining = bd.remaining;
                    const fromPR = linked.filter((e) => expenseToPayReq.has(e.id));
                    const fromPRTotal = fromPR.reduce((s, e) => s + e.amount, 0);
                    const directTotal = spent - fromPRTotal;

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
                                <Badge className={cn('text-xs', c.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'bg-muted text-muted-foreground')}>
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
          </div>

          {/* مستحقات معلّقة */}
          {pendingPayables.total > 0 && (
            <Card className="p-3 rounded-xl border-amber-300/40 bg-amber-50/40 dark:bg-amber-900/10">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    مستحقات موارد معلّقة — لم تُصرف بعد (لا تُطرح من النقد)
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <span>استردادات معتمدة بانتظار الدفع: <strong className="font-mono text-foreground">{formatCurrency(pendingPayables.approvedNotPaid)}</strong></span>
                    <span>طلبات صرف قيد المعالجة: <strong className="font-mono text-foreground">{formatCurrency(pendingPayables.inFlightRequests)}</strong></span>
                    <span>الإجمالي: <strong className="font-mono text-foreground">{formatCurrency(pendingPayables.total)}</strong></span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {unlinkedCustodies.length > 0 && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5">
              <p className="text-sm text-destructive">
                ⚠️ {unlinkedCustodies.length} عُهدة غير مربوطة بدفعة (إجمالي {formatCurrency(unlinkedCustodyTotal)}).
                اربطها من تبويب «العُهد».
              </p>
            </div>
          )}
          {unlinkedExpenses.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                ⚠️ {unlinkedExpenses.length} مصروف غير مرتبط بأي دفعة أو عهدة (إجمالي {formatCurrency(unlinkedTotal)}).
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card className="p-3 rounded-xl">
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد عمليات بعد</p>
            ) : (
              <ol className="relative border-r border-border pr-4 space-y-3">
                {timeline.map((ev) => {
                  const Icon = ev.type === 'fund' ? Wallet
                    : ev.type === 'custody' ? HandCoins
                    : ev.type === 'expense' ? Receipt
                    : ev.type === 'payment_request' ? Send
                    : FileCheck2;
                  const dirCls = ev.direction === 'in' ? 'text-emerald-600' : ev.direction === 'out' ? 'text-destructive' : 'text-muted-foreground';
                  const sign = ev.direction === 'in' ? '+' : ev.direction === 'out' ? '−' : '';
                  return (
                    <li key={ev.id} className="relative">
                      <span className="absolute -right-[22px] top-1.5 w-3 h-3 rounded-full bg-background border-2 border-border" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{ev.title}</p>
                              {ev.badge && (
                                <Badge variant="outline" className={cn('text-[10px] border-transparent', ev.badge.cls)}>
                                  {ev.badge.label}
                                </Badge>
                              )}
                            </div>
                            {ev.subtitle && (
                              <p className="text-[11px] text-muted-foreground truncate">{ev.subtitle}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">{ev.date}</p>
                          </div>
                        </div>
                        <p className={cn('font-mono text-sm shrink-0', dirCls)}>
                          {sign}{formatCurrency(ev.amount)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
