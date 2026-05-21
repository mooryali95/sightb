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
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { supabase } from '@/integrations/supabase/client';
import { getFundSpent, getFundCustodyDraw } from '@/lib/funds';
import { useRole } from '@/hooks/useRole';

interface CustodySectionProps {
  projectId: string;
  companyId: string;
  custodies: Custody[];
  expenses: any[];
  readOnly?: boolean;
}

export function CustodySection({ projectId, companyId, custodies, expenses, readOnly = false }: CustodySectionProps) {
  const { addCustody, updateCustody, deleteCustody, projectFunds } = useStore();
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

  const availableFunds = useMemo(
    () => projectFunds
      .filter((f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'))
      .map((f) => {
        const spent = getFundSpent(f.id, expenses, custodies);
        return { ...f, remaining: f.amount - spent };
      })
      .filter((f) => f.remaining > 0)
      .sort((a, b) => b.fundNumber - a.fundNumber),
    [projectFunds, projectId, expenses, custodies],
  );

  // افتراضياً اختر أحدث دفعة متاحة عند فتح النموذج
  useEffect(() => {
    if (open && sourceFundId === 'none' && availableFunds.length > 0) {
      setSourceFundId(availableFunds[0].id);
    }
  }, [open, availableFunds.length]);

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
    const spent = expenses.filter((e: any) => e.custodyId === c.id).reduce((s: number, e: any) => s + e.amount, 0);
    return { ...c, spent, remaining: c.amount - spent };
  });

  // Auto-close exhausted custodies
  useEffect(() => {
    enrichedCustodies.forEach(async (c) => {
      if (c.remaining <= 0 && c.status === 'active' && !c.closedDate) {
        await (supabase as any).from('custodies').update({
          status: 'closed',
          closed_date: new Date().toISOString().split('T')[0],
        }).eq('id', c.id);
      }
    });
  }, [enrichedCustodies.map(c => `${c.id}:${c.remaining}`).join(',')]);

  const totalAmount = enrichedCustodies.reduce((s, c) => s + c.amount, 0);
  const totalSpent = enrichedCustodies.reduce((s, c) => s + c.spent, 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">سجل العهد</h3>
          <p className="text-xs text-muted-foreground">
            إجمالي العهد: {formatCurrency(totalAmount)} · المصروف: {formatCurrency(totalSpent)} · المتبقي: {formatCurrency(totalAmount - totalSpent)}
          </p>
        </div>
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

      {enrichedCustodies.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد عهد مسجلة بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>المستلم</th>
                <th>مبلغ العهدة</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                <th className="hidden sm:table-cell">نسبة الصرف</th>
                <th>الاستلام</th>
                <th>الحالة</th>
                <th className="hidden md:table-cell">ملاحظات</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {enrichedCustodies.map((c) => {
                const pct = c.amount > 0 ? (c.spent / c.amount) * 100 : 0;
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
                    <td className="font-mono text-sm">{formatCurrency(c.spent)}</td>
                    <td>
                      <span className={c.remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(c.remaining)}</span>
                      {c.remaining <= 0 && (
                        <span className="text-xs text-destructive mr-1">⚠️ مستنفدة</span>
                      )}
                      {c.remaining > 0 && c.remaining < c.amount * 0.1 && (
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
                      {c.remaining <= 0 ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مُغلقة</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">نشطة</span>
                      )}
                    </td>
                    <td className="text-muted-foreground text-xs hidden md:table-cell">{c.notes || '—'}</td>
                    {!readOnly && (
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          {!c.sourceFundId && isAdmin && availableFunds.length > 0 && (
                            <Select
                              value=""
                              onValueChange={async (fid) => {
                                if (!fid) return;
                                const f = availableFunds.find(x => x.id === fid);
                                if (!f) return;
                                if (f.remaining < c.amount - c.spent) {
                                  toast.error(`رصيد الدفعة لا يكفي. المتاح: ${formatCurrency(f.remaining)}, المطلوب: ${formatCurrency(c.amount - c.spent)}`);
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
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
