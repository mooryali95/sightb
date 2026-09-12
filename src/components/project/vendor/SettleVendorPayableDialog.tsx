/**
 * Settle a vendor payable: pick a fund or a custody that can still cover
 * it, and an approved expense is written on that source, linked to the
 * payable, in the project's month.
 *
 * Only sources that cover the amount are offered, measured the way the
 * ledger measures them: a fund less the advances still out of it, a
 * custody with its transfers in and advances out. The panel mounts this
 * component only while a payable is being settled, so it starts fresh.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import type { ExpenseCategory, ResourceReimbursement } from '@/types/project';
import { getCustodyBreakdown, getFundRemainingBreakdown } from '@/lib/funds';
import { getProjectMonth } from '@/lib/finance';
import { errorMessage } from '@/lib/utils';

interface Props {
  payable: ResourceReimbursement;
  projectId: string;
  onClose: () => void;
}

export function SettleVendorPayableDialog({ payable, projectId, onClose }: Props) {
  const { projectFunds, custodies, expenses, cashTransfers, paymentRequests, projects, addExpense } = useStore();
  const project = projects.find((p) => p.id === projectId);
  const projTransfers = useMemo(() => (cashTransfers || []).filter((t) => t.projectId === projectId), [cashTransfers, projectId]);
  const projRequests = useMemo(() => (paymentRequests || []).filter((q) => q.projectId === projectId), [paymentRequests, projectId]);
  const activeFunds = useMemo(
    () => (projectFunds || []).filter(
      (f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'),
    ),
    [projectFunds, projectId],
  );
  const activeCustodies = useMemo(
    () => (custodies || []).filter(
      (c) => c.projectId === projectId && c.status === 'active',
    ),
    [custodies, projectId],
  );

  const [source, setSource] = useState<'fund' | 'custody'>(activeFunds.length ? 'fund' : 'custody');
  const [sourceId, setSourceId] = useState<string>('');
  const [settling, setSettling] = useState(false);

  const doSettle = async () => {
    if (!sourceId) {
      toast({ title: 'اختر المصدر', variant: 'destructive' }); return;
    }
    if (!project) { toast({ title: 'المشروع غير موجود', variant: 'destructive' }); return; }
    setSettling(true);
    try {
      const now = new Date();
      await addExpense({
        projectId,
        category: payable.category as ExpenseCategory,
        description: `سداد ذمة مورد: ${payable.vendorName} — ${payable.description}`,
        amount: payable.amount,
        date: now.toISOString().slice(0, 10),
        // The project's month, which every monthly figure buckets by.
        month: getProjectMonth(project.startDate, now, project.durationMonths),
        vendor: payable.vendorName,
        approvalStatus: 'approved',
        isVatExempt: false,
        fundId: source === 'fund' ? sourceId : undefined,
        custodyId: source === 'custody' ? sourceId : undefined,
        reimbursesPayableId: payable.id,
      });
      toast({ title: 'تم السداد', description: 'أُقفلت الذمة وسُجِّل المصروف على المصدر المختار.' });
      onClose();
    } catch (e) {
      toast({ title: 'فشل السداد', description: errorMessage(e, 'خطأ غير معروف'), variant: 'destructive' });
    } finally { setSettling(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>سداد ذمة المورد</DialogTitle>
        </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-muted p-2 rounded">
              <div>المورد: <b>{payable.vendorName}</b></div>
              <div>المبلغ: <b>{Number(payable.amount).toLocaleString('en-US')}</b></div>
            </div>
            <div>
              <Label>مصدر السداد</Label>
              <Select value={source} onValueChange={(v) => { setSource(v as 'fund' | 'custody'); setSourceId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fund" disabled={activeFunds.length === 0}>دفعة نشطة</SelectItem>
                  <SelectItem value="custody" disabled={activeCustodies.length === 0}>عهدة نشطة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{source === 'fund' ? 'الدفعة' : 'العهدة'}</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="اختر…" /></SelectTrigger>
                <SelectContent>
                  {source === 'fund' && activeFunds.map((f) => {
                    // Advances still out of the fund are not available to it.
                    const br = getFundRemainingBreakdown(
                      f, expenses || [], custodies || [], projRequests, projTransfers,
                    );
                    return (
                      <SelectItem
                        key={f.id}
                        value={f.id}
                        disabled={br.remaining < Number(payable.amount)}
                      >
                        دفعة #{f.fundNumber} — متبقي: {br.remaining.toLocaleString('en-US')}
                      </SelectItem>
                    );
                  })}
                  {source === 'custody' && activeCustodies.map((c) => {
                    // The ledger's balance (transfers in, advances out), not the row's.
                    const { remaining } = getCustodyBreakdown(c, expenses || [], projTransfers, projRequests);
                    return (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        disabled={remaining < Number(payable.amount)}
                      >
                        {c.resourceName} — متبقي: {remaining.toLocaleString('en-US')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={doSettle} disabled={settling || !sourceId}>
            {settling ? 'جارٍ السداد…' : 'تأكيد السداد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
