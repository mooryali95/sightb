import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { type Custody } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { supabase } from '@/integrations/supabase/client';

interface CustodySectionProps {
  projectId: string;
  companyId: string;
  custodies: Custody[];
  expenses: any[];
  readOnly?: boolean;
}

export function CustodySection({ projectId, companyId, custodies, expenses, readOnly = false }: CustodySectionProps) {
  const { addCustody, deleteCustody } = useStore();
  const [open, setOpen] = useState(false);
  const [resourceName, setResourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);

  const handleAdd = async () => {
    if (!resourceName.trim() || !amount) return;
    await addCustody({
      projectId,
      resourceName: resourceName.trim(),
      amount: parseFloat(amount),
      notes: notes.trim() || undefined,
      status: 'active',
      receivedDate,
    } as any);
    setResourceName(''); setAmount(''); setNotes('');
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setOpen(false);
    toast.success('تمت إضافة العهدة');
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />عهدة جديدة</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>إضافة عهدة جديدة</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>اسم المستلم</Label>
                <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} placeholder="مثال: عمر أحمد" />
              </div>
              <div className="space-y-2">
                <Label>المبلغ</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>تاريخ استلام العهدة</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات (اختياري)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: عهدة مشتريات شهر مارس" />
              </div>
              <Button onClick={handleAdd} className="w-full">إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">العهدة مرتبطة بالمصروفات — عند إضافة مصروف يمكن ربطه بعهدة ليُخصم منها تلقائياً</p>
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
                    <td className="font-medium">{c.resourceName}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.amount)}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.spent)}</td>
                    <td>
                      <span className={c.remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(c.remaining)}</span>
                      {c.remaining <= 0 && (
                        <span className="text-[9px] text-destructive mr-1">⚠️ مستنفدة</span>
                      )}
                      {c.remaining > 0 && c.remaining < c.amount * 0.1 && (
                        <span className="text-[9px] text-amber-600 mr-1">⚠️ أقل من 10%</span>
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
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مُغلقة</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">نشطة</span>
                      )}
                    </td>
                    <td className="text-muted-foreground text-xs hidden md:table-cell">{c.notes || '—'}</td>
                    {!readOnly && <td><ConfirmDeleteDialog title="حذف العهدة" description="هل أنت متأكد من حذف هذه العهدة؟" onConfirm={() => deleteCustody(c.id)} /></td>}
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
