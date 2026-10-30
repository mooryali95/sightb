/**
 * One form for every movement between the company, its projects and its
 * people: who gave, who received, and whether it is an advance or a
 * repayment. Before saving it says in plain words what the balance between
 * the two becomes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import { balanceBetween, type CompanyExpense, type IntercompanyEntry, type LedgerNode, type Party } from '@/lib/finance/company-ledger';
import { createEntry } from '@/services/companyLedgerService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';
import { decodeNode, encodeNode, nodeName, nodeOptions, type LedgerProject } from './nodes';
import { useStore } from '@/store/useStore';
import { getFundRemaining } from '@/lib/funds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  parties: Party[];
  projects: LedgerProject[];
  expenses: CompanyExpense[];
  entries: IntercompanyEntry[];
  /** Prefilled sides, e.g. from a balance card's "settle" button. */
  initial?: { from: LedgerNode; to: LedgerNode; type: IntercompanyEntry['type']; amount?: number };
}

const NO_FUND = '__none';

export function LedgerEntryDialog({ open, onOpenChange, companyId, parties, projects, expenses, entries, initial }: Props) {
  const [type, setType] = useState<IntercompanyEntry['type']>(initial?.type ?? 'advance');
  const [from, setFrom] = useState(initial ? encodeNode(initial.from) : 'company');
  const [to, setTo] = useState(initial ? encodeNode(initial.to) : '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const save = useLedgerMutation(companyId, createEntry);
  const createFund = useStore((s) => s.createFund);
  const loadFundsForProject = useStore((s) => s.loadFundsForProject);
  const allFunds = useStore((s) => s.projectFunds);
  const storeExpenses = useStore((s) => s.expenses);
  const storeCustodies = useStore((s) => s.custodies);
  const [sourceFundId, setSourceFundId] = useState<string>('');

  // A project paying back: which of its funds the cash leaves. Its funds may
  // not be loaded on the company page yet.
  const payingProjectId = type === 'repayment' && from.startsWith('project:') ? from.slice('project:'.length) : null;
  useEffect(() => { if (payingProjectId) loadFundsForProject(payingProjectId).catch(() => undefined); }, [payingProjectId, loadFundsForProject]);
  const sourceFunds = useMemo(() => (payingProjectId
    ? allFunds.filter((f) => f.projectId === payingProjectId)
        .map((f) => ({ fund: f, left: Math.max(0, getFundRemaining(f, storeExpenses, storeCustodies)) }))
        .filter((x) => x.left > 0.005 || x.fund.id === sourceFundId)
        .sort((a, b) => b.fund.fundNumber - a.fund.fundNumber)
    : []), [payingProjectId, allFunds, storeExpenses, storeCustodies, sourceFundId]);
  useEffect(() => {
    if (payingProjectId && !sourceFundId && sourceFunds.length > 0) setSourceFundId(sourceFunds[0].fund.id);
  }, [payingProjectId, sourceFunds, sourceFundId]);

  const options = useMemo(() => nodeOptions(parties, projects), [parties, projects]);
  const groups = useMemo(() => [...new Set(options.map((o) => o.group))], [options]);
  const value = parseFloat(amount) || 0;

  const preview = useMemo(() => {
    if (!to || from === to || value <= 0) return null;
    const f = decodeNode(from), t = decodeNode(to);
    // After this movement `to` owes `from` this much more.
    const after = balanceBetween(t, f, entries, expenses) + value;
    const name = (n: LedgerNode) => nodeName(n, parties, projects);
    if (Math.abs(after) < 0.005) return `يتساوى الحساب بين ${name(f)} و${name(t)}.`;
    return after > 0
      ? `بعد الحركة: ${name(t)} مدين لـ${name(f)} بـ ${formatCurrency(after)}.`
      : `بعد الحركة: ${name(f)} مدين لـ${name(t)} بـ ${formatCurrency(-after)}.`;
  }, [from, to, value, entries, expenses, parties, projects]);

  const submit = async () => {
    if (!to) { toast.error('اختر المستلم'); return; }
    if (from === to) { toast.error('الدافع والمستلم لا يكونان طرفاً واحداً'); return; }
    if (value <= 0) { toast.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    const f = decodeNode(from), t = decodeNode(to);
    if (type === 'repayment') {
      // A repayment returns what is owed, no more: beyond that it is a new advance.
      const owed = balanceBetween(f, t, entries, expenses);
      const who = (n: LedgerNode) => nodeName(n, parties, projects);
      if (owed <= 0.005) { toast.error(`لا شيء على ${who(f)} لـ${who(t)} ليُسدَّد`); return; }
      if (value > owed + 0.005) { toast.error(`المبلغ أكبر مما على ${who(f)} لـ${who(t)} (${formatCurrency(owed)})`); return; }
    }
    let entryId = '';
    try {
      const fromFund = payingProjectId && sourceFundId && sourceFundId !== NO_FUND ? sourceFundId : null;
      entryId = await save.mutateAsync({ companyId, date, amount: value, type, from: f, to: t, note, dueDate: dueDate || null, sourceFundId: fromFund });
      if (fromFund) await loadFundsForProject(payingProjectId!).catch(() => undefined);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الحفظ'); return; }
    if (type === 'advance' && f.kind === 'company' && t.kind === 'project') {
      // Money the company sends a project reaches it as a fund, so its expenses can draw on it.
      const fundNote = note.trim() ? `تمويل من المنظومة — ${note.trim()}` : 'تمويل من المنظومة';
      try {
        await createFund(t.id!, value, date, fundNote, { fromCompany: { ledgerEntryId: entryId } });
      } catch (e) {
        toast.warning(`سُجّلت السلفة، لكن تعذّر إنشاء دفعة للمشروع: ${e instanceof Error ? e.message : ''}. أنشئها من تبويب الدفعات.`, { duration: 10000 });
        onOpenChange(false);
        return;
      }
    }
    toast.success(type === 'advance' ? 'تم تسجيل السلفة' : 'تم تسجيل السداد');
    onOpenChange(false);
  };

  const side = (label: string, v: string, set: (v: string) => void) => (
    <div className="space-y-1 flex-1 min-w-0">
      <Label>{label}</Label>
      <Select value={v} onValueChange={set}>
        <SelectTrigger aria-label={label}><SelectValue placeholder="اختر" /></SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {options.filter((o) => o.group === g).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>سلفة أو سداد</DialogTitle>
          <DialogDescription>مال يخرج من طرف إلى آخر ثم يعود. ليس مصروفاً ولا يُنقص الربح. «سلفة» حين يخرج، و«سداد» حين يعود.</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v as IntercompanyEntry['type'])} className="justify-start">
          <ToggleGroupItem value="advance" aria-label="سلفة">سلفة</ToggleGroupItem>
          <ToggleGroupItem value="repayment" aria-label="سداد">سداد</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-end gap-2">
          {side('من (الدافع)', from, setFrom)}
          <ArrowLeft className="w-5 h-5 mb-2.5 text-muted-foreground shrink-0" />
          {side('إلى (المستلم)', to, setTo)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>المبلغ *</Label><Input aria-label="مبلغ الحركة" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {type === 'advance' && (
            <div className="space-y-1"><Label>تاريخ الاستحقاق</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          )}
          <div className={`space-y-1 ${type === 'advance' ? '' : 'col-span-2'}`}><Label>ملاحظة</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        {(() => {
          const f = decodeNode(from), t = to ? decodeNode(to) : null;
          if (t && f.kind === 'project' && t.kind === 'party')
            return <p className="text-xs text-muted-foreground">لسداد قرض أقرضه شخص للمنظومة: سجّل الرد من المشروع إلى المنظومة، ثم من المنظومة إلى المُقرض؛ هكذا يُقفل الحسابان.</p>;
          if (t && type === 'advance' && f.kind === 'company' && t.kind === 'project')
            return <p className="text-xs text-muted-foreground">تصل المشروع دفعة بالمبلغ تلقائياً، فيصرف منها.</p>;
          return null;
        })()}
        {payingProjectId && (
          <div className="space-y-1">
            <Label>يخرج النقد من</Label>
            <Select value={sourceFundId} onValueChange={setSourceFundId}>
              <SelectTrigger aria-label="الدفعة التي يخرج منها النقد"><SelectValue placeholder="اختر الدفعة" /></SelectTrigger>
              <SelectContent>
                {sourceFunds.map(({ fund, left }) => (
                  <SelectItem key={fund.id} value={fund.id}>الدفعة رقم {fund.fundNumber} · بقي فيها {formatCurrency(left)}</SelectItem>
                ))}
                <SelectItem value={NO_FUND}>ليس من دفعة (من حساب المشروع مباشرة)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">يُخصم الرد من رصيد الدفعة، ولا يُحسب مصروفاً.</p>
          </div>
        )}
        {preview && <p className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm" role="status">{preview}</p>}
        <Button onClick={submit} disabled={save.isPending} className="w-full">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الحركة'}</Button>
      </DialogContent>
    </Dialog>
  );
}
