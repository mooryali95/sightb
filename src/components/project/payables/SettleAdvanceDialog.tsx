/**
 * The settle-advance dialog, with the reversal confirmation it opens.
 *
 * Five modes decide how much money leaves which ledger: documented (an
 * expense that enters AC), cash refund (back to the fund or custody), a
 * compound of the two, payroll deduction and an admin-only write-off. When a
 * documented invoice exceeds what is outstanding the dialog switches to a
 * split, and the overflow must come out of a named fund or custody.
 *
 * `settlementMath` is the single place the operation is computed: the
 * progress bar, the overflow warning, the confirm guard and the amount sent
 * on the wire all read it, so the preview cannot disagree with the action.
 *
 * The section remounts this component (via `key`) each time it opens, so the
 * form starts from the advance's current remainder and needs no reset.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RotateCcw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import type {
  AdvanceSettlementType,
  BudgetItem,
  Custody,
  PaymentRequest,
  ProjectFund,
  Resource,
} from '@/types/project';

/** The settle-advance dialog's modes: the four settlement types plus a refund-and-document compound. */
type AdvanceSettlementMode = AdvanceSettlementType | 'compound';

/** A fund or custody the section has already found to hold a balance. */
export interface AvailableFund { fund: ProjectFund; remaining: number }
export interface AvailableCustody { custody: Custody; remaining: number }

interface Props {
  /** The outstanding advance being settled; the dialog is closed when absent. */
  advance: PaymentRequest | undefined;
  onClose: () => void;
  isAdmin: boolean;
  canEdit: boolean;
  projResources: Resource[];
  projBudgetItems: BudgetItem[];
  availableFunds: AvailableFund[];
  availableCustodies: AvailableCustody[];
}

export function SettleAdvanceDialog({
  advance, onClose, isAdmin, canEdit, projResources, projBudgetItems,
  availableFunds, availableCustodies,
}: Props) {
  const {
    settlementEvents, expenses, projectFunds, custodies,
    settleAdvance, settleAdvanceWithSplit, reverseSettlementEvent,
  } = useStore();

  // Starting values, read once: the parent remounts this dialog on every open.
  const outstandingAtOpen = advance ? Math.max(advance.amount - (advance.refundedAmount ?? 0), 0) : 0;
  const linkedBudget = advance?.budgetItemId
    ? projBudgetItems.find((b) => b.id === advance.budgetItemId)
    : undefined;

  const [saType, setSaType] = useState<AdvanceSettlementMode>('documented');
  const [saAmount, setSaAmount] = useState(advance ? String(outstandingAtOpen) : '');
  const [saRefundAmount, setSaRefundAmount] = useState('');
  const [saDocAmount, setSaDocAmount] = useState('');
  const [saNotes, setSaNotes] = useState('');
  const [saCategory, setSaCategory] = useState<string>((linkedBudget?.category as string) || 'other');
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
    if (!advance) return [] as Row[];
    const evs = settlementEvents.filter((e) => e.paymentRequestId === advance.id);
    const reversedMap = new Map<string, string>();
    evs.forEach((e) => {
      if (e.eventType === 'reverse' && e.reversedEventId) reversedMap.set(e.reversedEventId, e.id);
    });
    return evs.map<Row>((e) => {
      const label = e.eventType === 'cash_refund' ? 'رد نقدي'
        : e.eventType === 'documented' ? 'تسوية بمستندات'
        : e.eventType === 'payroll_deduction' ? 'تحوّلت إلى حافز أو مستحق'
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
  }, [advance, settlementEvents, expenses, projectFunds, custodies]);



  // ─── Settlement math (live preview) ───
  const settlementMath = useMemo(() => {
    if (!advance) return { amount: 0, prev: 0, outstanding: 0, thisOp: 0, remainder: 0, overflow: false, overflowAmount: 0 };
    const amount = advance.amount;
    const prev = advance.refundedAmount ?? 0;
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
  }, [advance, saType, saAmount, saRefundAmount, saDocAmount]);

  const handleSettleAdvance = async () => {
    if (!advance) return;
    if (saType === 'written_off' && !isAdmin) { toast.error('الشطب صلاحية مدير فقط'); return; }
    if (saType === 'written_off' && !saNotes.trim()) { toast.error('سبب الشطب مطلوب'); return; }
    if (settlementMath.overflow) { toast.error('المبلغ يتجاوز المتبقي القائم'); return; }
    try {
      // Split Expense: documented with invoice > outstanding
      if (saType === 'documented' && settlementMath.overflowAmount > 0) {
        if (!saOverflowSource) { toast.error('اختر مصدر تغطية الجزء الفائض'); return; }
        const [kind, srcId] = saOverflowSource.split(':');
        await settleAdvanceWithSplit(advance.id, {
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
          await settleAdvance(advance.id, { type: 'cash_refund', notes: saNotes, settledAmount: refundAmt });
          refundDone = true;
        }
        if (docAmt > 0) {
          try {
            await settleAdvance(advance.id, { type: 'documented', notes: saNotes, settledAmount: docAmt, expenseCategory: saCategory });
          } catch (e) {
            if (refundDone) { toast.warning('تم الرد لكن فشل التوثيق: ' + errorMessage(e, '')); return; }
            throw e;
          }
        }
        toast.success('تمت التسوية المركّبة');
      } else {
        await settleAdvance(advance.id, {
          type: saType,
          notes: saNotes,
          settledAmount: settlementMath.thisOp,
          expenseCategory: saCategory,
        });
        toast.success('تمت تسوية السلفة');
      }
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <>
      {/* Settle Advance Dialog */}
      <Dialog open={!!advance} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>تسوية سلفة قائمة</DialogTitle>
          </DialogHeader>
          {advance && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/40 rounded text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المورد</span>
                  <span className="font-semibold">
                    {projResources.find((r) => r.id === advance.resourceId)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مبلغ السلفة</span>
                  <span className="font-mono font-bold">{formatCurrency(advance.amount)}</span>
                </div>
                {(advance.refundedAmount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">مردود سابقاً</span>
                      <span className="font-mono">{formatCurrency(advance.refundedAmount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                      <span>المتبقي القائم</span>
                      <span className="font-mono">
                        {formatCurrency(Math.max(advance.amount - (advance.refundedAmount ?? 0), 0))}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المصدر</span>
                  <span className="text-xs text-end">
                    {advance.paidFromCustodyId
                      ? `عهدة ${custodies.find((c) => c.id === advance.paidFromCustodyId)?.resourceName ?? ''}`
                      : advance.paidFromFundId
                        ? `دفعة #${projectFunds.find((f) => f.id === advance.paidFromFundId)?.fundNumber ?? ''}`
                        : '—'}
                    <span className="block text-xs text-muted-foreground">
                      التسوية تُقيَّد على المصدر نفسه الذي صُرفت منه السلفة
                    </span>
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
                          className="h-full bg-muted-foreground/40 transition-[width]"
                          style={{ width: `${prevPct}%` }}
                          title={`مسوّى سابقاً: ${formatCurrency(prev)}`}
                        />
                      )}
                      {opPct > 0 && (
                        <div
                          className={cn('h-full transition-[width]', overflow ? 'bg-destructive' : 'bg-primary')}
                          style={{ width: `${opPct}%` }}
                          title={`هذه العملية: ${formatCurrency(opVisible)}`}
                        />
                      )}
                      {overflowPct > 0 && (
                        <div
                          className="h-full bg-warning transition-[width]"
                          style={{ width: `${overflowPct}%` }}
                          title={`فائض (مصروف جديد): ${formatCurrency(overflowAmount)}`}
                        />
                      )}
                      {remPct > 0 && !overflow && (
                        <div
                          className="h-full bg-warning/60 transition-[width]"
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
                              <Badge variant="secondary" className="h-4 px-1 text-xs shrink-0">
                                + فائض {formatCurrency(ev.overflowAmount)}
                                {ev.overflowSourceLabel ? ` · ${ev.overflowSourceLabel}` : ''}
                              </Badge>
                            )}
                            {ev.reversed && (
                              <Badge variant="outline" className="h-4 px-1 text-xs">ملغى</Badge>
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
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
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
    </>
  );
}
