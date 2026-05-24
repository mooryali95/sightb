import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import {
  getProjectPayablesSummary,
  getResourceBalance,
  buildTimeline,
  defaultSettlementText,
  calcSettlementTotals,
} from '@/lib/resource-payables';
import {
  EXPENSE_CATEGORY_LABELS,
  REIMBURSEMENT_STATUS_LABELS,
  REIMBURSEMENT_STATUS_COLORS,
  PAYMENT_REQUEST_STATUS_LABELS,
  PAYMENT_REQUEST_STATUS_COLORS,
  PAYMENT_REQUEST_TYPE_LABELS,
  PAYMENT_PRIORITY_LABELS,
  PAYMENT_PRIORITY_COLORS,
  PAYMENT_METHOD_LABELS,
  RESOURCE_SETTLEMENT_STATUS_LABELS,
  RESOURCE_SETTLEMENT_STATUS_COLORS,
  type ExpenseCategory,
  type PaymentMethod,
  type PaymentPriority,
  type PaymentRequestType,
  type ReimbursementStatus,
} from '@/types/project';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getFundRemaining } from '@/lib/funds';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import {
  Plus, HandCoins, CheckCircle2, XCircle, FileText, Send, Clock,
  CalendarClock, Wallet, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
    resources, reimbursements, paymentRequests, resourceSettlements,
    projectFunds, custodies, expenses, budgetItems,
    createReimbursement, approveReimbursement, rejectReimbursement, deleteReimbursement,
    createPaymentRequest, submitPaymentRequest, reviewPaymentRequest,
    approvePaymentRequest, rejectPaymentRequest, schedulePaymentRequest,
    payPaymentRequest, cancelPaymentRequest, deletePaymentRequest, settleAdvance,
    createResourceSettlement, signResourceSettlement,
  } = useStore();

  const projBudgetItems = useMemo(
    () => budgetItems.filter((b: any) => b.projectId === projectId),
    [budgetItems, projectId],
  );

  const projResources = useMemo(
    () => resources.filter((r) => r.projectId === projectId),
    [resources, projectId],
  );
  const projReimbs = useMemo(
    () => reimbursements.filter((r) => r.projectId === projectId),
    [reimbursements, projectId],
  );
  const projReqs = useMemo(
    () => paymentRequests.filter((p) => p.projectId === projectId),
    [paymentRequests, projectId],
  );
  const projSettles = useMemo(
    () => resourceSettlements.filter((s) => s.projectId === projectId),
    [resourceSettlements, projectId],
  );

  const summary = useMemo(
    () => getProjectPayablesSummary(projectId, projResources, projReimbs, projReqs, projSettles),
    [projectId, projResources, projReimbs, projReqs, projSettles],
  );

  // ─── Reimbursement dialog state ───
  const [reimbOpen, setReimbOpen] = useState(false);
  const [rResourceId, setRResourceId] = useState('');
  const [rCategory, setRCategory] = useState<ExpenseCategory>('equipment');
  const [rDescription, setRDescription] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rDate, setRDate] = useState(new Date().toISOString().split('T')[0]);
  const [rNotes, setRNotes] = useState('');

  const resetReimb = () => {
    setRResourceId(''); setRCategory('equipment'); setRDescription('');
    setRAmount(''); setRDate(new Date().toISOString().split('T')[0]); setRNotes('');
  };

  const handleCreateReimb = async () => {
    if (!rResourceId || !rDescription.trim() || !rAmount) {
      toast.error('يرجى تعبئة الحقول المطلوبة'); return;
    }
    try {
      await createReimbursement({
        projectId, resourceId: rResourceId, category: rCategory,
        description: rDescription, amount: parseFloat(rAmount),
        expenseDate: rDate, notes: rNotes,
      });
      toast.success('تم تسجيل الاسترداد، بانتظار الاعتماد');
      resetReimb(); setReimbOpen(false);
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
  };

  // ─── Payment request dialog state ───
  const [reqOpen, setReqOpen] = useState(false);
  const [pResourceId, setPResourceId] = useState('');
  const [pType, setPType] = useState<PaymentRequestType>('reimbursement');
  const [pAmount, setPAmount] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pJustification, setPJustification] = useState('');
  const [pPriority, setPPriority] = useState<PaymentPriority>('normal');
  const [pSelectedReimbs, setPSelectedReimbs] = useState<string[]>([]);
  const [pBudgetItemId, setPBudgetItemId] = useState<string>('');

  const eligibleReimbs = useMemo(
    () => projReimbs.filter(
      (r) => r.resourceId === pResourceId && r.status === 'approved',
    ),
    [projReimbs, pResourceId],
  );

  const computedAmount = useMemo(() => {
    if (pType !== 'reimbursement') return 0;
    return eligibleReimbs
      .filter((r) => pSelectedReimbs.includes(r.id))
      .reduce((s, r) => s + r.amount, 0);
  }, [pType, eligibleReimbs, pSelectedReimbs]);

  const resetReq = () => {
    setPResourceId(''); setPType('reimbursement'); setPAmount('');
    setPDescription(''); setPJustification(''); setPPriority('normal');
    setPSelectedReimbs([]); setPBudgetItemId('');
  };

  const handleCreateReq = async () => {
    if (!pResourceId || !pDescription.trim()) {
      toast.error('يرجى تعبئة الحقول المطلوبة'); return;
    }
    const finalAmount = pType === 'reimbursement' ? computedAmount : parseFloat(pAmount || '0');
    if (finalAmount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر'); return;
    }
    try {
      const id = await createPaymentRequest({
        projectId, resourceId: pResourceId, requestType: pType,
        amount: finalAmount, description: pDescription,
        justification: pJustification, priority: pPriority,
        linkedReimbursementIds: pType === 'reimbursement' ? pSelectedReimbs : [],
        budgetItemId: pBudgetItemId || undefined,
      });
      // Auto-submit if user wants? For now keep as draft, then submit
      await submitPaymentRequest(id);
      toast.success('تم إنشاء وإرسال طلب الصرف');
      resetReq(); setReqOpen(false);
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
  };

  // ─── Payment dialog ───
  const [payDialogId, setPayDialogId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [paySource, setPaySource] = useState<'fund' | 'custody' | 'none'>('fund');
  const [paySourceFundId, setPaySourceFundId] = useState<string>('');
  const [paySourceCustodyId, setPaySourceCustodyId] = useState<string>('');

  const payingReq = useMemo(
    () => projReqs.find((r) => r.id === payDialogId),
    [projReqs, payDialogId],
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
        ),
      }))
      .filter((x) => x.remaining > 0);
  }, [projectFunds, expenses, custodies, projectId, projReqs]);

  // Active custodies with remaining balance
  const availableCustodies = useMemo(() => {
    return custodies
      .filter((c) => c.projectId === projectId && c.status === 'active')
      .map((c) => {
        const spent = expenses
          .filter((e) => e.custodyId === c.id)
          .reduce((s, e) => s + e.amount, 0);
        return { custody: c, remaining: c.amount - spent };
      })
      .filter((x) => x.remaining > 0);
  }, [custodies, expenses, projectId]);

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
      setPaySource('none');
    }
  };

  const handlePay = async () => {
    if (!payDialogId || !payingReq) return;
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
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
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
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
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
      const id = await createResourceSettlement({
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
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
  };

  // ─── Outstanding advances (paid but not settled) ───
  const outstandingAdvances = useMemo(
    () => projReqs.filter(
      (r) => r.requestType === 'advance' && r.status === 'paid' && (r as any).isAdvanceOutstanding,
    ),
    [projReqs],
  );
  const outstandingAdvancesTotal = outstandingAdvances.reduce((s, r) => s + r.amount, 0);

  // ─── Settle advance dialog state ───
  const [settleAdvanceId, setSettleAdvanceId] = useState<string | null>(null);
  const [saType, setSaType] = useState<'documented' | 'cash_refund' | 'payroll_deduction' | 'written_off'>('documented');
  const [saAmount, setSaAmount] = useState('');
  const [saNotes, setSaNotes] = useState('');
  const [saCategory, setSaCategory] = useState<string>('other');

  const settlingAdvance = useMemo(
    () => projReqs.find((r) => r.id === settleAdvanceId),
    [projReqs, settleAdvanceId],
  );

  const openSettleAdvance = (id: string) => {
    const req = projReqs.find((r) => r.id === id);
    setSettleAdvanceId(id);
    setSaType('documented');
    setSaAmount(req ? String(req.amount) : '');
    setSaNotes('');
    setSaCategory('other');
  };

  const handleSettleAdvance = async () => {
    if (!settleAdvanceId || !settlingAdvance) return;
    if (saType === 'written_off' && !isAdmin) {
      toast.error('الشطب صلاحية مدير فقط'); return;
    }
    if (saType === 'written_off' && !saNotes.trim()) {
      toast.error('سبب الشطب مطلوب'); return;
    }
    try {
      await settleAdvance(settleAdvanceId, {
        type: saType,
        notes: saNotes,
        settledAmount: parseFloat(saAmount) || settlingAdvance.amount,
        expenseCategory: saCategory,
      });
      toast.success('تمت تسوية السلفة');
      setSettleAdvanceId(null);
    } catch (e: any) { toast.error(e.message || 'فشلت العملية'); }
  };


  return (
    <div className="space-y-6" dir="rtl">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <HandCoins className="h-4 w-4" /> إجمالي المعتمد
          </div>
          <div className="text-2xl font-bold">{formatCurrency(summary.totalApprovedAmount)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CheckCircle2 className="h-4 w-4" /> إجمالي المدفوع
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.totalPaidAmount)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Wallet className="h-4 w-4" /> المستحق غير المدفوع
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(summary.totalOutstandingAmount)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Clock className="h-4 w-4" /> طلبات معلقة
          </div>
          <div className="text-2xl font-bold">{summary.pendingRequestsCount}</div>
        </Card>
        <Card className="p-4 border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20" title="السلف المدفوعة لم تُسوَّ بعد — أصل قابل للاسترداد لا يدخل CPI">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm mb-1">
            <FileText className="h-4 w-4" /> سلف قائمة (غير مسوّاة)
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatCurrency(outstandingAdvancesTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{outstandingAdvances.length} سلفة</div>
        </Card>
      </div>

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
                        {canEdit && bal.outstandingBalance > 0 && (
                          <Button size="sm" variant="outline" onClick={() => openSettlement(res.id)}>
                            مخالصة
                          </Button>
                        )}
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
          <TabsTrigger value="reimbursements">الاستردادات ({projReimbs.length})</TabsTrigger>
          <TabsTrigger value="requests">طلبات الصرف ({projReqs.length})</TabsTrigger>
          <TabsTrigger value="settlements">المخالصات ({projSettles.length})</TabsTrigger>
        </TabsList>

        {/* ─── Reimbursements Tab ─── */}
        <TabsContent value="reimbursements" className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold">قائمة الاستردادات</h3>
            {canEdit && projResources.length > 0 && (
              <Dialog open={reimbOpen} onOpenChange={(o) => { setReimbOpen(o); if (!o) resetReimb(); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 ml-1" /> تسجيل استرداد</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>تسجيل مصروف صرفه المورد من حسابه</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>المورد *</Label>
                      <Select value={rResourceId} onValueChange={setRResourceId}>
                        <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                        <SelectContent>
                          {projResources.map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}{r.role && ` — ${r.role}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>الفئة *</Label>
                      <Select value={rCategory} onValueChange={(v) => setRCategory(v as ExpenseCategory)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>وصف المصروف *</Label>
                      <Input value={rDescription} onChange={(e) => setRDescription(e.target.value)} placeholder="لابتوب للمشروع" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>المبلغ *</Label>
                        <Input type="number" inputMode="decimal" value={rAmount} onChange={(e) => setRAmount(e.target.value)} placeholder="4500" />
                      </div>
                      <div>
                        <Label>تاريخ الصرف *</Label>
                        <Input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label>ملاحظات</Label>
                      <Textarea value={rNotes} onChange={(e) => setRNotes(e.target.value)} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReimbOpen(false)}>إلغاء</Button>
                    <Button onClick={handleCreateReimb}>حفظ</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {projReimbs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">لا توجد استردادات مسجلة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2">التاريخ</th>
                    <th className="text-right py-2">المورد</th>
                    <th className="text-right py-2">الفئة</th>
                    <th className="text-right py-2">الوصف</th>
                    <th className="text-right py-2">المبلغ</th>
                    <th className="text-right py-2">الحالة</th>
                    <th className="text-right py-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {projReimbs.map((r) => {
                    const res = projResources.find((x) => x.id === r.resourceId);
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="py-2">{r.expenseDate}</td>
                        <td className="py-2">{res?.name || '—'}</td>
                        <td className="py-2">{EXPENSE_CATEGORY_LABELS[r.category as ExpenseCategory] || r.category}</td>
                        <td className="py-2">{r.description}</td>
                        <td className="py-2 font-medium">{formatCurrency(r.amount)}</td>
                        <td className="py-2">
                          <Badge className={REIMBURSEMENT_STATUS_COLORS[r.status]}>
                            {REIMBURSEMENT_STATUS_LABELS[r.status]}
                          </Badge>
                          {r.rejectionReason && (
                            <div className="text-xs text-muted-foreground mt-1">السبب: {r.rejectionReason}</div>
                          )}
                        </td>
                        <td className="py-2 space-x-2 space-x-reverse">
                          {isAdmin && r.status === 'pending_review' && (
                            <>
                              <Button size="sm" variant="outline"
                                onClick={async () => {
                                  try { await approveReimbursement(r.id); toast.success('تم الاعتماد'); }
                                  catch (e: any) { toast.error(e.message); }
                                }}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline"
                                onClick={() => setRejectId({ id: r.id, kind: 'reimb' })}>
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                          {canEdit && (r.status === 'pending_review' || r.status === 'rejected') && (
                            <ConfirmDeleteDialog
                              title="حذف الاسترداد؟"
                              description="سيتم حذف هذا الاسترداد نهائياً."
                              onConfirm={async () => {
                                try { await deleteReimbursement(r.id); toast.success('تم الحذف'); }
                                catch (e: any) { toast.error(e.message); }
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ─── Payment Requests Tab ─── */}
        <TabsContent value="requests" className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold">طلبات صرف الدفعات</h3>
            {canEdit && projResources.length > 0 && (
              <Dialog open={reqOpen} onOpenChange={(o) => { setReqOpen(o); if (!o) resetReq(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="default"><Send className="h-4 w-4 ml-1" /> طلب صرف جديد</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>طلب صرف دفعة جديدة</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>المورد *</Label>
                        <Select value={pResourceId} onValueChange={(v) => { setPResourceId(v); setPSelectedReimbs([]); }}>
                          <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                          <SelectContent>
                            {projResources.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>نوع الطلب *</Label>
                        <Select value={pType} onValueChange={(v) => setPType(v as PaymentRequestType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(PAYMENT_REQUEST_TYPE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {pType === 'reimbursement' && pResourceId && (
                      <div className="border rounded p-3 bg-muted/20">
                        <div className="text-sm font-medium mb-2">اختر الاستردادات المعتمدة لهذا المورد:</div>
                        {eligibleReimbs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">لا توجد استردادات معتمدة غير مدفوعة لهذا المورد.</p>
                        ) : eligibleReimbs.map((r) => (
                          <label key={r.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                            <input type="checkbox"
                              checked={pSelectedReimbs.includes(r.id)}
                              onChange={(e) => {
                                if (e.target.checked) setPSelectedReimbs([...pSelectedReimbs, r.id]);
                                else setPSelectedReimbs(pSelectedReimbs.filter((x) => x !== r.id));
                              }} />
                            <span className="flex-1">{r.expenseDate} — {r.description}</span>
                            <span className="font-medium">{formatCurrency(r.amount)}</span>
                          </label>
                        ))}
                        <div className="text-sm font-bold mt-2 pt-2 border-t">
                          المجموع: {formatCurrency(computedAmount)}
                        </div>
                      </div>
                    )}

                    {pType !== 'reimbursement' && (
                      <div>
                        <Label>المبلغ *</Label>
                        <Input type="number" inputMode="decimal" value={pAmount} onChange={(e) => setPAmount(e.target.value)} />
                      </div>
                    )}

                    <div>
                      <Label>وصف الطلب *</Label>
                      <Input value={pDescription} onChange={(e) => setPDescription(e.target.value)} placeholder="استرداد مصاريف لابتوب" />
                    </div>
                    <div>
                      <Label>المبرر</Label>
                      <Textarea value={pJustification} onChange={(e) => setPJustification(e.target.value)} rows={2} />
                    </div>
                    <div>
                      <Label>الأولوية</Label>
                      <Select value={pPriority} onValueChange={(v) => setPPriority(v as PaymentPriority)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_PRIORITY_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>بند الموازنة المرتبط (اختياري)</Label>
                      <Select value={pBudgetItemId || 'none'} onValueChange={(v) => setPBudgetItemId(v === 'none' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="بدون ربط" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— بدون ربط —</SelectItem>
                          {projBudgetItems.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {EXPENSE_CATEGORY_LABELS[b.category as ExpenseCategory] || b.category} — {b.description} ({formatCurrency(b.plannedAmount)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        ربط الطلب ببند موازنة يضمن ظهوره في تحليل الانحراف وتقارير CPI.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReqOpen(false)}>إلغاء</Button>
                    <Button onClick={handleCreateReq}>إنشاء وإرسال للاعتماد</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {projReqs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">لا توجد طلبات صرف.</p>
          ) : (
            <div className="space-y-3">
              {projReqs.map((req) => {
                const res = projResources.find((r) => r.id === req.resourceId);
                const timeline = buildTimeline(req);
                return (
                  <Card key={req.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-semibold">{req.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {res?.name || '—'} · {PAYMENT_REQUEST_TYPE_LABELS[req.requestType]} · {formatCurrency(req.amount)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={PAYMENT_PRIORITY_COLORS[req.priority]}>
                          {PAYMENT_PRIORITY_LABELS[req.priority]}
                        </Badge>
                        <Badge className={PAYMENT_REQUEST_STATUS_COLORS[req.status]}>
                          {PAYMENT_REQUEST_STATUS_LABELS[req.status]}
                        </Badge>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex flex-wrap items-center gap-1 text-xs my-3 overflow-x-auto pb-2">
                      {timeline.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-1 shrink-0">
                          <div className={cn(
                            'flex flex-col items-center px-2 py-1 rounded',
                            step.current && 'bg-primary/10 ring-1 ring-primary',
                            step.done && !step.current && 'opacity-100',
                            !step.done && 'opacity-40',
                          )}>
                            <div className="font-medium">{step.label}</div>
                            {step.date && <div className="text-[10px] text-muted-foreground">{step.date.split('T')[0]}</div>}
                          </div>
                          {i < timeline.length - 1 && <div className="text-muted-foreground">←</div>}
                        </div>
                      ))}
                    </div>

                    {req.justification && (
                      <div className="text-xs text-muted-foreground border-r-2 border-muted pr-2 mb-2">{req.justification}</div>
                    )}
                    {req.rejectionReason && (
                      <div className="text-xs text-red-600 mb-2">سبب الرفض: {req.rejectionReason}</div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && req.status === 'submitted' && (
                        <>
                          <Button size="sm" variant="outline"
                            onClick={async () => {
                              try { await reviewPaymentRequest(req.id); toast.success('قيد المراجعة'); }
                              catch (e: any) { toast.error(e.message); }
                            }}>بدء المراجعة</Button>
                          <Button size="sm"
                            onClick={async () => {
                              try { await approvePaymentRequest(req.id); toast.success('تم الاعتماد'); }
                              catch (e: any) { toast.error(e.message); }
                            }}>اعتماد</Button>
                          <Button size="sm" variant="outline"
                            onClick={() => setRejectId({ id: req.id, kind: 'req' })}>رفض</Button>
                        </>
                      )}
                      {isAdmin && req.status === 'under_review' && (
                        <>
                          <Button size="sm"
                            onClick={async () => {
                              try { await approvePaymentRequest(req.id); toast.success('تم الاعتماد'); }
                              catch (e: any) { toast.error(e.message); }
                            }}>اعتماد</Button>
                          <Button size="sm" variant="outline"
                            onClick={() => setRejectId({ id: req.id, kind: 'req' })}>رفض</Button>
                        </>
                      )}
                      {isAdmin && req.status === 'approved' && (
                        <>
                          <Button size="sm" variant="outline"
                            onClick={async () => {
                              const date = window.prompt('تاريخ الجدولة (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                              if (!date) return;
                              try { await schedulePaymentRequest(req.id, date); toast.success('تمت الجدولة'); }
                              catch (e: any) { toast.error(e.message); }
                            }}>
                            <CalendarClock className="h-4 w-4 ml-1" /> جدولة
                          </Button>
                          <Button size="sm"
                            onClick={() => openPayDialog(req.id)}>
                            تأكيد الدفع
                          </Button>
                        </>
                      )}
                      {isAdmin && req.status === 'scheduled' && (
                        <Button size="sm"
                          onClick={() => openPayDialog(req.id, req.scheduledDate)}>
                          تأكيد الدفع
                        </Button>
                      )}
                      {canEdit && req.status === 'paid' && req.requestType === 'advance' && (req as any).isAdvanceOutstanding && (
                        <Button size="sm" variant="default"
                          onClick={() => setSettleAdvanceId(req.id)}>
                          تسوية السلفة
                        </Button>
                      )}
                      {req.status === 'paid' && req.requestType === 'advance' && !(req as any).isAdvanceOutstanding && req.advanceSettledAt && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                          {req.settlementType === 'cash_refund' ? 'رد نقدي' :
                           req.settlementType === 'payroll_deduction' ? 'خصم من راتب' :
                           req.settlementType === 'written_off' ? 'مشطوبة' :
                           'مسوّاة بمستندات'} — {String(req.advanceSettledAt).split('T')[0]}
                        </Badge>
                      )}
                      {canEdit && (req.status === 'draft' || req.status === 'submitted') && (
                        <Button size="sm" variant="ghost"
                          onClick={async () => {
                            try { await cancelPaymentRequest(req.id); toast.success('تم الإلغاء'); }
                            catch (e: any) { toast.error(e.message); }
                          }}>إلغاء</Button>
                      )}
                      {isAdmin && (req.status === 'draft' || req.status === 'cancelled' || req.status === 'rejected') && (
                        <ConfirmDeleteDialog
                          title="حذف طلب الصرف"
                          description={`حذف طلب صرف "${req.description}" نهائياً؟`}
                          onConfirm={async () => {
                            try { await deletePaymentRequest(req.id); toast.success('تم الحذف'); }
                            catch (e: any) { toast.error(e.message); }
                          }}
                        />
                      )}
                      {/* السلف المدفوعة تُغلق فقط عبر مسار التسوية أعلاه (لا حذف) */}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Settlements Tab ─── */}
        <TabsContent value="settlements" className="space-y-3">
          <h3 className="text-base font-semibold">المخالصات النهائية</h3>
          {projSettles.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              لا توجد مخالصات. أنشئ مخالصة من جدول أرصدة الموارد أعلاه.
            </p>
          ) : (
            <div className="space-y-3">
              {projSettles.map((s) => {
                const res = projResources.find((r) => r.id === s.resourceId);
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold">{res?.name || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.periodFrom || '—'} → {s.periodTo || '—'}
                        </div>
                      </div>
                      <Badge className={RESOURCE_SETTLEMENT_STATUS_COLORS[s.status]}>
                        {RESOURCE_SETTLEMENT_STATUS_LABELS[s.status]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm my-3">
                      <div><span className="text-muted-foreground">المستحق:</span> <strong>{formatCurrency(s.totalOwed)}</strong></div>
                      <div><span className="text-muted-foreground">المدفوع:</span> <strong className="text-emerald-600">{formatCurrency(s.totalPaid)}</strong></div>
                      <div><span className="text-muted-foreground">الفرق:</span> <strong className={s.balance > 0 ? 'text-amber-600' : ''}>{formatCurrency(s.balance)}</strong></div>
                    </div>
                    {s.settlementTextAr && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">نص المخالصة</summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans bg-muted/30 p-3 rounded">{s.settlementTextAr}</pre>
                      </details>
                    )}
                    {isAdmin && s.status === 'draft' && (
                      <div className="mt-3">
                        <Button size="sm"
                          onClick={async () => {
                            try { await signResourceSettlement(s.id); toast.success('تم توقيع المخالصة'); }
                            catch (e: any) { toast.error(e.message); }
                          }}>
                          توقيع وإقفال المخالصة
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Payment confirmation dialog */}
      <Dialog open={!!payDialogId} onOpenChange={(o) => { if (!o) setPayDialogId(null); }}>
        <DialogContent dir="rtl">
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
              <RadioGroup value={paySource} onValueChange={(v) => setPaySource(v as any)} className="space-y-2">
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
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="none" id="src-none" className="mt-1" />
                  <Label htmlFor="src-none" className="cursor-pointer">
                    خارج النظام (دفع مباشر بدون خصم من دفعة/عهدة)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <p className="text-xs text-muted-foreground">
              عند التأكيد سيُنشأ مصروف تلقائياً مربوط بالمصدر المحدد ويُحسب ضمن رصيد الدفعة/العهدة.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogId(null)}>إلغاء</Button>
            <Button onClick={handlePay}>تأكيد الدفع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectReason(''); } }}>
        <DialogContent dir="rtl">
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
        <DialogContent className="max-w-2xl" dir="rtl">
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
        <DialogContent className="max-w-xl" dir="rtl">
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

              <div>
                <Label className="mb-2 block">نوع التسوية</Label>
                <RadioGroup value={saType} onValueChange={(v) => setSaType(v as any)} className="space-y-2">
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
                  <Label>المبلغ</Label>
                  <Input
                    type="number"
                    value={saAmount}
                    onChange={(e) => setSaAmount(e.target.value)}
                    placeholder={String(settlingAdvance.amount)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    اتركه فارغاً للتسوية الكاملة. أي مبلغ أقل = تسوية جزئية، والباقي يبقى قائماً.
                  </p>
                </div>
              )}

              {saType === 'documented' && (
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
            <Button onClick={handleSettleAdvance}>تنفيذ التسوية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
