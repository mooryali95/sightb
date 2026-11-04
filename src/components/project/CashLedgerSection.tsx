import { useMemo } from 'react';
import { formatCurrency } from '@/lib/finance';
import {
  type Expense,
  type Custody,
  type ProjectFund,
  type FundSettlement,
  type PaymentRequest,
} from '@/types/project';
import { getProjectFundsSummary, getCustodyBreakdown } from '@/lib/funds';
import { useStore } from '@/store/useStore';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Wallet, HandCoins, Banknote, Receipt, Clock, Send } from 'lucide-react';
import { LedgerFundsColumn } from './ledger/LedgerFundsColumn';
import { LedgerCustodiesColumn } from './ledger/LedgerCustodiesColumn';
import { LedgerTimeline } from './ledger/LedgerTimeline';
import { buildLedgerTimeline } from './ledger/buildLedgerTimeline';

interface Props {
  projectId: string;
  funds: ProjectFund[];
  settlements: FundSettlement[];
  expenses: Expense[];
  custodies: Custody[];
}

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

  const activeCustodies = projectCustodies.filter((c) => c.status === 'active');
  // SSOT: كل الأرقام من getCustodyBreakdown (المتاح = المبلغ + التحويلات الواردة)
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

  const transferred = summary.totalTransferred;
  const pct = (v: number) => (transferred > 0 ? (v / transferred) * 100 : 0);

  const timeline = useMemo(
    () => buildLedgerTimeline({
      projectId, funds: projectFundsList, custodies: projectCustodies, expenses: projectExpenses,
      payReqs: projectPayReqs, settlements, resourceSettlements, resources, expenseToPayReq,
    }),
    [projectId, projectFundsList, projectCustodies, projectExpenses, projectPayReqs, settlements, resourceSettlements, resources, expenseToPayReq],
  );

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
            <span className="text-xs text-muted-foreground">من إجمالي {formatCurrency(transferred)}</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
            <div className="bg-primary h-full" style={{ width: `${pct(directSpend)}%` }} title={`مصروف مباشر: ${formatCurrency(directSpend)}`} />
            <div className="bg-amber-500 h-full" style={{ width: `${pct(custodyTotalSpend)}%` }} title={`مصروف عبر عُهد: ${formatCurrency(custodyTotalSpend)}`} />
            <div className="bg-orange-300 h-full" style={{ width: `${pct(inHandsOfHolders)}%` }} title={`بيد حاملي العُهد: ${formatCurrency(inHandsOfHolders)}`} />
            <div className="bg-emerald-500 h-full" style={{ width: `${pct(summary.remainingInManagerHand)}%` }} title={`بيد المدير: ${formatCurrency(summary.remainingInManagerHand)}`} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
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
            <LedgerFundsColumn
              funds={projectFundsList}
              custodies={projectCustodies}
              expenses={projectExpenses}
              payReqs={projectPayReqs}
              transfers={projectTransfers}
              settlements={settlements}
              expenseToPayReq={expenseToPayReq}
            />
            <LedgerCustodiesColumn
              funds={projectFundsList}
              custodies={projectCustodies}
              expenses={projectExpenses}
              payReqs={projectPayReqs}
              transfers={projectTransfers}
              expenseToPayReq={expenseToPayReq}
            />
          </div>

          {/* مستحقات معلّقة */}
          {pendingPayables.total > 0 && (
            <Card className="p-3 rounded-xl border-amber-300/40 bg-amber-50/40 dark:bg-amber-900/10">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 mt-0.5 text-warning dark:text-amber-400" />
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
          <LedgerTimeline events={timeline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
