import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { type Custody } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, Pencil, ArrowDownToLine, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';

import { getFundSpent, getFundCustodyDraw, getCustodyCashTransfersIn, getFundRemaining, getCustodyBreakdown, getCustodyTransferSources } from '@/lib/funds';
import { useRole } from '@/hooks/useRole';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';

interface CustodySectionProps {
  projectId: string;
  companyId: string;
  custodies: Custody[];
  expenses: any[];
  readOnly?: boolean;
}

export function CustodySection({ projectId, companyId, custodies, expenses, readOnly = false }: CustodySectionProps) {
  const { addCustody, updateCustody, deleteCustody, projectFunds, paymentRequests, cashTransfers, createCashTransfer, deleteCashTransfer, refreshCashDerivations } = useStore();
  const projPRs = useMemo(() => paymentRequests.filter((p) => p.projectId === projectId), [paymentRequests, projectId]);
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );
  const { isAdminFor } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resourceName, setResourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sourceFundId, setSourceFundId] = useState<string>('none');
  const [unlinkReason, setUnlinkReason] = useState('');
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  // ─── Cash transfer dialog state ───
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferCustodyId, setTransferCustodyId] = useState<string>('');
  const [transferFundId, setTransferFundId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferNotes, setTransferNotes] = useState('');

  const availableFunds = useMemo(
    () => projectFunds
      .filter((f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'))
      .map((f) => {
        const remaining = getFundRemaining(f, expenses, custodies, projPRs, projTransfers);
        return { ...f, remaining };
      })
      .filter((f) => f.remaining > 0)
      .sort((a, b) => b.fundNumber - a.fundNumber),
    [projectFunds, projectId, expenses, custodies, projPRs, projTransfers],
  );

  // افتراضياً اختر أحدث دفعة متاحة عند فتح النموذج
  useEffect(() => {
    if (open && sourceFundId === 'none' && availableFunds.length > 0) {
      setSourceFundId(availableFunds[0].id);
    }
    // Settles after one pass: the guard requires sourceFundId === 'none', which
    // the setter clears. `availableFunds` is memoized, so its identity is stable.
  }, [open, availableFunds, sourceFundId]);

  const fundsExist = availableFunds.length > 0;
  const isUnlinked = sourceFundId === 'none';
  const requiresUnlinkReason = fundsExist && isUnlinked;

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setResourceName(c.resourceName);
    setAmount(String(c.amount));
    setNotes(c.notes || '');
    setReceivedDate(c.receivedDate || new Date().toISOString().split('T')[0]);
    setSourceFundId(c.sourceFundId || 'none');
    setUnlinkReason('');
    setOpen(true);
  };

  const handleAdd = async () => {
    if (!resourceName.trim() || !amount) return;
    if (fundsExist && isUnlinked && !isAdmin) {
      toast.error('يجب ربط العهدة بدفعة نشطة. تواصل مع المدير لإنشاء عهدة بدون ربط.');
      return;
    }
    if (requiresUnlinkReason && !editingId && (!unlinkReason.trim() || unlinkReason.trim().length < 10)) {
      toast.error('سبب عدم الربط بدفعة مطلوب (10 أحرف على الأقل)');
      return;
    }
    try {
      const finalNotes = requiresUnlinkReason && !editingId
        ? `[عهدة غير مربوطة بدفعة] ${unlinkReason.trim()}${notes.trim() ? ` — ${notes.trim()}` : ''}`
        : (notes.trim() || undefined);
      if (editingId) {
        const original = custodies.find(c => c.id === editingId);
        const spent = expenses.filter((e: any) => e.custodyId === editingId).reduce((s: number, e: any) => s + e.amount, 0);
        const newAmt = parseFloat(amount);
        if (original && newAmt !== original.amount && newAmt < spent) {
          toast.error(`لا يمكن تخفيض المبلغ تحت ${formatCurrency(spent)} (المصروف عليها)`);
          return;
        }
        await updateCustody(editingId, {
          resourceName: resourceName.trim(),
          amount: newAmt,
          notes: finalNotes ?? null,
          receivedDate,
          sourceFundId: sourceFundId !== 'none' ? sourceFundId : null,
        } as any);
        toast.success('تم تعديل العهدة');
      } else {
        await addCustody({
          projectId,
          resourceName: resourceName.trim(),
          amount: parseFloat(amount),
          notes: finalNotes,
          status: 'active',
          receivedDate,
          sourceFundId: sourceFundId !== 'none' ? sourceFundId : undefined,
        } as any);
        toast.success('تمت إضافة العهدة');
      }
      setEditingId(null);
      setResourceName(''); setAmount(''); setNotes(''); setUnlinkReason('');
      setReceivedDate(new Date().toISOString().split('T')[0]);
      setSourceFundId('none');
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'تعذّر حفظ العهدة');
    }
  };

  const enrichedCustodies = custodies.map(c => {
    const bd = getCustodyBreakdown(c, expenses as any, projTransfers, projPRs);
    const transferSources = getCustodyTransferSources(c.id, projTransfers, projectFunds);
    return {
      ...c,
      breakdown: bd,
      transferSources,
      orphanTransfers: transferSources.filter((t) => t.orphan),
      // Closed by hand, or exhausted: either way nothing more can be spent.
      isClosed: c.status === 'closed' || bd.remaining <= 0,
      spent: bd.spent,
      transfersIn: bd.transfersIn,
      outstandingAdvances: bd.outstandingAdvances,
      effectiveAmount: bd.availableAmount,
      remaining: bd.remaining,
      spendPercent: bd.spendPercent,
    };
  });

  // Auto-close exhausted custodies (via Zustand updateCustody — keeps state in sync)
  //
  // NOTE: `trg_auto_close_custody` on public.expenses already does this in the
  // database, and the two disagree on what "exhausted" means. The trigger
  // compares SUM(expenses) against custodies.amount alone; `remaining` below
  // also credits incoming cash transfers and debits outstanding advances. The
  // trigger additionally *re-opens* a custody whenever spend drops back under
  // the base amount, so it can revert a close performed here. Reconciling the
  // two definitions is tracked as P1-01 in docs/production-readiness-2026-08.md;
  // neither side is removed here because that needs a live database to verify.
  const custodyRemainingKey = enrichedCustodies.map((c) => `${c.id}:${c.remaining}`).join(',');
  useEffect(() => {
    enrichedCustodies.forEach(async (c) => {
      if (c.remaining <= 0 && c.status === 'active' && !c.closedDate) {
        try {
          await updateCustody(c.id, {
            status: 'closed',
            closedDate: new Date().toISOString().split('T')[0],
          } as any);
        } catch { /* silent — background close */ }
      }
    });
    // Deliberately keyed on the id:remaining digest rather than the array.
    // `enrichedCustodies` is rebuilt on every render, so depending on it would
    // re-run this write-effect each render — an unbounded loop of UPDATEs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custodyRemainingKey]);

  const totalAmount = enrichedCustodies.reduce((s, c) => s + c.effectiveAmount, 0);
  const totalSpent = enrichedCustodies.reduce((s, c) => s + c.spent, 0);
  // Summed from the rows, not recomputed as total − spent: the rows also
  // debit outstanding advances, and the header must say the same number.
  const totalRemaining = enrichedCustodies.reduce((s, c) => s + c.remaining, 0);


  const openTransfer = (custodyId: string) => {
    setTransferCustodyId(custodyId);
    setTransferFundId(availableFunds[0]?.id || '');
    setTransferAmount('');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferNotes('');
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    if (!transferFundId) { toast.error('اختر الدفعة المصدر'); return; }
    if (!transferCustodyId) { toast.error('اختر العهدة المستهدفة'); return; }
    const fund = availableFunds.find(f => f.id === transferFundId);
    if (!fund) { toast.error('الدفعة غير موجودة'); return; }
    if (amt > fund.remaining) {
      toast.error(`المبلغ يتجاوز رصيد الدفعة المتاح (${formatCurrency(fund.remaining)})`);
      return;
    }
    try {
      await createCashTransfer({
        projectId,
        fromFundId: transferFundId,
        toCustodyId: transferCustodyId,
        amount: amt,
        transferDate,
        notes: transferNotes.trim() || undefined,
      });
      toast.success('تم تسجيل تحويل النقد');
      setTransferOpen(false);
    } catch (e: any) {
      // رفض الخادم يعني أن أرقام الواجهة قديمة — أعد المزامنة فوراً
      await refreshCashDerivations?.(projectId).catch(() => undefined);
      toast.error(`${e.message || 'تعذّر تسجيل التحويل'} — تم تحديث الأرصدة من الخادم`);
    }
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">سجل العهد</h3>
          <p className="text-xs text-muted-foreground">
            إجمالي العهد: {formatCurrency(totalAmount)} · المصروف: {formatCurrency(totalSpent)} · المتبقي: {formatCurrency(totalRemaining)}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {!readOnly && (
        <ResponsiveFormDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          title="تحويل نقد من المدير إلى عهدة"
          trigger={<Button size="sm" variant="outline" className="gap-1.5"><ArrowDownToLine className="w-3.5 h-3.5" />تحويل نقد</Button>}
          footer={<FormFooter onCancel={() => setTransferOpen(false)} onSubmit={handleTransfer} submitLabel="تسجيل التحويل" />}
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              يحوّل مبلغاً من النقد المتبقي بيد المدير (دفعة مصدر) إلى رصيد عهدة قائمة. لا يُحتسب كمصروف.
            </p>
            <div className="space-y-2">
              <Label>الدفعة المصدر</Label>
              <Select value={transferFundId} onValueChange={setTransferFundId}>
                <SelectTrigger><SelectValue placeholder="اختر دفعة" /></SelectTrigger>
                <SelectContent>
                  {availableFunds.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>العهدة المستهدفة</Label>
              <Select value={transferCustodyId} onValueChange={setTransferCustodyId}>
                <SelectTrigger><SelectValue placeholder="اختر عهدة" /></SelectTrigger>
                <SelectContent>
                  {enrichedCustodies.filter(c => c.status === 'active').map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.resourceName} — رصيد {formatCurrency(c.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="مثال: تعزيز عهدة المشتريات" />
            </div>
          </div>
        </ResponsiveFormDialog>
        )}
        {!readOnly && (

        <ResponsiveFormDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditingId(null);
              setResourceName(''); setAmount(''); setNotes(''); setUnlinkReason('');
              setReceivedDate(new Date().toISOString().split('T')[0]);
              setSourceFundId('none');
            }
          }}
          title={editingId ? 'تعديل العهدة' : 'إضافة عهدة جديدة'}
          trigger={<Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />عهدة جديدة</Button>}
          footer={<FormFooter onCancel={() => setOpen(false)} onSubmit={handleAdd} submitLabel={editingId ? 'حفظ' : 'إضافة'} />}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المستلم</Label>
              <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} placeholder="مثال: عمر أحمد" />
            </div>
            <div className="space-y-2">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>مصدر العهدة (الدفعة) {fundsExist && <span className="text-destructive">*</span>}</Label>
              <Select value={sourceFundId} onValueChange={setSourceFundId}>
                <SelectTrigger><SelectValue placeholder="اختر الدفعة المصدر" /></SelectTrigger>
                <SelectContent>
                  {(!fundsExist || isAdmin) && (
                    <SelectItem value="none">
                      {fundsExist ? '⚠️ بدون ربط (إدارة فقط — يتطلب مبرر)' : 'بدون ربط بدفعة (لا توجد دفعات نشطة)'}
                    </SelectItem>
                  )}
                  {availableFunds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {fundsExist
                  ? 'الربط بدفعة إلزامي للحفاظ على دقة المحاسبة. يُخصم مبلغ العهدة فوراً من رصيد الدفعة.'
                  : 'لا توجد دفعات نشطة — يمكن إنشاء العهدة بدون ربط.'}
              </p>
            </div>
            {requiresUnlinkReason && (
              <div className="space-y-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
                <Label className="text-destructive">سبب عدم الربط بدفعة <span className="text-destructive">*</span></Label>
                <Input
                  value={unlinkReason}
                  onChange={(e) => setUnlinkReason(e.target.value)}
                  placeholder="مثال: عهدة طارئة بانتظار اعتماد دفعة جديدة"
                />
                <p className="text-xs text-destructive/80">سيُحفظ السبب في ملاحظات العهدة كأثر تدقيق.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>تاريخ استلام العهدة</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: عهدة مشتريات شهر مارس" />
            </div>
          </div>
        </ResponsiveFormDialog>
        )}
        <p className="text-xs text-muted-foreground mt-2">العهدة مرتبطة بالمصروفات — عند إضافة مصروف يمكن ربطه بعهدة ليُخصم منها تلقائياً</p>
        </div>
      </div>

      {enrichedCustodies.length === 0 ? (

        <p className="text-sm text-muted-foreground text-center py-8">لا توجد عهد مسجلة بعد</p>
      ) : (
        <>
        <div className="flex justify-end mb-2"><TableDensityToggle /></div>
        <div className="data-table-wrapper data-table-wrapper--scroll">
          <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
            <thead>
              <tr>
                <th>المستلم</th>
                <th>مبلغ العهدة</th>
                <th className="hidden sm:table-cell">تحويلات واردة</th>
                <th>الإجمالي المتاح</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                <th className="hidden sm:table-cell">نسبة الصرف</th>
                <th>الاستلام</th>
                <th>الحالة</th>
                <th className="hidden md:table-cell">ملاحظات</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enrichedCustodies.map((c) => {
                const pct = c.spendPercent;
                return (
                  <tr key={c.id} className={pct > 100 ? 'bg-destructive/5' : ''}>

                    <td className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{c.resourceName}</span>
                        {c.sourceFundId ? (() => {
                          const sf = projectFunds.find(f => f.id === c.sourceFundId);
                          return sf ? (
                            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning w-fit">
                              من دفعة #{sf.fundNumber}
                            </Badge>
                          ) : null;
                        })() : (
                          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive w-fit">
                            غير مرتبطة بدفعة
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(c.amount)}</td>
                    <td className="font-mono text-sm hidden sm:table-cell">
                      {c.transfersIn > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-primary">+{formatCurrency(c.transfersIn)}</span>
                          <div className="flex flex-wrap gap-1">
                            {c.transferSources.map((t) => (
                              <Badge
                                key={t.transferId}
                                variant="outline"
                                className={`text-[10px] w-fit ${t.orphan
                                  ? 'border-destructive/50 text-destructive'
                                  : 'border-primary/40 text-primary'}`}
                                title={`${formatCurrency(t.amount)} · ${t.transferDate}`}
                              >
                                {t.orphan ? 'مصدر مفقود ⚠' : `من دفعة #${t.fundNumber}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="font-mono text-sm font-semibold">{formatCurrency(c.effectiveAmount)}</td>
                    <td className="font-mono text-sm">
                      {formatCurrency(c.spent)}
                      {c.outstandingAdvances > 0 && (
                        <span className="block text-[10px] text-warning">+ سلف {formatCurrency(c.outstandingAdvances)}</span>
                      )}
                    </td>
                    <td>
                      <span className={c.remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(c.remaining)}</span>
                      {c.remaining <= 0 && (
                        <span className="text-xs text-destructive mr-1">⚠️ مستنفدة</span>
                      )}
                      {c.remaining > 0 && c.remaining < c.effectiveAmount * 0.1 && (
                        <span className="text-xs text-warning mr-1">⚠️ أقل من 10%</span>
                      )}
                    </td>

                    <td className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground">{c.receivedDate || '—'}</td>
                    <td>
                      {c.isClosed ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مُغلقة</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">نشطة</span>
                      )}
                    </td>
                    <td className="text-muted-foreground text-xs hidden md:table-cell">{c.notes || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setInspectorId(c.id)} title="عرض التفاصيل">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {!readOnly && (
                          <>
                            {!c.sourceFundId && isAdmin && availableFunds.length > 0 && (
                              <Select
                                value=""
                                onValueChange={async (fid) => {
                                  if (!fid) return;
                                  const f = availableFunds.find(x => x.id === fid);
                                  if (!f) return;
                                  // ربط العهدة بدفعة يسحب مبلغ العهدة الأساسي كاملاً من الدفعة
                                  if (f.remaining < c.amount) {
                                    toast.error(`رصيد الدفعة لا يكفي. المتاح: ${formatCurrency(f.remaining)}, المطلوب: ${formatCurrency(c.amount)}`);
                                    return;
                                  }

                                  try {
                                    await updateCustody(c.id, { sourceFundId: fid } as any);
                                    toast.success(`تم ربط العهدة بالدفعة #${f.fundNumber}`);
                                  } catch (e: any) {
                                    toast.error(e.message || 'تعذّر الربط');
                                  }
                                }}
                              >
                                <SelectTrigger className="h-7 w-[140px] text-xs">
                                  <SelectValue placeholder="ربط بدفعة" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFunds.map(f => (
                                    <SelectItem key={f.id} value={f.id} className="text-xs">
                                      دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} title="تعديل العهدة">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <ConfirmDeleteDialog title="حذف العهدة" description={c.spent > 0 ? `⚠️ هذه العهدة عليها ${formatCurrency(c.spent)} من المصروفات. الحذف سيُسقط الربط مع تلك المصروفات. متابعة؟` : 'هل أنت متأكد من حذف هذه العهدة؟'} onConfirm={() => deleteCustody(c.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {(() => {
        const c = inspectorId ? enrichedCustodies.find(x => x.id === inspectorId) : null;
        if (!c) return null;
        const sf = c.sourceFundId ? projectFunds.find(f => f.id === c.sourceFundId) : null;
        const linkedExpenses = expenses.filter((e: any) => e.custodyId === c.id);
        const pct = c.spendPercent;
        return (
          <InspectorPanel
            open={!!inspectorId}
            onOpenChange={(o) => !o && setInspectorId(null)}
            title={c.resourceName}
            description="تفاصيل العهدة والمصروفات المرتبطة بها"
            meta={c.isClosed
              ? <Badge variant="outline" className="text-[10px] bg-muted">مُغلقة</Badge>
              : <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">نشطة</Badge>}
            width="lg"
            footer={!readOnly && (
              <Button size="sm" onClick={() => { openEdit(c); setInspectorId(null); }}>
                <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
              </Button>
            )}
          >
            <InspectorKpiStrip
              items={[
                { label: 'مبلغ العهدة', value: formatCurrency(c.amount) },
                { label: 'تحويلات واردة', value: formatCurrency(c.transfersIn), tone: c.transfersIn > 0 ? 'info' : 'default' },
                { label: 'الإجمالي المتاح', value: formatCurrency(c.effectiveAmount) },
                { label: 'المصروف', value: formatCurrency(c.spent), tone: 'warning' },
                { label: 'المتبقي', value: formatCurrency(c.remaining), tone: c.remaining > 0 ? 'success' : 'destructive' },
              ]}
            />

            <InspectorSection title="معادلة الرصيد">
              <div className="text-xs font-mono leading-6 bg-muted/40 rounded-md p-3 space-y-0.5">
                <div>مبلغ العهدة: {formatCurrency(c.amount)}</div>
                <div>+ تحويلات نقدية واردة: {formatCurrency(c.transfersIn)}</div>
                <div>= الإجمالي المتاح: {formatCurrency(c.effectiveAmount)}</div>
                <div>− المصروفات المرتبطة: {formatCurrency(c.spent)}</div>
                <div>− سلف قائمة من العهدة: {formatCurrency(c.outstandingAdvances)}</div>
                <div className="border-t border-border pt-0.5 font-semibold">= المتبقي: {formatCurrency(c.remaining)}</div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                محسوب عبر <span className="font-mono">getCustodyBreakdown()</span> — نفس المصدر المستخدم في كل الشاشات.
              </p>
            </InspectorSection>

            <InspectorSection title="أصل التحويلات النقدية الواردة">
              {c.transferSources.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد تحويلات نقدية واردة لهذه العهدة.</p>
              ) : (
                <div className="space-y-1">
                  {c.transferSources.map((t) => (
                    <div
                      key={t.transferId}
                      className="flex items-center justify-between gap-2 text-xs border border-border/60 rounded-md px-2 py-1.5"
                    >
                      <span className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${t.orphan ? 'border-destructive/50 text-destructive' : 'border-primary/40 text-primary'}`}
                        >
                          {t.orphan ? 'مصدر مفقود' : `دفعة #${t.fundNumber}`}
                        </Badge>
                        <span className="text-muted-foreground font-mono">{t.transferDate}</span>
                      </span>
                      <span className="font-mono">+{formatCurrency(t.amount)}</span>
                    </div>
                  ))}
                  {c.orphanTransfers.length > 0 && (
                    <p className="text-[11px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                      تحويل بلا دفعة مصدر (الدفعة محذوفة) — يجب حذف التحويل أو إعادة ربطه بدفعة قائمة حتى يبقى كل ريال في العهدة له أصل.
                    </p>
                  )}
                </div>
              )}
            </InspectorSection>




            <InspectorSection title="نسبة الصرف">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: pct > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums">{pct.toFixed(0)}%</span>
              </div>
            </InspectorSection>

            <InspectorSection title="المصدر">
              <InspectorField
                label="الدفعة المصدر"
                value={sf ? `دفعة #${sf.fundNumber}` : <span className="text-destructive">غير مرتبطة</span>}
              />
              <InspectorField label="تاريخ الاستلام" value={c.receivedDate || '—'} mono />
              {c.closedDate && <InspectorField label="تاريخ الإغلاق" value={c.closedDate} mono />}
            </InspectorSection>

            {c.notes && (
              <InspectorSection title="ملاحظات">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{c.notes}</p>
              </InspectorSection>
            )}

            <InspectorSection title={`المصروفات المرتبطة (${linkedExpenses.length})`}>
              {linkedExpenses.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد مصروفات مرتبطة بهذه العهدة بعد.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {linkedExpenses.slice(0, 50).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md border border-border/50 bg-muted/30">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{e.description || e.category || 'مصروف'}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">{e.date || '—'}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(e.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </InspectorSection>
          </InspectorPanel>
        );
      })()}
    </div>
  );
}
