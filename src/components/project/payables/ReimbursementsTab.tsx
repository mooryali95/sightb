/**
 * The reimbursements tab: the ledger rows, and the dialog that adds one.
 *
 * Its seven pieces of dialog state live here rather than in the section above,
 * because nothing outside this tab ever read them — keeping them in the parent
 * only made its state surface look larger than it was.
 *
 * `onReject` stays a prop deliberately. The rejection dialog belongs to the
 * section and serves the payment-requests tab too, so moving it here would
 * widen the change rather than narrow it.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CheckCircle2, Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS,
  REIMBURSEMENT_STATUS_COLORS,
  REIMBURSEMENT_STATUS_LABELS,
  type ExpenseCategory,
  type Resource,
  type ResourceReimbursement,
} from '@/types/project';
import type { PayablesScope } from './usePayablesScope';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  projectId: string;
  scope: PayablesScope;
  scopedReimbs: ResourceReimbursement[];
  projResources: Resource[];
  canEdit: boolean;
  isAdmin: boolean;
  onReject: (target: { id: string; kind: 'reimb' | 'req' }) => void;
}

export function ReimbursementsTab({
  projectId, scope, scopedReimbs, projResources, canEdit, isAdmin, onReject,
}: Props) {
  const { createReimbursement, approveReimbursement, deleteReimbursement } = useStore(useShallow((s) => ({ createReimbursement: s.createReimbursement, approveReimbursement: s.approveReimbursement, deleteReimbursement: s.deleteReimbursement })));

  const [reimbOpen, setReimbOpen] = useState(false);
  const [rResourceId, setRResourceId] = useState('');
  const [rCategory, setRCategory] = useState<ExpenseCategory>('equipment');
  const [rDescription, setRDescription] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rDate, setRDate] = useState(todayLocal());
  const [rNotes, setRNotes] = useState('');

  const resetReimb = () => {
    setRResourceId(''); setRCategory('equipment'); setRDescription('');
    setRAmount(''); setRDate(todayLocal()); setRNotes('');
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
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="space-y-3">
    <div className="flex justify-between items-center">
      <h3 className="text-base font-semibold">قائمة الاستردادات</h3>
      {canEdit && projResources.length > 0 && (
        <Dialog open={reimbOpen} onOpenChange={(o) => { setReimbOpen(o); if (!o) resetReimb(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 me-1" /> تسجيل استرداد</Button>
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

    {scopedReimbs.length === 0 ? (
      <p className="text-sm text-muted-foreground p-6 text-center">لا توجد استردادات مسجلة.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-start py-2">التاريخ</th>
              <th className="text-start py-2">{scope === 'resource' ? 'المورد' : 'المورّد الخارجي'}</th>
              <th className="text-start py-2">الفئة</th>
              <th className="text-start py-2">الوصف</th>
              <th className="text-start py-2">المبلغ</th>
              <th className="text-start py-2">الحالة</th>
              <th className="text-start py-2">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {scopedReimbs.map((r) => {
              const res = projResources.find((x) => x.id === r.resourceId);
              return (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-2">{r.expenseDate}</td>
                  <td className="py-2">{(r.sourceKind ?? 'resource') === 'vendor' ? (r.vendorName || '—') : (res?.name || '—')}</td>
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
                            catch (e) { toast.error(errorMessage(e)); }
                          }}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => onReject({ id: r.id, kind: 'reimb' })}>
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
                          catch (e) { toast.error(errorMessage(e)); }
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
  
    </div>
  );
}
