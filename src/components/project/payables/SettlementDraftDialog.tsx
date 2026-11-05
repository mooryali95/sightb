/**
 * The final-settlement draft: totals what a resource is owed against what
 * was paid, drafts the Arabic declaration from those figures, and saves the
 * settlement as a draft linked to the rows and payments it counted.
 *
 * The section remounts this component (via `key`) on every open, so the
 * totals and the declaration are drafted from the ledger as it stands at
 * that moment.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import { calcSettlementTotals, defaultSettlementText } from '@/lib/resource-payables';
import type { PaymentRequest, Resource, ResourceReimbursement } from '@/types/project';

interface Props {
  /** The resource being settled; the dialog is closed when absent. */
  resource: Resource | undefined;
  projectId: string;
  companyName: string;
  projectName: string;
  projReimbs: ResourceReimbursement[];
  projReqs: PaymentRequest[];
  onClose: () => void;
}

export function SettlementDraftDialog({
  resource, projectId, companyName, projectName, projReimbs, projReqs, onClose,
}: Props) {
  const { createResourceSettlement } = useStore();

  const [sFrom, setSFrom] = useState('');
  const [sTo, setSTo] = useState(todayLocal());

  const sReimbsForRes = useMemo(
    () => projReimbs.filter((r) => r.resourceId === resource?.id
      && (r.status === 'approved' || r.status === 'reimbursed')),
    [projReimbs, resource?.id],
  );
  const sPaidReqs = useMemo(
    () => projReqs.filter((p) => p.resourceId === resource?.id && p.status === 'paid'),
    [projReqs, resource?.id],
  );
  const sTotals = useMemo(
    () => calcSettlementTotals(
      sReimbsForRes, sPaidReqs,
      sReimbsForRes.map((r) => r.id),
      sPaidReqs.map((p) => p.id),
    ),
    [sReimbsForRes, sPaidReqs],
  );

  // The declaration text is drafted once, from the totals at open, and is
  // then the user's to edit.
  const [sText, setSText] = useState(() => resource ? defaultSettlementText(
    resource.name,
    companyName,
    projectName,
    sFrom || '—',
    sTo,
    Math.abs(sTotals.balance) || sTotals.totalOwed,
  ) : '');

  const handleCreateSettlement = async () => {
    if (!resource) return;
    try {
      await createResourceSettlement({
        resourceId: resource.id, projectId,
        periodFrom: sFrom || undefined, periodTo: sTo || undefined,
        linkedReimbursementIds: sReimbsForRes.map((r) => r.id),
        linkedPaymentIds: sPaidReqs.map((p) => p.id),
        totalOwed: sTotals.totalOwed, totalPaid: sTotals.totalPaid,
        settlementTextAr: sText,
      });
      toast.success('تم إنشاء المخالصة كمسودة');
      // Auto-sign for admin? Leave for separate action
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Dialog open={!!resource} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>إنشاء مخالصة نهائية — {resource?.name}</DialogTitle></DialogHeader>
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
            <div><div className="text-muted-foreground">المدفوع</div><div className="font-bold text-success">{formatCurrency(sTotals.totalPaid)}</div></div>
            <div><div className="text-muted-foreground">الرصيد</div><div className="font-bold text-warning">{formatCurrency(sTotals.balance)}</div></div>
          </div>
          <div>
            <Label>نص المخالصة</Label>
            <Textarea value={sText} onChange={(e) => setSText(e.target.value)} rows={10} className="font-sans" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleCreateSettlement}>إنشاء كمسودة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
