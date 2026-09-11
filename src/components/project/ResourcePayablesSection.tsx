import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  exportOutstandingAdvancesExcel,
  exportOutstandingAdvancesPDF,
  exportSettlementEventsExcel,
  exportSettlementEventsPDF,
  type OutstandingAdvanceRow,
  type SettlementEventRow,
} from '@/lib/export-lazy';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import {
  getResourceBalance,
  defaultSettlementText,
  calcSettlementTotals,
} from '@/lib/resource-payables';
import { exportPayablesSummaryCSV } from '@/lib/payables-export';
import {
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentRequest,
} from '@/types/project';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getFundRemaining, getCustodyCashTransfersIn, getCustodyOutstandingAdvances } from '@/lib/funds';
import { HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { usePayablesScope } from './payables/usePayablesScope';
import { PayablesScopeBar } from './payables/PayablesScopeBar';
import { PayablesSummaryCards } from './payables/PayablesSummaryCards';
import { ReimbursementsTab } from './payables/ReimbursementsTab';
import { SettlementsTab } from './payables/SettlementsTab';
import { PaymentRequestsTab } from './payables/PaymentRequestsTab';
import { NewPaymentRequestDialog, type NewPaymentRequestPreset } from './payables/NewPaymentRequestDialog';
import { SettleAdvanceDialog } from './payables/SettleAdvanceDialog';

interface Props {
  projectId: string;
  companyName?: string;
  projectName?: string;
  readOnly?: boolean;
}

export function ResourcePayablesSection({ projectId, companyName = '', projectName = '', readOnly = false }: Props) {
  const { isAdminFor, canEdit: canEditRole } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const canEdit = !readOnly && canEditRole('project', projectId);

  const {
    projectFunds, custodies, expenses, settlementEvents, loadSettlementEventsForRequest,
    rejectReimbursement, rejectPaymentRequest, payPaymentRequest,
    updatePaymentRequest, createResourceSettlement,
  } = useStore();

  const {
    scope, setScope,
    projBudgetItems, projResources, projAllReimbs, projReimbs, projVendorReimbs,
    projReqs, projSettles, summary, scopedReimbs,
  } = usePayablesScope(projectId);

  // ─── New payment request dialog ───
  // The dialog owns its form state; it remounts (via `key`) on every open so a
  // preset from the balances table starts a clean form, and closing needs no
  // explicit reset.
  const [reqOpen, setReqOpen] = useState(false);
  const [reqSession, setReqSession] = useState(0);
  const [reqPreset, setReqPreset] = useState<NewPaymentRequestPreset | undefined>(undefined);
  const openNewRequest = (preset?: NewPaymentRequestPreset) => {
    setReqPreset(preset);
    setReqSession((n) => n + 1);
    setReqOpen(true);
  };

  // ─── Edit links dialog (re-link reimbursements to existing payment request) ───
  const [editLinksId, setEditLinksId] = useState<string | null>(null);
  const [editLinkedIds, setEditLinkedIds] = useState<string[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const editingReq = useMemo(
    () => projReqs.find((r) => r.id === editLinksId),
    [projReqs, editLinksId],
  );
  const editEligibleReimbs = useMemo(() => {
    if (!editingReq) return [];
    // Show approved reimbursements for the same resource, plus already-linked ones (even if not approved)
    return projReimbs.filter(
      (r) => r.resourceId === editingReq.resourceId
        && (r.status === 'approved' || editLinkedIds.includes(r.id) || (editingReq.linkedReimbursementIds || []).includes(r.id)),
    );
  }, [editingReq, projReimbs, editLinkedIds]);

  const openEditLinks = (reqId: string) => {
    const req = projReqs.find((r) => r.id === reqId);
    if (!req) return;
    setEditLinksId(reqId);
    setEditLinkedIds([...(req.linkedReimbursementIds || [])]);
    setEditDescription(req.description || '');
  };

  const handleSaveEditLinks = async () => {
    if (!editLinksId || !editingReq) return;
    try {
      const updates: Partial<PaymentRequest> = {
        linkedReimbursementIds: editLinkedIds,
        description: editDescription.trim() || editingReq.description,
      };
      // If reimbursement type and not yet paid, recompute amount from linked items
      if (editingReq.requestType === 'reimbursement' && editingReq.status !== 'paid') {
        const newAmount = projReimbs
          .filter((r) => editLinkedIds.includes(r.id))
          .reduce((s, r) => s + r.amount, 0);
        if (newAmount > 0) updates.amount = newAmount;
      }
      await updatePaymentRequest(editLinksId, updates);
      toast.success('تم تحديث ربط البنود');
      setEditLinksId(null);
    } catch (e) {
      toast.error(errorMessage(e, 'فشل التحديث'));
    }
  };


  // ─── Payment dialog ───
  const [payDialogId, setPayDialogId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [paySource, setPaySource] = useState<'fund' | 'custody'>('fund');
  const [paySourceFundId, setPaySourceFundId] = useState<string>('');
  const [paySourceCustodyId, setPaySourceCustodyId] = useState<string>('');

  const payingReq = useMemo(
    () => projReqs.find((r) => r.id === payDialogId),
    [projReqs, payDialogId],
  );

  const cashTransfers = useStore((s) => s.cashTransfers);
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );

  // Active funds (transferred/acknowledged) with remaining balance
  const availableFunds = useMemo(() => {
    return projectFunds
      .filter((f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'))
      .map((f) => ({
        fund: f,
        remaining: getFundRemaining(
          f,
          expenses.filter((e) => e.projectId === projectId),
          custodies.filter((c) => c.projectId === projectId),
          projReqs,
          projTransfers,
        ),
      }))
      .filter((x) => x.remaining > 0);
  }, [projectFunds, expenses, custodies, projectId, projReqs, projTransfers]);

  // Active custodies with remaining balance (يشمل التحويلات الواردة ويخصم السلف القائمة) — توحيد مع availableFunds
  const availableCustodies = useMemo(() => {
    return custodies
      .filter((c) => c.projectId === projectId && c.status === 'active')
      .map((c) => {
        const spent = expenses
          .filter((e) => e.custodyId === c.id)
          .reduce((s, e) => s + e.amount, 0);
        const transfersIn = getCustodyCashTransfersIn(c.id, projTransfers);
        const outstandingAdv = getCustodyOutstandingAdvances(c.id, projReqs);
        return { custody: c, remaining: (c.amount + transfersIn) - spent - outstandingAdv };
      })
      .filter((x) => x.remaining > 0);
  }, [custodies, expenses, projectId, projTransfers, projReqs]);


  const openPayDialog = (reqId: string, scheduledDate?: string) => {
    setPayDialogId(reqId);
    setPayDate(scheduledDate || new Date().toISOString().split('T')[0]);
    // auto-pick first available fund as default source
    if (availableFunds.length > 0) {
      setPaySource('fund');
      setPaySourceFundId(availableFunds[0].fund.id);
    } else if (availableCustodies.length > 0) {
      setPaySource('custody');
      setPaySourceCustodyId(availableCustodies[0].custody.id);
    } else {
      // Nothing to draw from. Leave the fund radio selected with no fund
      // chosen, which keeps the confirm control disabled until a source exists.
      setPaySource('fund');
      setPaySourceFundId('');
      setPaySourceCustodyId('');
    }
  };

  const handlePay = async () => {
    if (!payDialogId || !payingReq) return;
    // Exactly one source: a fund or a custody. The database accepts a payment
    // with neither, but an expense that belongs to no fund and no custody
    // leaves cash integrity with nothing to reconcile it against — so the
    // dialog never offers it.
    // Balance check
    if (paySource === 'fund') {
      if (!paySourceFundId) { toast.error('اختر الدفعة المصدر'); return; }
      const f = availableFunds.find((x) => x.fund.id === paySourceFundId);
      if (!f) { toast.error('الدفعة المختارة غير متوفرة'); return; }
      if (f.remaining < payingReq.amount) {
        toast.error(`رصيد الدفعة غير كافٍ. المتاح: ${formatCurrency(f.remaining)}`); return;
      }
    } else if (paySource === 'custody') {
      if (!paySourceCustodyId) { toast.error('اختر العهدة المصدر'); return; }
      const c = availableCustodies.find((x) => x.custody.id === paySourceCustodyId);
      if (!c) { toast.error('العهدة المختارة غير متوفرة'); return; }
      if (c.remaining < payingReq.amount) {
        toast.error(`رصيد العهدة غير كافٍ. المتاح: ${formatCurrency(c.remaining)}`); return;
      }
    }
    try {
      await payPaymentRequest(payDialogId, {
        paidDate: payDate, paymentMethod: payMethod,
        paymentReference: payRef,
        paidFromFundId: paySource === 'fund' ? paySourceFundId : null,
        paidFromCustodyId: paySource === 'custody' ? paySourceCustodyId : null,
      });
      toast.success('تم تأكيد الدفع وتسجيل المصروف تلقائياً');
      setPayDialogId(null); setPayRef('');
      setPaySourceFundId(''); setPaySourceCustodyId('');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  // ─── Reject reason dialog ───
  const [rejectId, setRejectId] = useState<{ id: string; kind: 'reimb' | 'req' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) {
      toast.error('سبب الرفض مطلوب'); return;
    }
    try {
      if (rejectId.kind === 'reimb') {
        await rejectReimbursement(rejectId.id, rejectReason);
      } else {
        await rejectPaymentRequest(rejectId.id, rejectReason);
      }
      toast.success('تم الرفض');
      setRejectId(null); setRejectReason('');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  // ─── Settlement dialog ───
  const [settleOpen, setSettleOpen] = useState(false);
  const [sResourceId, setSResourceId] = useState('');
  const [sFrom, setSFrom] = useState('');
  const [sTo, setSTo] = useState(new Date().toISOString().split('T')[0]);
  const [sText, setSText] = useState('');

  const sResource = useMemo(
    () => projResources.find((r) => r.id === sResourceId),
    [projResources, sResourceId],
  );
  const sReimbsForRes = useMemo(
    () => projReimbs.filter((r) => r.resourceId === sResourceId
      && (r.status === 'approved' || r.status === 'reimbursed')),
    [projReimbs, sResourceId],
  );
  const sPaidReqs = useMemo(
    () => projReqs.filter((p) => p.resourceId === sResourceId && p.status === 'paid'),
    [projReqs, sResourceId],
  );
  const sTotals = useMemo(
    () => calcSettlementTotals(
      sReimbsForRes, sPaidReqs,
      sReimbsForRes.map((r) => r.id),
      sPaidReqs.map((p) => p.id),
    ),
    [sReimbsForRes, sPaidReqs],
  );

  const openSettlement = (resourceId: string) => {
    setSResourceId(resourceId);
    const res = projResources.find((r) => r.id === resourceId);
    const reimbs = projReimbs.filter((r) => r.resourceId === resourceId
      && (r.status === 'approved' || r.status === 'reimbursed'));
    const paid = projReqs.filter((p) => p.resourceId === resourceId && p.status === 'paid');
    const totals = calcSettlementTotals(reimbs, paid, reimbs.map((r) => r.id), paid.map((p) => p.id));
    const txt = defaultSettlementText(
      res?.name || '',
      companyName,
      projectName,
      sFrom || '—',
      sTo,
      Math.abs(totals.balance) || totals.totalOwed,
    );
    setSText(txt);
    setSettleOpen(true);
  };

  const handleCreateSettlement = async () => {
    if (!sResourceId) return;
    try {
      await createResourceSettlement({
        resourceId: sResourceId, projectId,
        periodFrom: sFrom || undefined, periodTo: sTo || undefined,
        linkedReimbursementIds: sReimbsForRes.map((r) => r.id),
        linkedPaymentIds: sPaidReqs.map((p) => p.id),
        totalOwed: sTotals.totalOwed, totalPaid: sTotals.totalPaid,
        settlementTextAr: sText,
      });
      toast.success('تم إنشاء المخالصة كمسودة');
      // Auto-sign for admin? Leave for separate action
      setSettleOpen(false); setSResourceId(''); setSText('');
    } catch (e) { toast.error(errorMessage(e)); }
  };

  // ─── Outstanding advances (paid but not settled) ───
  const outstandingAdvances = useMemo(
    () => projReqs.filter(
      (r) => r.requestType === 'advance' && r.status === 'paid' && r.isAdvanceOutstanding,
    ),
    [projReqs],
  );
  const outstandingAdvancesTotal = outstandingAdvances.reduce(
    (s, r) => s + Math.max(r.amount - (r.refundedAmount ?? 0), 0), 0,
  );
  const oldestAdvanceDays = useMemo(() => {
    if (outstandingAdvances.length === 0) return 0;
    const now = Date.now();
    return Math.max(
      ...outstandingAdvances.map((r) => {
        const t = r.paidDate ? new Date(r.paidDate).getTime() : new Date(r.createdAt).getTime();
        return Math.floor((now - t) / (1000 * 60 * 60 * 24));
      }),
    );
  }, [outstandingAdvances]);

  // ─── Compute age days per advance ───
  // Closes over nothing, so an empty dep list keeps the identity stable and
  // lets the alert effect below depend on it without re-firing every render.
  const advanceAgeDays = useCallback((req: typeof outstandingAdvances[number]): number => {
    const t = req.paidDate ? new Date(req.paidDate).getTime() : new Date(req.createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
  }, []);

  // ─── Aging toast alerts (once per session per advance/threshold) ───
  const agingAlerted = useRef<Set<string>>(new Set());
  useEffect(() => {
    outstandingAdvances.forEach((req) => {
      const days = advanceAgeDays(req);
      const res = projResources.find((r) => r.id === req.resourceId);
      const name = res?.name || '—';
      const thresholds: { key: string; min: number; fn: typeof toast.error; label: string }[] = [
        { key: `90-${req.id}`, min: 90, fn: toast.error, label: 'حرجة' },
        { key: `60-${req.id}`, min: 60, fn: toast.warning, label: 'متأخرة' },
        { key: `30-${req.id}`, min: 30, fn: toast.info, label: 'تحتاج متابعة' },
      ];
      for (const t of thresholds) {
        if (days >= t.min && !agingAlerted.current.has(t.key)) {
          agingAlerted.current.add(t.key);
          t.fn(`سلفة ${t.label}: ${name} — منذ ${days} يومًا`, {
            description: `المتبقي: ${formatCurrency(Math.max(req.amount - (req.refundedAmount ?? 0), 0))}`,
            duration: t.min >= 90 ? 12000 : 8000,
          });
          break;
        }
      }
    });
  }, [outstandingAdvances, projResources, advanceAgeDays]);

  // ─── Lazy-load settlement events for all advances of this project (once each) ───
  const eventsLoaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    const targets = projReqs.filter(
      (r) => r.requestType === 'advance' && r.status === 'paid' && !eventsLoaded.current.has(r.id),
    );
    if (targets.length === 0) return;
    targets.forEach((r) => {
      eventsLoaded.current.add(r.id);
      loadSettlementEventsForRequest(r.id).catch(() => {});
    });
  }, [projReqs, loadSettlementEventsForRequest]);



  // ─── Export rows builders ───
  const buildOutstandingRows = (): OutstandingAdvanceRow[] =>
    outstandingAdvances.map((req) => {
      const res = projResources.find((r) => r.id === req.resourceId);
      const settled = req.refundedAmount ?? 0;
      const remaining = Math.max(req.amount - settled, 0);
      let source = '—';
      if (req.paidFromFundId) {
        const f = projectFunds.find((x) => x.id === req.paidFromFundId);
        source = `دفعة${f?.fundNumber ? ` #${f.fundNumber}` : ''}`;
      } else if (req.paidFromCustodyId) {
        const c = custodies.find((x) => x.id === req.paidFromCustodyId);
        source = `عهدة${c?.resourceName ? ` (${c.resourceName})` : ''}`;
      }
      return {
        resourceName: res?.name || '—',
        paidDate: req.paidDate || String(req.createdAt).split('T')[0],
        originalAmount: req.amount,
        settledAmount: settled,
        remainingAmount: remaining,
        ageDays: advanceAgeDays(req),
        source,
        description: req.description,
      };
    });

  const buildSettlementEventRows = (): SettlementEventRow[] => {
    const projReqIds = new Set(projReqs.map((r) => r.id));
    return settlementEvents
      .filter((e) => projReqIds.has(e.paymentRequestId))
      .map((e) => {
        const req = projReqs.find((r) => r.id === e.paymentRequestId);
        const res = req ? projResources.find((r) => r.id === req.resourceId) : undefined;
        let overflowAmount: number | undefined;
        let overflowSource: string | undefined;
        if (e.overflowExpenseId) {
          const exp = expenses.find((x) => x.id === e.overflowExpenseId);
          if (exp) {
            overflowAmount = Number(exp.amount);
            if (exp.fundId) {
              const f = projectFunds.find((x) => x.id === exp.fundId);
              overflowSource = `دفعة${f?.fundNumber ? ` #${f.fundNumber}` : ''}`;
            } else if (exp.custodyId) {
              const c = custodies.find((x) => x.id === exp.custodyId);
              overflowSource = `عهدة${c?.resourceName ? ` (${c.resourceName})` : ''}`;
            }
          }
        }
        return {
          date: String(e.createdAt).split('T')[0],
          resourceName: res?.name || '—',
          eventType: e.eventType,
          amount: Number(e.amount),
          overflowAmount,
          overflowSource,
          // The column is nullable; the export row treats "absent" as undefined.
          notes: e.notes ?? undefined,
        };
      });
  };



  // ─── Settle advance dialog ───
  // The dialog owns its form state and remounts (via `key`) on every open, so
  // it starts from the advance's current remainder each time.
  const [settleAdvanceId, setSettleAdvanceId] = useState<string | null>(null);
  const [settleSession, setSettleSession] = useState(0);
  const settlingAdvance = useMemo(
    () => projReqs.find((r) => r.id === settleAdvanceId),
    [projReqs, settleAdvanceId],
  );
  const openSettleAdvance = (id: string) => {
    setSettleAdvanceId(id);
    setSettleSession((n) => n + 1);
    // Load settlement events for this PR
    loadSettlementEventsForRequest(id).catch(console.warn);
  };

  return (
    <div className="space-y-6">
      <PayablesScopeBar
        scope={scope}
        onScopeChange={setScope}
        resourceCount={projReimbs.length}
        vendorCount={projVendorReimbs.length}
        onExportCsv={() => exportPayablesSummaryCSV({
          projectId,
          projectName: projectName || 'Project',
          resources: projResources,
          reimbursements: projAllReimbs,
          paymentRequests: projReqs,
          settlements: projSettles,
        })}
      />

      <PayablesSummaryCards
        scope={scope}
        totalApprovedAmount={summary.totalApprovedAmount}
        totalPaidAmount={summary.totalPaidAmount}
        totalOutstandingAmount={summary.totalOutstandingAmount}
        pendingRequestsCount={summary.pendingRequestsCount}
        outstandingAdvancesTotal={outstandingAdvancesTotal}
        outstandingAdvancesCount={outstandingAdvances.length}
        oldestAdvanceDays={oldestAdvanceDays}
      />

      {/* Export bar for advances and settlement events */}
      {(outstandingAdvances.length > 0 || settlementEvents.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {outstandingAdvances.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-4 w-4" /> تصدير السلف القائمة
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportOutstandingAdvancesPDF(buildOutstandingRows(), projectName || 'Project')}>
                  <FileDown className="h-4 w-4 ml-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportOutstandingAdvancesExcel(buildOutstandingRows(), projectName || 'Project')}>
                  <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {buildSettlementEventRows().length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-4 w-4" /> تصدير سجل التسويات
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportSettlementEventsPDF(buildSettlementEventRows(), projectName || 'Project')}>
                  <FileDown className="h-4 w-4 ml-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportSettlementEventsExcel(buildSettlementEventRows(), projectName || 'Project')}>
                  <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}



      {/* Resources balances */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">أرصدة الموارد</h3>
        </div>
        {projResources.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد موارد بشرية في هذا المشروع.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right py-2">المورد</th>
                  <th className="text-right py-2">المعتمد</th>
                  <th className="text-right py-2">المدفوع</th>
                  <th className="text-right py-2">الرصيد المستحق</th>
                  <th className="text-right py-2">طلبات معلقة</th>
                  <th className="text-right py-2">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {projResources.map((res) => {
                  const bal = getResourceBalance(res.id, projReimbs, projReqs, projSettles);
                  return (
                    <tr key={res.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{res.name}{res.role && <span className="text-muted-foreground text-xs"> — {res.role}</span>}</td>
                      <td className="py-2">{formatCurrency(bal.totalApprovedReimbursements)}</td>
                      <td className="py-2 text-emerald-600">{formatCurrency(bal.totalPaidReimbursements)}</td>
                      <td className={cn('py-2 font-semibold', bal.outstandingBalance > 0 && 'text-amber-600')}>
                        {formatCurrency(bal.outstandingBalance)}
                      </td>
                      <td className="py-2">{bal.pendingPaymentRequests}</td>
                      <td className="py-2">
                        <div className="flex gap-2 flex-wrap">
                          {canEdit && bal.outstandingBalance > 0 && (
                            <Button
                              size="sm"
                              onClick={() => {
                                const eligible = projReimbs.filter(
                                  (r) => r.resourceId === res.id && r.status === 'approved',
                                );
                                if (eligible.length === 0) {
                                  toast.info('لا توجد استردادات معتمدة قابلة للدفع لهذا المورد');
                                  return;
                                }
                                openNewRequest({
                                  resourceId: res.id,
                                  selectedReimbIds: eligible.map((r) => r.id),
                                  description: `دفع مستحقات ${res.name}`,
                                });
                              }}
                            >
                              <HandCoins className="h-4 w-4 ml-1" />
                              دفع المستحقات
                            </Button>
                          )}
                          {canEdit && bal.outstandingBalance > 0 && (
                            <Button size="sm" variant="outline" onClick={() => openSettlement(res.id)}>
                              مخالصة
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Tabs defaultValue="reimbursements" className="w-full">
        <TabsList>
          <TabsTrigger value="reimbursements">الاستردادات ({scopedReimbs.length})</TabsTrigger>
          <TabsTrigger value="requests">طلبات الصرف ({projReqs.length})</TabsTrigger>
          <TabsTrigger value="settlements">المخالصات ({projSettles.length})</TabsTrigger>
        </TabsList>

        {/* ─── Reimbursements Tab ─── */}
        <TabsContent value="reimbursements" className="space-y-3">
          <ReimbursementsTab
            projectId={projectId}
            scope={scope}
            scopedReimbs={scopedReimbs}
            projResources={projResources}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onReject={setRejectId}
          />
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          <PaymentRequestsTab
            projReqs={projReqs}
            projResources={projResources}
            canEdit={canEdit}
            isAdmin={isAdmin}
            advanceAgeDays={advanceAgeDays}
            onNewRequest={() => openNewRequest()}
            onReject={setRejectId}
            onPay={openPayDialog}
            onSettleAdvance={openSettleAdvance}
            onEditLinks={openEditLinks}
          />
        </TabsContent>

        {/* ─── Settlements Tab ─── */}
        <TabsContent value="settlements" className="space-y-3">
          <SettlementsTab
            projSettles={projSettles}
            projResources={projResources}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>

      {/* New payment request dialog. Mounted at section level, not inside the
          requests tab panel: Radix unmounts an inactive panel, and the
          "دفع المستحقات" button on the balances card above opens this dialog
          from whichever tab is active. */}
      {canEdit && (
        <NewPaymentRequestDialog
          key={reqSession}
          open={reqOpen}
          onOpenChange={setReqOpen}
          projectId={projectId}
          projResources={projResources}
          projReimbs={projReimbs}
          projBudgetItems={projBudgetItems}
          preset={reqPreset}
        />
      )}

      {/* Payment confirmation dialog */}
      <Dialog open={!!payDialogId} onOpenChange={(o) => { if (!o) setPayDialogId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الدفع</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>تاريخ الدفع *</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <Label>طريقة الدفع *</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>مرجع الدفع (اختياري)</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="رقم التحويل/الشيك" />
            </div>
            {/* ─── مصدر النقد ─── */}
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
              <Label className="font-semibold">مصدر النقد *</Label>
              {payingReq && (
                <p className="text-xs text-muted-foreground">
                  المبلغ المطلوب: <strong className="text-foreground">{formatCurrency(payingReq.amount)}</strong>
                </p>
              )}
              <RadioGroup value={paySource} onValueChange={(v) => setPaySource(v as 'fund' | 'custody')} className="space-y-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="fund" id="src-fund" disabled={availableFunds.length === 0} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="src-fund" className={cn('cursor-pointer', availableFunds.length === 0 && 'text-muted-foreground')}>
                      من دفعة محددة {availableFunds.length === 0 && '(لا توجد دفعات بها رصيد)'}
                    </Label>
                    {paySource === 'fund' && availableFunds.length > 0 && (
                      <Select value={paySourceFundId} onValueChange={setPaySourceFundId}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر الدفعة" /></SelectTrigger>
                        <SelectContent>
                          {availableFunds.map(({ fund, remaining }) => (
                            <SelectItem key={fund.id} value={fund.id}>
                              دفعة #{fund.fundNumber} — متاح {formatCurrency(remaining)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="custody" id="src-custody" disabled={availableCustodies.length === 0} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="src-custody" className={cn('cursor-pointer', availableCustodies.length === 0 && 'text-muted-foreground')}>
                      من عهدة قائمة {availableCustodies.length === 0 && '(لا توجد عُهد نشطة برصيد)'}
                    </Label>
                    {paySource === 'custody' && availableCustodies.length > 0 && (
                      <Select value={paySourceCustodyId} onValueChange={setPaySourceCustodyId}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="اختر العهدة" /></SelectTrigger>
                        <SelectContent>
                          {availableCustodies.map(({ custody, remaining }) => (
                            <SelectItem key={custody.id} value={custody.id}>
                              {custody.resourceName} — متاح {formatCurrency(remaining)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </RadioGroup>
              {availableFunds.length === 0 && availableCustodies.length === 0 && (
                <p className="text-xs text-destructive">
                  لا يوجد مصدر سيولة كافٍ. حرّر سلفة قائمة أو سجّل دفعة جديدة.
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              عند التأكيد سيُنشأ مصروف تلقائياً مربوط بالمصدر المحدد ويُحسب ضمن رصيد الدفعة/العهدة.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogId(null)}>إلغاء</Button>
            <Button onClick={handlePay} disabled={paySource === 'fund' ? !paySourceFundId : !paySourceCustodyId}>تأكيد الدفع</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* ─── Edit links dialog ─── */}
      <Dialog open={!!editLinksId} onOpenChange={(o) => { if (!o) setEditLinksId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل ربط البنود</DialogTitle>
          </DialogHeader>
          {editingReq && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                <p>طلب الصرف: <strong>{editingReq.description}</strong></p>
                <p>الحالة: <Badge variant="outline" className="text-xs">{PAYMENT_REQUEST_STATUS_LABELS[editingReq.status]}</Badge></p>
                {editingReq.status === 'paid' && (
                  <p className="text-amber-600 mt-1">⚠ المبلغ ثابت لأن الطلب مدفوع — فقط الربط والوصف قابلان للتعديل.</p>
                )}
              </div>
              <div>
                <Label>الوصف</Label>
                <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              {editingReq.requestType === 'reimbursement' && (
                <div>
                  <Label>البنود المرتبطة (مستحقات)</Label>
                  <div className="border rounded-lg p-2 max-h-64 overflow-y-auto space-y-1.5 mt-1.5">
                    {editEligibleReimbs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">لا توجد مستحقات معتمدة قابلة للربط</p>
                    ) : (
                      editEligibleReimbs.map((r) => {
                        const checked = editLinkedIds.includes(r.id);
                        // Boolean(): paymentRequestId is optional, so `&&` would
                        // otherwise yield '' | undefined and leak into `disabled`.
                        const linkedElsewhere = Boolean(r.paymentRequestId) && r.paymentRequestId !== editLinksId;
                        return (
                          <label key={r.id} className={cn('flex items-start gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50', linkedElsewhere && 'opacity-60')}>
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              disabled={linkedElsewhere && !checked}
                              onChange={(e) => {
                                setEditLinkedIds((prev) =>
                                  e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                                );
                              }}
                            />
                            <div className="flex-1 text-xs">
                              <div className="font-medium">{r.description}</div>
                              <div className="text-muted-foreground flex gap-2">
                                <span>{formatCurrency(r.amount)}</span>
                                <span>· {r.expenseDate}</span>
                                {linkedElsewhere && <span className="text-amber-600">· مربوط بطلب آخر</span>}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    المجموع الجديد: <strong>{formatCurrency(projReimbs.filter((r) => editLinkedIds.includes(r.id)).reduce((s, r) => s + r.amount, 0))}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLinksId(null)}>إلغاء</Button>
            <Button onClick={handleSaveEditLinks}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Reject reason dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>سبب الرفض</DialogTitle></DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} placeholder="اكتب سبباً واضحاً..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleReject}>رفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement creation dialog */}
      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>إنشاء مخالصة نهائية — {sResource?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الفترة من</Label>
                <Input type="date" value={sFrom} onChange={(e) => setSFrom(e.target.value)} />
              </div>
              <div>
                <Label>الفترة إلى</Label>
                <Input type="date" value={sTo} onChange={(e) => setSTo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded text-sm">
              <div><div className="text-muted-foreground">المستحق</div><div className="font-bold">{formatCurrency(sTotals.totalOwed)}</div></div>
              <div><div className="text-muted-foreground">المدفوع</div><div className="font-bold text-emerald-600">{formatCurrency(sTotals.totalPaid)}</div></div>
              <div><div className="text-muted-foreground">الرصيد</div><div className="font-bold text-amber-600">{formatCurrency(sTotals.balance)}</div></div>
            </div>
            <div>
              <Label>نص المخالصة</Label>
              <Textarea value={sText} onChange={(e) => setSText(e.target.value)} rows={10} className="font-sans" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreateSettlement}>إنشاء كمسودة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettleAdvanceDialog
        key={settleSession}
        advance={settlingAdvance}
        onClose={() => setSettleAdvanceId(null)}
        isAdmin={isAdmin}
        canEdit={canEdit}
        projResources={projResources}
        projBudgetItems={projBudgetItems}
        availableFunds={availableFunds}
        availableCustodies={availableCustodies}
      />
    </div>
  );
}
