/**
 * Recording a company expense: what it was, who it went to, who paid it,
 * and how much of it each project carries. "Suggest" splits the amount by
 * effective contract value; the owner adjusts any line. For a salary with
 * an open advance, the deduction is proposed and can be changed or dropped.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import {
  COMPANY_EXPENSE_KIND_LABELS, suggestAllocation, suggestSalaryDeduction,
  type CompanyExpenseKind, type CompanyExpense, type IntercompanyEntry, type Party,
} from '@/lib/finance/company-ledger';
import { createCompanyExpense } from '@/services/companyLedgerService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';
import type { LedgerProject } from './nodes';
import { PartyPicker } from './PartyPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  parties: Party[];
  projects: LedgerProject[];
  expenses: CompanyExpense[];
  entries: IntercompanyEntry[];
}

const SALARY_KINDS: CompanyExpenseKind[] = ['salary', 'incentive', 'owner_salary', 'owner_incentive'];
const COMPANY_PAID = '__company__';

export function CompanyExpenseDialog({ open, onOpenChange, companyId, parties, projects, expenses, entries }: Props) {
  const [kind, setKind] = useState<CompanyExpenseKind>('salary');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string>(COMPANY_PAID);
  const [lines, setLines] = useState<{ projectId: string; amount: string }[]>([]);
  const [deduct, setDeduct] = useState(true);
  const [deduction, setDeduction] = useState<string | null>(null);

  const total = parseFloat(amount) || 0;
  const allocated = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const retained = Math.round((total - allocated) * 100) / 100;
  const over = retained < 0;

  const isPay = SALARY_KINDS.includes(kind);
  const proposed = useMemo(
    () => (isPay && partyId && total > 0 ? suggestSalaryDeduction(partyId, total, entries, expenses) : 0),
    [isPay, partyId, total, entries, expenses],
  );
  const deductionValue = deduction === null ? proposed : parseFloat(deduction) || 0;

  const save = useLedgerMutation(companyId, createCompanyExpense);

  const suggest = () => {
    if (total <= 0) { toast.error('أدخل المبلغ أولاً'); return; }
    if (projects.length === 0) { toast.error('لا توجد مشاريع نشطة لهذه الشركة'); return; }
    setLines(suggestAllocation(total, projects).map((r) => ({ projectId: r.projectId, amount: String(r.amount) })));
  };

  const submit = async () => {
    if (total <= 0) { toast.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (over) { toast.error('مجموع التحميل أكبر من المبلغ'); return; }
    if (isPay && !partyId) { toast.error('اختر المستفيد'); return; }
    if (lines.some((l) => !l.projectId)) { toast.error('اختر المشروع في كل سطر تحميل'); return; }
    if (new Set(lines.map((l) => l.projectId)).size !== lines.length) { toast.error('المشروع مكرر في التحميل'); return; }
    try {
      await save.mutateAsync({
        companyId, date, amount: total, description, kind, partyId,
        paidByPartyId: paidBy === COMPANY_PAID ? null : paidBy,
        allocations: lines.map((l) => ({ projectId: l.projectId, amount: parseFloat(l.amount) || 0 })),
        deduction: isPay && deduct && deductionValue > 0 ? Math.min(deductionValue, proposed) : 0,
      });
      toast.success('تم حفظ مصروف المنظومة');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مصروف على المنظومة</DialogTitle>
          <DialogDescription>يُسجَّل على الشركة، ويمكن تحميل جزء منه أو كله على مشروع.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>النوع</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as CompanyExpenseKind)}>
              <SelectTrigger aria-label="نوع المصروف"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COMPANY_EXPENSE_KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>المبلغ *</Label>
            <Input aria-label="المبلغ" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{isPay ? 'المستفيد *' : 'المستفيد'}</Label>
            <PartyPicker companyId={companyId} parties={parties} value={partyId} onChange={setPartyId}
              defaultKind={kind.startsWith('owner') ? 'owner' : 'person'} ariaLabel="المستفيد" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: راتب أكتوبر" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>من دفع؟</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger aria-label="من دفع"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={COMPANY_PAID}>المنظومة (من حسابها)</SelectItem>
                {parties.filter((p) => !p.archived).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — من جيبه، تصبح ذمة له</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isPay && proposed > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={deduct} onCheckedChange={(v) => setDeduct(v === true)} aria-label="خصم السلفة" />
              على المستفيد سلفة مفتوحة — اقتراح خصم {formatCurrency(proposed)} من هذا الراتب
            </label>
            {deduct && (
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">مبلغ الخصم</Label>
                <Input type="number" className="h-8 w-40" value={deduction ?? String(proposed)} onChange={(e) => setDeduction(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">التحميل على المشاريع</p>
              <p className="text-xs text-muted-foreground">ما لا يُحمَّل يبقى مصروفاً على المنظومة.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={suggest}><Sparkles className="w-3.5 h-3.5" />اقتراح حسب قيمة العقد</Button>
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setLines([...lines, { projectId: '', amount: '' }])}><Plus className="w-3.5 h-3.5" />سطر</Button>
            </div>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={l.projectId} onValueChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, projectId: v } : x)))}>
                <SelectTrigger className="flex-1" aria-label={`مشروع السطر ${i + 1}`}><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" className="w-36" aria-label={`مبلغ السطر ${i + 1}`} value={l.amount}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <span className="w-12 text-xs text-muted-foreground text-left">{total > 0 ? `${(((parseFloat(l.amount) || 0) / total) * 100).toFixed(0)}%` : ''}</span>
              <Button type="button" size="icon" variant="ghost" aria-label="حذف السطر" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <AllocationBar total={total} allocated={allocated} />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-primary/5 p-2">محمَّل على المشاريع <span className="block font-mono font-semibold text-sm">{formatCurrency(allocated)}</span></div>
            <div className={`rounded-md p-2 ${over ? 'bg-destructive/10 text-destructive' : 'bg-muted/40'}`}>
              {over ? 'تجاوز المبلغ بـ' : 'يبقى على المنظومة'} <span className="block font-mono font-semibold text-sm">{formatCurrency(Math.abs(retained))}</span>
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={save.isPending} className="w-full">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ المصروف'}</Button>
      </DialogContent>
    </Dialog>
  );
}

/** The share charged to projects, in the project colour; the rest stays grey. */
export function AllocationBar({ total, allocated }: { total: number; allocated: number }) {
  const pct = total > 0 ? Math.min(100, (allocated / total) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden" role="img" aria-label={`محمَّل ${pct.toFixed(0)}%`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
