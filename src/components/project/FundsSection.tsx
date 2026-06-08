import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import {
  getProjectFundsSummary,
  getFundSpent,
  getFundDirectSpent,
  getFundCustodyDraw,
  getFundOutstandingAdvances,
  getFundCashTransfersOut,
  getFundRemaining,
  getRemainingStatus,
  calculateSettlementDifference,
  daysBetween,
  getSettlementForFund,
} from '@/lib/funds';
import { generateFundAlerts, canCreateNewFund } from '@/lib/fund-alerts';
import {
  FUND_STATUS_LABELS,
  FUND_STATUS_COLORS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  type ProjectFund,
  type FundSettlementAttachment,
  type Expense,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import {
  Plus, Wallet, CheckCircle2, AlertTriangle, FileText, Send,
  ThumbsUp, ThumbsDown, Paperclip, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FundsSectionProps {
  projectId: string;
  expenses: Expense[];
  readOnly?: boolean;
}

export function FundsSection({ projectId, expenses, readOnly = false }: FundsSectionProps) {
  const { isAdminFor, isOwner } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const {
    projectFunds, fundSettlements, custodies, paymentRequests, cashTransfers,
    createFund, acknowledgeFund, submitSettlement, approveSettlement,
    rejectSettlement, deleteFund, updateSettlementDraft,
  } = useStore();
  const projPRs = useMemo(
    () => paymentRequests.filter((p) => p.projectId === projectId),
    [paymentRequests, projectId],
  );
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );

  const projectExpenses = useMemo(
    () => expenses.filter((e) => e.projectId === projectId),
    [expenses, projectId],
  );

  const projectCustodies = useMemo(
    () => (custodies || []).filter((c) => c.projectId === projectId),
    [custodies, projectId],
  );

  const summary = useMemo(
    () => getProjectFundsSummary(projectId, projectFunds, fundSettlements, projectExpenses, projectCustodies as any, projPRs, projTransfers),
    [projectId, projectFunds, fundSettlements, projectExpenses, projectCustodies, projPRs, projTransfers],
  );

  const projectFundsList = useMemo(
    () => projectFunds.filter((f) => f.projectId === projectId)
      .sort((a, b) => b.fundNumber - a.fundNumber),
    [projectFunds, projectId],
  );

  const alerts = useMemo(
    () => generateFundAlerts(projectId, projectFunds, fundSettlements, projectExpenses),
    [projectId, projectFunds, fundSettlements, projectExpenses],
  );

  const lastFundAmount = projectFundsList[0]?.amount ?? 0;
  const remainingStatus = getRemainingStatus(summary.remainingInManagerHand, lastFundAmount);

  const canCreate = canCreateNewFund(projectId, projectFunds);
  const showCreate = isAdmin && !readOnly;

  // ───── Create Fund Dialog ─────
  const [createOpen, setCreateOpen] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newNotes, setNewNotes] = useState('');

  // ───── Emergency Fund Dialog ─────
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emAmount, setEmAmount] = useState('');
  const [emDate, setEmDate] = useState(new Date().toISOString().split('T')[0]);
  const [emReason, setEmReason] = useState('');
  const [emNotes, setEmNotes] = useState('');

  const handleCreate = async () => {
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    try {
      await createFund(projectId, amt, newDate, newNotes.trim() || undefined);
      toast.success('تم إنشاء الدفعة');
      setCreateOpen(false);
      setNewAmount(''); setNewNotes('');
    } catch (e: any) {
      toast.error(e.message || 'تعذّر إنشاء الدفعة');
    }
  };

  const handleEmergency = async () => {
    const amt = parseFloat(emAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    if (!emReason.trim() || emReason.trim().length < 10) {
      toast.error('سبب الدفعة الاستثنائية مطلوب (10 أحرف على الأقل)');
      return;
    }
    try {
      await createFund(projectId, amt, emDate, emNotes.trim() || undefined, {
        emergency: true,
        emergencyReason: emReason.trim(),
      });
      toast.success('تم إنشاء الدفعة الاستثنائية وتسجيلها في سجل التدقيق');
      setEmergencyOpen(false);
      setEmAmount(''); setEmNotes(''); setEmReason('');
    } catch (e: any) {
      toast.error(e.message || 'تعذّر إنشاء الدفعة الاستثنائية');
    }
  };

  // ───── Settlement Dialog ─────
  const [settleFor, setSettleFor] = useState<ProjectFund | null>(null);
  const [remainingCash, setRemainingCash] = useState('');
  const [diffReason, setDiffReason] = useState('');
  const [attachments, setAttachments] = useState<FundSettlementAttachment[]>([]);
  const [attachName, setAttachName] = useState('');
  const [attachUrl, setAttachUrl] = useState('');

  const openSettle = (fund: ProjectFund) => {
    const existing = getSettlementForFund(fund.id, fundSettlements);
    setSettleFor(fund);
    setRemainingCash(existing ? String(existing.remainingCash) : '0');
    setDiffReason(existing?.differenceReason || '');
    setAttachments(existing?.attachments || []);
    setAttachName(''); setAttachUrl('');
  };

  const closeSettle = () => {
    setSettleFor(null); setRemainingCash(''); setDiffReason(''); setAttachments([]);
  };

  const settlementSpent = settleFor
    ? getFundSpent(settleFor.id, projectExpenses, projectCustodies, projPRs, projTransfers)
    : 0;
  const settlementDiff = settleFor
    ? calculateSettlementDifference(
        settleFor.amount,
        settlementSpent,
        parseFloat(remainingCash) || 0,
      )
    : 0;

  const addAttachment = () => {
    if (!attachName.trim()) return;
    setAttachments((a) => [...a, {
      name: attachName.trim(),
      url: attachUrl.trim() || undefined,
      uploadedAt: new Date().toISOString(),
    }]);
    setAttachName(''); setAttachUrl('');
  };

  const removeAttachment = (idx: number) => {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  };

  const handleSubmitSettlement = async () => {
    if (!settleFor) return;
    const cash = parseFloat(remainingCash) || 0;
    if (Math.abs(settlementDiff) > 1 && !diffReason.trim()) {
      toast.error('يجب توضيح سبب الفرق');
      return;
    }
    try {
      await submitSettlement(settleFor.id, cash, attachments, diffReason || undefined);
      toast.success('تم إرسال التسوية للاعتماد');
      closeSettle();
    } catch (e: any) {
      toast.error(e.message || 'تعذّر إرسال التسوية');
    }
  };

  const handleSaveDraft = async () => {
    if (!settleFor) return;
    const existing = getSettlementForFund(settleFor.id, fundSettlements);
    if (!existing) {
      toast.error('لا توجد مسودة لحفظها — اضغط "إرسال للاعتماد" لإنشاء التسوية أولاً.');
      return;
    }
    try {
      await updateSettlementDraft(existing.id, {
        remainingCash: parseFloat(remainingCash) || 0,
        attachments,
        differenceReason: diffReason || undefined,
      });
      toast.success('تم حفظ المسودة');
    } catch (e: any) {
      toast.error(e.message || 'تعذّر الحفظ');
    }
  };

  // ───── Approve/Reject ─────
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = async (settlementId: string) => {
    try {
      await approveSettlement(settlementId);
      toast.success('تم اعتماد التسوية');
    } catch (e: any) {
      toast.error(e.message || 'تعذّر الاعتماد');
    }
  };

  const handleReject = async () => {
    if (!rejectFor || !rejectReason.trim()) {
      toast.error('سبب الرفض مطلوب');
      return;
    }
    try {
      await rejectSettlement(rejectFor, rejectReason.trim());
      toast.success('تم رفض التسوية');
      setRejectFor(null); setRejectReason('');
    } catch (e: any) {
      toast.error(e.message || 'تعذّر الرفض');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((a) => (
            <div
              key={a.id}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border text-sm',
                a.severity === 'high' || a.severity === 'critical'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-amber-300/40 bg-amber-50 text-amber-800 dark:bg-amber-900/10 dark:text-amber-300',
              )}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs opacity-90">{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* بطاقات الملخّص أُزيلت من هنا — الملخّص الموحّد يُعرض في CashLedgerSection بأعلى نفس التبويب */}

      {/* Header + Create */}
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold">سجل الدفعات</h3>
          {showCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" disabled={!canCreate.allowed}>
                  <Plus className="w-3.5 h-3.5" /> دفعة جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md" dir="rtl">
                <DialogHeader>
                  <DialogTitle>إنشاء دفعة جديدة</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>المبلغ المحوّل</Label>
                    <Input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>تاريخ التحويل</Label>
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>ملاحظات (اختياري)</Label>
                    <Textarea
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
                  <Button onClick={handleCreate}>اعتماد التحويل</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {!canCreate.allowed && showCreate && (
          <div className="mb-3 p-3 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-800 dark:text-amber-300 space-y-2">
            <p>⚠️ {canCreate.reason}</p>
            {isAdmin && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-700/30">
                <span className="text-[11px] opacity-80">للحالات الاضطرارية فقط — يُسجَّل في سجل التدقيق</span>
                <Dialog open={emergencyOpen} onOpenChange={setEmergencyOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/5">
                      <AlertTriangle className="w-3 h-3" /> دفعة استثنائية
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                      <DialogTitle className="text-destructive">دفعة استثنائية (تجاوز قاعدة التسوية)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="p-2 rounded-md bg-destructive/5 border border-destructive/30 text-xs text-destructive">
                        ستنشئ دفعة جديدة قبل تسوية الدفعة #{canCreate.blockingFundNumber}. هذا الإجراء يُسجَّل في سجل التدقيق ويظهر باسم "دفعة استثنائية" في الملاحظات.
                      </div>
                      <div>
                        <Label>المبلغ</Label>
                        <Input type="number" value={emAmount} onChange={(e) => setEmAmount(e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <Label>تاريخ التحويل</Label>
                        <Input type="date" value={emDate} onChange={(e) => setEmDate(e.target.value)} />
                      </div>
                      <div>
                        <Label>سبب الاستثناء <span className="text-destructive">*</span></Label>
                        <Textarea
                          value={emReason}
                          onChange={(e) => setEmReason(e.target.value)}
                          rows={3}
                          placeholder="مثال: مدفوعات عاجلة لمورد حرج قبل اكتمال تسوية الدفعة السابقة..."
                        />
                      </div>
                      <div>
                        <Label>ملاحظات إضافية (اختياري)</Label>
                        <Textarea value={emNotes} onChange={(e) => setEmNotes(e.target.value)} rows={2} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEmergencyOpen(false)}>إلغاء</Button>
                      <Button variant="destructive" onClick={handleEmergency}>اعتماد الدفعة الاستثنائية</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        )}

        {projectFundsList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            لا توجد دفعات بعد. {showCreate ? 'ابدأ بإنشاء الدفعة الأولى.' : ''}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>المبلغ</th>
                  <th>تاريخ التحويل</th>
                  <th>الحالة</th>
                  <th>المصروف</th>
                  <th>المتبقي</th>
                  <th className="hidden md:table-cell">العمر</th>
                  <th>التسوية</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projectFundsList.map((f) => {
                  const spent = getFundSpent(f.id, projectExpenses, projectCustodies, projPRs, projTransfers);
                  const calcRemaining = getFundRemaining(f, projectExpenses, projectCustodies, projPRs, projTransfers);
                  const settlement = getSettlementForFund(f.id, fundSettlements);
                  // إذا تمت تسوية الدفعة واعتمدت → اعرض المتبقي وفق التسوية الفعلية (لا المحسوب)
                  // هذا يمنع ظهور رصيد وهمي بيد المدير لدفعة مغلقة بسبب سلفة قائمة لم تُسوَّ بعد
                  const isClosed = f.status === 'settled' || (settlement && settlement.status === 'approved');
                  const remaining = isClosed ? 0 : calcRemaining;
                  const days = daysBetween(f.acknowledgedAt || f.transferDate);
                  const overdue = (f.status === 'transferred' || f.status === 'acknowledged') && days >= 30;
                  return (
                    <tr key={f.id}>
                      <td className="font-mono">#{f.fundNumber}</td>
                      <td className="font-mono text-sm">{formatCurrency(f.amount)}</td>
                      <td className="text-xs">{f.transferDate}</td>
                      <td>
                        <Badge className={cn('text-xs', FUND_STATUS_COLORS[f.status])}>
                          {FUND_STATUS_LABELS[f.status]}
                        </Badge>
                      </td>
                      <td className="font-mono text-xs">{formatCurrency(spent)}</td>
                      <td className={cn(
                        'font-mono text-xs',
                        remaining < 0 && 'text-destructive font-semibold',
                        isClosed && 'text-muted-foreground',
                      )}>
                        {formatCurrency(remaining)}
                      </td>

                      <td className={cn(
                        'hidden md:table-cell text-xs',
                        overdue && 'text-destructive font-semibold',
                      )}>
                        {days} يوم
                      </td>
                      <td>
                        {settlement ? (
                          <Badge className={cn('text-xs', SETTLEMENT_STATUS_COLORS[settlement.status])}>
                            {SETTLEMENT_STATUS_LABELS[settlement.status]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {f.status === 'transferred' && !readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={async () => {
                                try { await acknowledgeFund(f.id); toast.success('تم الإقرار بالاستلام'); }
                                catch (e: any) { toast.error(e.message); }
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3" /> إقرار استلام
                            </Button>
                          )}
                          {(f.status === 'acknowledged' && settlement && (settlement.status === 'draft' || settlement.status === 'rejected')) && !readOnly && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => openSettle(f)}
                            >
                              <Send className="w-3 h-3" /> تسوية
                            </Button>
                          )}
                          {settlement && settlement.status === 'submitted' && isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300"
                                onClick={() => handleApprove(settlement.id)}
                              >
                                <ThumbsUp className="w-3 h-3" /> اعتماد
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                                onClick={() => setRejectFor(settlement.id)}
                              >
                                <ThumbsDown className="w-3 h-3" /> رفض
                              </Button>
                            </>
                          )}
                          {settlement && settlement.status !== 'draft' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => openSettle(f)}
                            >
                              عرض
                            </Button>
                          )}
                          {(isOwner || isAdmin) && f.status !== 'settled' && !readOnly && (
                            <ConfirmDeleteDialog
                              title="حذف الدفعة"
                              description={(() => {
                                const linked = projectExpenses.filter((e) => e.fundId === f.id);
                                const linkedTotal = linked.reduce((s, e) => s + e.amount, 0);
                                const linkedCust = (useStore.getState().custodies || []).filter((c: any) => c.sourceFundId === f.id);
                                const custTotal = linkedCust.reduce((s: number, c: any) => s + c.amount, 0);
                                const parts: string[] = [];
                                if (linked.length > 0) parts.push(`${linked.length} مصروف (${formatCurrency(linkedTotal)})`);
                                if (linkedCust.length > 0) parts.push(`${linkedCust.length} عهدة (${formatCurrency(custTotal)})`);
                                if (parts.length === 0) return `حذف الدفعة #${f.fundNumber}؟`;
                                return `حذف الدفعة #${f.fundNumber}؟ سيتم فك ربط ${parts.join(' و')} — البنود نفسها لن تُحذف.`;
                              })()}
                              onConfirm={async () => {
                                try { await deleteFund(f.id); toast.success('تم الحذف'); }
                                catch (e: any) { toast.error(e.message); }
                              }}
                            />
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
      </div>

      {/* Settlement Dialog */}
      <Dialog open={!!settleFor} onOpenChange={(v) => { if (!v) closeSettle(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              تسوية الدفعة #{settleFor?.fundNumber}
            </DialogTitle>
          </DialogHeader>
          {settleFor && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">المستلم</p>
                  <p className="font-mono font-semibold">{formatCurrency(settleFor.amount)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">المصروف الموثق</p>
                  <p className="font-mono font-semibold">{formatCurrency(settlementSpent)}</p>
                </div>
                <div className={cn(
                  'p-3 rounded-lg border-2',
                  Math.abs(settlementDiff) <= 1
                    ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300/40'
                    : Math.abs(settlementDiff) > 1000
                      ? 'bg-destructive/10 border-destructive/40 animate-pulse'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-300/40',
                )}>
                  <p className="text-xs text-muted-foreground">الفرق</p>
                  <p className={cn(
                    'font-mono font-semibold',
                    Math.abs(settlementDiff) <= 1
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : Math.abs(settlementDiff) > 1000
                        ? 'text-destructive text-lg'
                        : 'text-amber-700 dark:text-amber-400',
                  )}>
                    {formatCurrency(settlementDiff)}
                  </p>
                  {Math.abs(settlementDiff) > 1000 && (
                    <p className="text-xs text-destructive font-semibold mt-1">
                      ⚠️ فرق كبير — يتطلب توضيحاً مفصّلاً
                    </p>
                  )}
              </div>

              {/* تفصيل مكوّنات المصروف الموثق */}
              {settleFor && (() => {
                const direct = getFundDirectSpent(settleFor.id, projectExpenses, projectCustodies);
                const custDraw = getFundCustodyDraw(settleFor.id, projectCustodies);
                const advances = getFundOutstandingAdvances(settleFor.id, projPRs);
                const transOut = getFundCashTransfersOut(settleFor.id, projTransfers);
                return (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>مصروف مباشر: <span className="font-mono text-foreground">{formatCurrency(direct)}</span></div>
                    <div>عهد مسحوبة: <span className="font-mono text-foreground">{formatCurrency(custDraw)}</span></div>
                    <div>سلف قائمة: <span className="font-mono text-foreground">{formatCurrency(advances)}</span></div>
                    <div>تحويلات نقدية: <span className="font-mono text-foreground">{formatCurrency(transOut)}</span></div>
                  </div>
                );
              })()}

              </div>

              <div>
                <Label>المتبقي النقدي المُعاد</Label>
                <Input
                  type="number"
                  value={remainingCash}
                  onChange={(e) => setRemainingCash(e.target.value)}
                  disabled={!!getSettlementForFund(settleFor.id, fundSettlements) &&
                    getSettlementForFund(settleFor.id, fundSettlements)!.status !== 'draft' &&
                    getSettlementForFund(settleFor.id, fundSettlements)!.status !== 'rejected'}
                />
              </div>

              {Math.abs(settlementDiff) > 1 && (
                <div>
                  <Label>سبب الفرق <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={diffReason}
                    onChange={(e) => setDiffReason(e.target.value)}
                    rows={2}
                    placeholder="مثال: مصروف نقدي بدون فاتورة..."
                    disabled={!!getSettlementForFund(settleFor.id, fundSettlements) &&
                      getSettlementForFund(settleFor.id, fundSettlements)!.status !== 'draft' &&
                      getSettlementForFund(settleFor.id, fundSettlements)!.status !== 'rejected'}
                  />
                </div>
              )}

              <div>
                <Label>المرفقات (فواتير)</Label>
                <div className="space-y-2 mt-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 border rounded-md text-sm">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="flex-1">{a.name}</span>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener" className="text-xs text-primary underline">
                          فتح
                        </a>
                      )}
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => removeAttachment(i)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="اسم المرفق"
                      value={attachName}
                      onChange={(e) => setAttachName(e.target.value)}
                      className="text-xs"
                    />
                    <Input
                      placeholder="رابط (اختياري)"
                      value={attachUrl}
                      onChange={(e) => setAttachUrl(e.target.value)}
                      className="text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={addAttachment}>إضافة</Button>
                  </div>
                </div>
              </div>

              {(() => {
                const existing = getSettlementForFund(settleFor.id, fundSettlements);
                if (!existing) return null;
                if (existing.status === 'rejected' && existing.rejectionReason) {
                  return (
                    <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                      <strong>سبب الرفض:</strong> {existing.rejectionReason}
                    </div>
                  );
                }
                if (existing.status === 'approved') {
                  return (
                    <div className="p-3 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 text-sm text-emerald-700 dark:text-emerald-400">
                      ✓ مُعتمدة في {existing.approvalDate?.split('T')[0]}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeSettle}>إغلاق</Button>
            {settleFor && (() => {
              const existing = getSettlementForFund(settleFor.id, fundSettlements);
              const editable = !existing || existing.status === 'draft' || existing.status === 'rejected';
              if (!editable || readOnly) return null;
              return (
                <>
                  <Button variant="outline" onClick={handleSaveDraft}>حفظ مسودة</Button>
                  <Button onClick={handleSubmitSettlement}>إرسال للاعتماد</Button>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(v) => { if (!v) { setRejectFor(null); setRejectReason(''); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض التسوية</DialogTitle>
          </DialogHeader>
          <div>
            <Label>سبب الرفض</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setRejectReason(''); }}>إلغاء</Button>
            <Button variant="destructive" onClick={handleReject}>رفض التسوية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
