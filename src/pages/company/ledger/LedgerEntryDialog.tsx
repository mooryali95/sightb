/**
 * One form for every movement between the company, its projects and its
 * people: who gave, who received, and whether it is an advance or a
 * repayment. Before saving it says in plain words what the balance between
 * the two becomes.
 */
import { useMemo, useState } from 'react';
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

export function LedgerEntryDialog({ open, onOpenChange, companyId, parties, projects, expenses, entries, initial }: Props) {
  const [type, setType] = useState<IntercompanyEntry['type']>(initial?.type ?? 'advance');
  const [from, setFrom] = useState(initial ? encodeNode(initial.from) : 'company');
  const [to, setTo] = useState(initial ? encodeNode(initial.to) : '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const save = useLedgerMutation(companyId, createEntry);

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
    try {
      await save.mutateAsync({ companyId, date, amount: value, type, from: decodeNode(from), to: decodeNode(to), note, dueDate: dueDate || null });
      toast.success(type === 'advance' ? 'تم تسجيل السلفة' : 'تم تسجيل السداد');
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الحفظ'); }
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
          <DialogTitle>حركة ذمم</DialogTitle>
          <DialogDescription>سلفة أو سداد بين المنظومة ومشاريعها والأشخاص. السلفة ليست مصروفاً.</DialogDescription>
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
        {preview && <p className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm" role="status">{preview}</p>}
        <Button onClick={submit} disabled={save.isPending} className="w-full">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الحركة'}</Button>
      </DialogContent>
    </Dialog>
  );
}
