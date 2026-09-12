import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Wallet, CheckCircle } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type ResourceReimbursement } from '@/types/project';
import { getCustodyBreakdown, getFundRemainingBreakdown } from '@/lib/funds';
import { getProjectMonth } from '@/lib/finance';
import { errorMessage } from '@/lib/utils';

interface Props {
  projectId: string;
  readOnly?: boolean;
}

export function VendorPayablesPanel({ projectId, readOnly }: Props) {
  const { canEdit: canEditFn } = useRole();
  const canEdit = !readOnly && canEditFn('project', projectId);

  const {
    reimbursements, createReimbursement,
    projectFunds, custodies, expenses, cashTransfers, paymentRequests, projects,
    addExpense,
  } = useStore();
  const project = projects.find((p) => p.id === projectId);

  const vendorPayables = useMemo(
    () => (reimbursements || []).filter(
      (r) => r.projectId === projectId && r.sourceKind === 'vendor',
    ),
    [reimbursements, projectId],
  );
  const projTransfers = useMemo(() => (cashTransfers || []).filter((t) => t.projectId === projectId), [cashTransfers, projectId]);
  const projRequests = useMemo(() => (paymentRequests || []).filter((q) => q.projectId === projectId), [paymentRequests, projectId]);

  // ── Create dialog state ──
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other' as ExpenseCategory);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setVendor(''); setDescription(''); setAmount('');
    setNotes(''); setCategory('other' as ExpenseCategory);
    setExpenseDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!vendor.trim() || !description.trim() || !amount || Number(amount) <= 0) {
      toast({ title: 'بيانات ناقصة', description: 'أدخل اسم المورد والوصف والمبلغ.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createReimbursement({
        projectId,
        sourceKind: 'vendor',
        vendorName: vendor.trim(),
        category,
        description,
        amount: Number(amount),
        expenseDate,
        notes,
        autoApprove: true,
      });
      toast({ title: 'تم تسجيل الذمة', description: 'أُضيفت كذمة مدينة على المشروع تنتظر السداد.' });
      setOpen(false); reset();
    } catch (e) {
      toast({ title: 'فشل الحفظ', description: errorMessage(e, 'خطأ غير معروف'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Settle dialog state ──
  const [settleFor, setSettleFor] = useState<ResourceReimbursement | null>(null);
  const [source, setSource] = useState<'fund' | 'custody'>('fund');
  const [sourceId, setSourceId] = useState<string>('');
  const [settling, setSettling] = useState(false);

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

  const openSettle = (p: ResourceReimbursement) => {
    setSettleFor(p);
    setSource(activeFunds.length ? 'fund' : 'custody');
    setSourceId('');
  };

  const doSettle = async () => {
    if (!settleFor || !sourceId) {
      toast({ title: 'اختر المصدر', variant: 'destructive' }); return;
    }
    if (!project) { toast({ title: 'المشروع غير موجود', variant: 'destructive' }); return; }
    setSettling(true);
    try {
      const now = new Date();
      await addExpense({
        projectId,
        category: settleFor.category as ExpenseCategory,
        description: `سداد ذمة مورد: ${settleFor.vendorName} — ${settleFor.description}`,
        amount: settleFor.amount,
        date: now.toISOString().slice(0, 10),
        // The project's month, which every monthly figure buckets by.
        month: getProjectMonth(project.startDate, now, project.durationMonths),
        vendor: settleFor.vendorName,
        approvalStatus: 'approved',
        isVatExempt: false,
        fundId: source === 'fund' ? sourceId : undefined,
        custodyId: source === 'custody' ? sourceId : undefined,
        reimbursesPayableId: settleFor.id,
      });
      toast({ title: 'تم السداد', description: 'أُقفلت الذمة وسُجِّل المصروف على المصدر المختار.' });
      setSettleFor(null);
    } catch (e) {
      toast({ title: 'فشل السداد', description: errorMessage(e, 'خطأ غير معروف'), variant: 'destructive' });
    } finally { setSettling(false); }
  };

  // Settled is the ledger's word (status), not only the expense link one
  // path of settling leaves behind.
  const isSettled = (p: ResourceReimbursement) => p.status === 'reimbursed' || !!p.settledExpenseId;
  const totalOutstanding = vendorPayables
    .filter((p) => !isSettled(p))
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          ذمم المورّدين (دفعوا نيابة عن المشروع)
          {totalOutstanding > 0 && (
            <Badge variant="destructive">مستحق: {totalOutstanding.toLocaleString('en-US')}</Badge>
          )}
        </CardTitle>
        {canEdit && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> تسجيل ذمة مورد</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>تسجيل مبلغ دفعه المورد نيابةً عن المشروع</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>اسم المورد *</Label>
                  <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="مثال: مؤسسة النور" />
                </div>
                <div>
                  <Label>الفئة *</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الوصف *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>المبلغ *</Label>
                    <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>التاريخ *</Label>
                    <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>ملاحظات</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                <Button onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>

      <CardContent>
        {vendorPayables.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد ذمم مورّدين مسجّلة.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المورد</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorPayables.map((p) => {
                const settled = isSettled(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.vendorName}</TableCell>
                    <TableCell>{p.description}</TableCell>
                    <TableCell>{Number(p.amount).toLocaleString('en-US')}</TableCell>
                    <TableCell>{p.expenseDate}</TableCell>
                    <TableCell>
                      {settled
                        ? <Badge variant="secondary"><CheckCircle className="h-3 w-3 ml-1" /> مسدّدة</Badge>
                        : <Badge variant="destructive">مستحقة</Badge>}
                    </TableCell>
                    <TableCell className="text-left">
                      {!settled && canEdit && (
                        <Button size="sm" variant="outline" onClick={() => openSettle(p)}>سداد</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* ── Settle Dialog ── */}
      <Dialog open={!!settleFor} onOpenChange={(o) => !o && setSettleFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>سداد ذمة المورد</DialogTitle>
          </DialogHeader>
          {settleFor && (
            <div className="space-y-3">
              <div className="text-sm bg-muted p-2 rounded">
                <div>المورد: <b>{settleFor.vendorName}</b></div>
                <div>المبلغ: <b>{Number(settleFor.amount).toLocaleString('en-US')}</b></div>
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
                          disabled={br.remaining < Number(settleFor.amount)}
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
                          disabled={remaining < Number(settleFor.amount)}
                        >
                          {c.resourceName} — متبقي: {remaining.toLocaleString('en-US')}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleFor(null)}>إلغاء</Button>
            <Button onClick={doSettle} disabled={settling || !sourceId}>
              {settling ? 'جارٍ السداد…' : 'تأكيد السداد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
