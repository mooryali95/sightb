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
  type AdvanceSettlementType,
  type PaymentMethod,
  type PaymentRequest,
} from '@/types/project';

/** The settle-advance dialog's modes: the four settlement types plus a refund-and-document compound. */
type AdvanceSettlementMode = AdvanceSettlementType | 'compound';
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
import { HandCoins, RotateCcw, Undo2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { usePayablesScope } from './payables/usePayablesScope';
import { PayablesScopeBar } from './payables/PayablesScopeBar';
import { PayablesSummaryCards } from './payables/PayablesSummaryCards';
import { ReimbursementsTab } from './payables/ReimbursementsTab';
import { SettlementsTab } from './payables/SettlementsTab';
import { PaymentRequestsTab } from './payables/PaymentRequestsTab';
import { NewPaymentRequestDialog, type NewPaymentRequestPreset } from './payables/NewPaymentRequestDialog';

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
    resources, projectFunds, custodies, expenses,
    settlementEvents, loadSettlementEventsForRequest, settleAdvanceWithSplit,
    rejectReimbursement, rejectPaymentRequest, payPaymentRequest, settleAdvance,
    reverseSettlementEvent, updatePaymentRequest, createResourceSettlement,
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



  // ─── Settle advance dialog state ───
  const [settleAdvanceId, setSettleAdvanceId] = useState<string | null>(null);
  const [saType, setSaType] = useState<AdvanceSettlementMode>('documented');
  const [saAmount, setSaAmount] = useState('');
  const [saRefundAmount, setSaRefundAmount] = useState('');
  const [saDocAmount, setSaDocAmount] = useState('');
  const [saNotes, setSaNotes] = useState('');
  const [saCategory, setSaCategory] = useState<string>('other');
  // Split overflow source (when invoice > outstanding)
  const [saOverflowSource, setSaOverflowSource] = useState<string>(''); // "fund:<id>" | "custody:<id>"
  // Reverse event dialog
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string; amount: number } | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const handleReverseConfirm = async () => {
    if (!reverseTarget) return;
    if (!reverseReason.trim()) {
      toast.error('سبب التراجع مطلوب');
      return;
    }
    setReversing(true);
    try {
      await reverseSettlementEvent(reverseTarget.id, reverseReason.trim());
      toast.success('تم التراجع عن الحدث وإعادة حساب السلفة');
      setReverseTarget(null);
      setReverseReason('');
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّر التراجع'));
    } finally {
      setReversing(false);
    }
  };

  const settlingAdvance = useMemo(
    () => projReqs.find((r) => r.id === settleAdvanceId),
    [projReqs, settleAdvanceId],
  );

  const openSettleAdvance = (id: string) => {
    const req = projReqs.find((r) => r.id === id);
    const outstanding = req ? Math.max(req.amount - (req.refundedAmount ?? 0), 0) : 0;
    const linkedBudget = req?.budgetItemId
      ? projBudgetItems.find((b) => b.id === req.budgetItemId)
      : undefined;
    const defaultCategory = (linkedBudget?.category as string) || 'other';
    setSettleAdvanceId(id);
    setSaType('documented');
    setSaAmount(String(outstanding));
    setSaRefundAmount('');
    setSaDocAmount('');
    setSaNotes('');
    setSaCategory(defaultCategory);
    setSaOverflowSource('');
    // Load settlement events for this PR
    loadSettlementEventsForRequest(id).catch(console.warn);
  };

  // E) سجل التسويات من جدول settlement_events
  const settlementHistory = useMemo(() => {
    type Row = {
      id: string;
      kind: 'refund' | 'expense' | 'other' | 'reverse';
      eventType: string;
      date: string;
      amount: number;
      label: string;
      sub?: string;
      reversedEventId?: string | null;
      reversed: boolean;
      reverseEventId?: string;
      overflowAmount?: number;
      overflowSourceLabel?: string;
    };
    if (!settlingAdvance) return [] as Row[];
    const evs = settlementEvents.filter((e) => e.paymentRequestId === settlingAdvance.id);
    const reversedMap = new Map<string, string>();
    evs.forEach((e) => {
      if (e.eventType === 'reverse' && e.reversedEventId) reversedMap.set(e.reversedEventId, e.id);
    });
    return evs.map<Row>((e) => {
      const label = e.eventType === 'cash_refund' ? 'رد نقدي'
        : e.eventType === 'documented' ? 'تسوية بمستندات'
        : e.eventType === 'payroll_deduction' ? 'خصم من مستحقات'
        : e.eventType === 'written_off' ? 'شطب'
        : 'تراجع';
      const kind: Row['kind'] = e.eventType === 'reverse' ? 'reverse'
        : e.eventType === 'cash_refund' ? 'refund'
        : e.expenseId || e.overflowExpenseId ? 'expense' : 'other';
      let overflowAmount: number | undefined;
      let overflowSourceLabel: string | undefined;
      if (e.overflowExpenseId) {
        const exp = expenses.find((x) => x.id === e.overflowExpenseId);
        if (exp) {
          overflowAmount = Number(exp.amount);
          if (exp.fundId) {
            const fund = projectFunds.find((f) => f.id === exp.fundId);
            overflowSourceLabel = `دفعة${fund?.fundNumber ? ` #${fund.fundNumber}` : ''}`;
          } else if (exp.custodyId) {
            const cust = custodies.find((c) => c.id === exp.custodyId);
            overflowSourceLabel = `عهدة${cust?.resourceName ? ` (${cust.resourceName})` : ''}`;
          }
        }
      }
      return {
        id: e.id,
        kind,
        eventType: e.eventType,
        date: String(e.createdAt).split('T')[0],
        amount: e.amount,
        label,
        sub: e.expenseCategory || e.notes || undefined,
        reversedEventId: e.reversedEventId,
        reversed: reversedMap.has(e.id),
        reverseEventId: reversedMap.get(e.id),
        overflowAmount,
        overflowSourceLabel,
      };
    });
  }, [settlingAdvance, settlementEvents, expenses, projectFunds, custodies]);



  // ─── Settlement math (live preview) ───
  const settlementMath = useMemo(() => {
    if (!settlingAdvance) return { amount: 0, prev: 0, outstanding: 0, thisOp: 0, remainder: 0, overflow: false, overflowAmount: 0 };
    const amount = settlingAdvance.amount;
    const prev = settlingAdvance.refundedAmount ?? 0;
    const outstanding = Math.max(amount - prev, 0);
    let thisOp = 0;
    if (saType === 'compound') {
      thisOp = (parseFloat(saRefundAmount) || 0) + (parseFloat(saDocAmount) || 0);
    } else if (saType === 'cash_refund' || saType === 'documented') {
      // A blank field means the whole remainder — that is what the
      // placeholder shows, and the wire below sends this same number.
      thisOp = saAmount.trim() === '' ? outstanding : (parseFloat(saAmount) || 0);
    } else {
      thisOp = outstanding;
    }
    thisOp = Math.max(thisOp, 0);
    // Split allowed only for documented (Split Expense scenario)
    const isSplitEligible = saType === 'documented' && thisOp > outstanding;
    const overflowAmount = isSplitEligible ? thisOp - outstanding : 0;
    const overflow = thisOp > outstanding + 0.0001 && !isSplitEligible;
    const remainder = Math.max(outstanding - thisOp, 0);
    return { amount, prev, outstanding, thisOp, remainder, overflow, overflowAmount };
  }, [settlingAdvance, saType, saAmount, saRefundAmount, saDocAmount]);

  const handleSettleAdvance = async () => {
    if (!settleAdvanceId || !settlingAdvance) return;
    if (saType === 'written_off' && !isAdmin) { toast.error('الشطب صلاحية مدير فقط'); return; }
    if (saType === 'written_off' && !saNotes.trim()) { toast.error('سبب الشطب مطلوب'); return; }
    if (settlementMath.overflow) { toast.error('المبلغ يتجاوز المتبقي القائم'); return; }
    try {
      // Split Expense: documented with invoice > outstanding
      if (saType === 'documented' && settlementMath.overflowAmount > 0) {
        if (!saOverflowSource) { toast.error('اختر مصدر تغطية الجزء الفائض'); return; }
        const [kind, srcId] = saOverflowSource.split(':');
        await settleAdvanceWithSplit(settleAdvanceId, {
          invoiceAmount: settlementMath.thisOp,
          overflowSource: kind === 'fund' ? { fundId: srcId } : { custodyId: srcId },
          expenseCategory: saCategory,
          notes: saNotes,
        });
        toast.success('تمت التسوية المقسّمة: السلفة مُغلقة + مصروف فائض مسجَّل');
      } else if (saType === 'compound') {
        const refundAmt = parseFloat(saRefundAmount) || 0;
        const docAmt = parseFloat(saDocAmount) || 0;
        if (refundAmt <= 0 && docAmt <= 0) { toast.error('أدخل مبلغ الرد و/أو التوثيق'); return; }
        let refundDone = false;
        if (refundAmt > 0) {
          await settleAdvance(settleAdvanceId, { type: 'cash_refund', notes: saNotes, settledAmount: refundAmt });
          refundDone = true;
        }
        if (docAmt > 0) {
          try {
            await settleAdvance(settleAdvanceId, { type: 'documented', notes: saNotes, settledAmount: docAmt, expenseCategory: saCategory });
          } catch (e) {
            if (refundDone) { toast.warning('تم الرد لكن فشل التوثيق: ' + errorMessage(e, '')); return; }
            throw e;
          }
        }
        toast.success('تمت التسوية المركّبة');
      } else {
        await settleAdvance(settleAdvanceId, {
          type: saType,
          notes: saNotes,
          settledAmount: settlementMath.thisOp,
          expenseCategory: saCategory,
        });
        toast.success('تمت تسوية السلفة');
      }
      setSettleAdvanceId(null);
    } catch (e) { toast.error(errorMessage(e)); }
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

      {/* Settle Advance Dialog */}
      <Dialog open={!!settleAdvanceId} onOpenChange={(o) => !o && setSettleAdvanceId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>تسوية سلفة قائمة</DialogTitle>
          </DialogHeader>
          {settlingAdvance && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/40 rounded text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المورد</span>
                  <span className="font-semibold">
                    {resources.find((r) => r.id === settlingAdvance.resourceId)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مبلغ السلفة</span>
                  <span className="font-mono font-bold">{formatCurrency(settlingAdvance.amount)}</span>
                </div>
                {(settlingAdvance.refundedAmount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">مردود سابقاً</span>
                      <span className="font-mono">{formatCurrency(settlingAdvance.refundedAmount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                      <span>المتبقي القائم</span>
                      <span className="font-mono">
                        {formatCurrency(Math.max(settlingAdvance.amount - (settlingAdvance.refundedAmount ?? 0), 0))}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المصدر</span>
                  <span className="text-xs">
                    {settlingAdvance.paidFromCustodyId ? 'عهدة' :
                     settlingAdvance.paidFromFundId ? 'دفعة' : '—'}
                  </span>
                </div>
              </div>

              {/* Settlement progress bar (live) */}
              {(() => {
                const { amount, prev, thisOp, remainder, overflow, overflowAmount } = settlementMath;
                if (amount <= 0) return null;
                // Split-eligible: progress shows outstanding portion + separate overflow segment
                const isSplit = overflowAmount > 0;
                const opVisible = isSplit ? Math.min(thisOp, Math.max(amount - prev, 0)) : thisOp;
                const total = amount + (isSplit ? overflowAmount : 0);
                const pct = (n: number) => Math.min(100, Math.max(0, (n / total) * 100));
                const prevPct = pct(prev);
                const opPct = pct(opVisible);
                const overflowPct = isSplit ? pct(overflowAmount) : 0;
                const remPct = Math.max(0, 100 - prevPct - opPct - overflowPct);
                return (
                  <div className="space-y-2">
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40 border">
                      {prevPct > 0 && (
                        <div
                          className="h-full bg-muted-foreground/40 transition-all"
                          style={{ width: `${prevPct}%` }}
                          title={`مسوّى سابقاً: ${formatCurrency(prev)}`}
                        />
                      )}
                      {opPct > 0 && (
                        <div
                          className={cn('h-full transition-all', overflow ? 'bg-destructive' : 'bg-primary')}
                          style={{ width: `${opPct}%` }}
                          title={`هذه العملية: ${formatCurrency(opVisible)}`}
                        />
                      )}
                      {overflowPct > 0 && (
                        <div
                          className="h-full bg-warning transition-all"
                          style={{ width: `${overflowPct}%` }}
                          title={`فائض (مصروف جديد): ${formatCurrency(overflowAmount)}`}
                        />
                      )}
                      {remPct > 0 && !overflow && (
                        <div
                          className="h-full bg-warning/60 transition-all"
                          style={{ width: `${remPct}%` }}
                          title={`المتبقي: ${formatCurrency(remainder)}`}
                        />
                      )}
                    </div>
                    <div className={cn('grid gap-2 text-xs', isSplit ? 'grid-cols-4' : 'grid-cols-3')}>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-muted-foreground">مسوّى سابقاً</span>
                        <span className="font-mono ms-auto">{formatCurrency(prev)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('inline-block h-2 w-2 rounded-full', overflow ? 'bg-destructive' : 'bg-primary')} />
                        <span className="text-muted-foreground">هذه العملية</span>
                        <span className="font-mono ms-auto">{formatCurrency(opVisible)}</span>
                      </div>
                      {isSplit && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-warning" />
                          <span className="text-muted-foreground">فائض</span>
                          <span className="font-mono ms-auto">{formatCurrency(overflowAmount)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-warning/60" />
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-mono ms-auto">{formatCurrency(remainder)}</span>
                      </div>
                    </div>
                    {overflow && (
                      <p className="text-xs text-destructive font-semibold">
                        المبلغ يتجاوز المتبقي القائم ({formatCurrency(settlementMath.outstanding)})
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* E) سجل التسويات السابقة */}
              {settlementHistory.length > 0 && (
                <div className="rounded border bg-muted/20 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">سجل التسويات السابقة</div>
                  <div className="space-y-1.5">
                    {settlementHistory.map((ev) => {
                      const isReverse = ev.kind === 'reverse';
                      const canReverseRow = canEdit && !isReverse && !ev.reversed;
                      return (
                        <div
                          key={ev.id}
                          className={cn(
                            'flex items-center justify-between text-xs gap-2',
                            ev.reversed && 'opacity-60',
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                              'inline-block h-2 w-2 rounded-full shrink-0',
                              isReverse ? 'bg-warning'
                                : ev.kind === 'refund' ? 'bg-success'
                                : 'bg-primary',
                            )} />
                            {isReverse && <Undo2 className="h-3 w-3 text-warning shrink-0" />}
                            <span className={cn('font-medium truncate', ev.reversed && 'line-through')}>
                              {ev.label}
                            </span>
                            {ev.sub && (
                              <span className="text-muted-foreground truncate">— {ev.sub}</span>
                            )}
                            {ev.overflowAmount && ev.overflowAmount > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
                                + فائض {formatCurrency(ev.overflowAmount)}
                                {ev.overflowSourceLabel ? ` · ${ev.overflowSourceLabel}` : ''}
                              </Badge>
                            )}
                            {ev.reversed && (
                              <Badge variant="outline" className="h-4 px-1 text-[10px]">ملغى</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ev.date && <span className="text-muted-foreground font-mono">{ev.date}</span>}
                            <span className={cn(
                              'font-mono font-semibold',
                              ev.reversed && 'line-through',
                            )}>{formatCurrency(ev.amount)}</span>
                            {canReverseRow && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5"
                                title="تراجع عن هذا الحدث"
                                onClick={() => {
                                  setReverseTarget({ id: ev.id, label: ev.label, amount: ev.amount });
                                  setReverseReason('');
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}



              <div>
                <Label className="mb-2 block">نوع التسوية</Label>
                <RadioGroup value={saType} onValueChange={(v) => setSaType(v as AdvanceSettlementMode)} className="space-y-2">
                  <label className="flex items-start gap-2 p-3 rounded border cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="documented" className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">تسوية بمستندات</div>
                      <div className="text-xs text-muted-foreground">تنشئ مصروفاً فعلياً يدخل التكلفة الفعلية (AC/CPI)</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 p-3 rounded border cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="cash_refund" className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">رد نقدي</div>
                      <div className="text-xs text-muted-foreground">يُعاد المبلغ لرصيد الدفعة/العهدة (لا مصروف)</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 p-3 rounded border cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="compound" className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">تسوية مركّبة</div>
                      <div className="text-xs text-muted-foreground">جزء يُرد نقداً وجزء يُوثَّق كمصروف فعلي في عملية واحدة</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 p-3 rounded border cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="payroll_deduction" className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">خصم من مستحقات</div>
                      <div className="text-xs text-muted-foreground">تُغلق السلفة كتقاص من مستحقات المورد، بدون أثر نقدي</div>
                    </div>
                  </label>
                  <label className={cn(
                    'flex items-start gap-2 p-3 rounded border cursor-pointer hover:bg-muted/40',
                    !isAdmin && 'opacity-50 cursor-not-allowed',
                  )}>
                    <RadioGroupItem value="written_off" className="mt-1" disabled={!isAdmin} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">شطب {!isAdmin && '(مدير فقط)'}</div>
                      <div className="text-xs text-muted-foreground">شطب الدين نهائياً، يتطلب سبباً</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {(saType === 'cash_refund' || saType === 'documented') && (
                <div>
                  <Label>{saType === 'documented' ? 'قيمة الفاتورة' : 'المبلغ'}</Label>
                  <Input
                    type="number"
                    value={saAmount}
                    onChange={(e) => setSaAmount(e.target.value)}
                    placeholder={String(settlementMath.outstanding)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {saType === 'documented'
                      ? 'إن تجاوزت الفاتورة المتبقي القائم، سيُفعَّل وضع التقسيم تلقائياً.'
                      : 'أي مبلغ أقل من المتبقي = تسوية جزئية، والباقي يبقى قائماً.'}
                  </p>
                </div>
              )}

              {saType === 'documented' && settlementMath.overflowAmount > 0 && (
                <div className="rounded border border-warning/40 bg-warning/5 p-3 space-y-2">
                  <div className="text-sm font-semibold">
                    تقسيم الفاتورة: السلفة ({formatCurrency(settlementMath.outstanding)}) + فائض ({formatCurrency(settlementMath.overflowAmount)})
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيُغلق المتبقي بمستندات، ويُسجَّل الفائض كمصروف مستقل من المصدر التالي:
                  </p>
                  <Select value={saOverflowSource} onValueChange={setSaOverflowSource}>
                    <SelectTrigger><SelectValue placeholder="اختر دفعة/عهدة للفائض" /></SelectTrigger>
                    <SelectContent>
                      {availableFunds
                        .filter((f) => f.remaining >= settlementMath.overflowAmount)
                        .map((f) => (
                          <SelectItem key={f.fund.id} value={`fund:${f.fund.id}`}>
                            دفعة #{f.fund.fundNumber} — متاح {formatCurrency(f.remaining)}
                          </SelectItem>
                        ))}
                      {availableCustodies
                        .filter((c) => c.remaining >= settlementMath.overflowAmount)
                        .map((c) => (
                          <SelectItem key={c.custody.id} value={`custody:${c.custody.id}`}>
                            عهدة {c.custody.resourceName} — متاح {formatCurrency(c.remaining)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {availableFunds.filter((f) => f.remaining >= settlementMath.overflowAmount).length === 0
                   && availableCustodies.filter((c) => c.remaining >= settlementMath.overflowAmount).length === 0 && (
                    <p className="text-xs text-destructive">لا يوجد مصدر برصيد كافٍ للفائض. أنشئ دفعة جديدة أو خفّض المبلغ.</p>
                  )}
                </div>
              )}


              {saType === 'compound' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>المبلغ المردود نقداً</Label>
                    <Input
                      type="number"
                      value={saRefundAmount}
                      onChange={(e) => setSaRefundAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>المبلغ الموثَّق كمصروف</Label>
                    <Input
                      type="number"
                      value={saDocAmount}
                      onChange={(e) => setSaDocAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {(saType === 'documented' || saType === 'compound') && (
                <div>
                  <Label>فئة المصروف</Label>
                  <Select value={saCategory} onValueChange={setSaCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="materials">مواد</SelectItem>
                      <SelectItem value="labor">عمالة</SelectItem>
                      <SelectItem value="equipment">معدات</SelectItem>
                      <SelectItem value="subcontractor">مقاول باطن</SelectItem>
                      <SelectItem value="transport">نقل</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>
                  ملاحظات {saType === 'written_off' && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  value={saNotes}
                  onChange={(e) => setSaNotes(e.target.value)}
                  rows={3}
                  placeholder={saType === 'written_off' ? 'سبب الشطب (إلزامي)' : 'اختياري'}
                />
              </div>

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleAdvanceId(null)}>إلغاء</Button>
            <Button onClick={handleSettleAdvance} disabled={settlementMath.overflow}>تنفيذ التسوية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse settlement event confirmation */}
      <AlertDialog
        open={!!reverseTarget}
        onOpenChange={(o) => { if (!o) { setReverseTarget(null); setReverseReason(''); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تراجع عن حدث تسوية</AlertDialogTitle>
            <AlertDialogDescription>
              {reverseTarget && (
                <>
                  سيُلغى الحدث <strong>{reverseTarget.label}</strong> بمبلغ{' '}
                  <span className="font-mono">{formatCurrency(reverseTarget.amount)}</span>،
                  وسيُحذف المصروف المرتبط (إن وُجد)، وستُعاد حالة السلفة تلقائياً.
                  هذا الإجراء سيُسجَّل كحدث جديد ولا يمكن التراجع عنه.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">سبب التراجع <span className="text-destructive">*</span></Label>
            <Textarea
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="اشرح سبب التراجع (إلزامي للتدقيق)"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleReverseConfirm(); }}
              disabled={reversing || !reverseReason.trim()}
            >
              {reversing ? 'جارٍ التراجع...' : 'تأكيد التراجع'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
