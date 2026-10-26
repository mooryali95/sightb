/**
 * A loan in one step: who lent the company, how much, when it is due, and
 * which project the company funds with it. Saves the loan (lender → company)
 * and the funding (company → project) together, and says before saving who
 * will owe whom.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import { COMPANY } from '@/lib/finance/company-ledger';
import { createEntries, type NewEntry } from '@/services/companyLedgerService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';
import { RegistryNamePicker, type RegistryName } from '@/components/registry/RegistryNamePicker';
import { COMPANY_LABEL, type LedgerProject } from './nodes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  projects: LedgerProject[];
}

const NONE = '__none';

export function LoanDialog({ open, onOpenChange, companyId, projects }: Props) {
  const [lender, setLender] = useState<RegistryName>({ text: '' });
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState<string>(projects.length === 1 ? projects[0].id : NONE);
  const [funded, setFunded] = useState('');
  const [note, setNote] = useState('');
  const save = useLedgerMutation(companyId, createEntries);

  const value = parseFloat(amount) || 0;
  const toProject = projectId !== NONE ? (funded === '' ? value : parseFloat(funded) || 0) : 0;
  const projectName = projects.find((p) => p.id === projectId)?.name ?? '';

  const submit = async () => {
    if (!lender.partyId) { toast.error('اختر المُقرض من السجل أو أضفه إليه'); return; }
    if (value <= 0) { toast.error('مبلغ القرض يجب أن يكون أكبر من صفر'); return; }
    if (toProject < 0 || toProject > value) { toast.error('تمويل المشروع لا يتجاوز مبلغ القرض'); return; }
    const label = note.trim();
    const rows: NewEntry[] = [{
      companyId, date, amount: value, type: 'advance', from: { kind: 'party', id: lender.partyId }, to: COMPANY,
      note: label ? `قرض — ${label}` : 'قرض', dueDate: dueDate || null,
    }];
    if (toProject > 0) rows.push({
      companyId, date, amount: toProject, type: 'advance', from: COMPANY, to: { kind: 'project', id: projectId },
      note: `تمويل من قرض ${lender.text}`, dueDate: null,
    });
    try {
      await save.mutateAsync(rows);
      toast.success(toProject > 0 ? `سُجّل القرض وتمويل «${projectName}»` : 'سُجّل القرض');
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل الحفظ'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HandCoins className="w-5 h-5 text-primary" />قرض للمنظومة</DialogTitle>
          <DialogDescription>القرض يدخل المنظومة، والمنظومة تموّل منه المشروع. يُسترد من المشروع حين يحصّل، ثم يُسدَّد للمُقرض.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="loan-lender">المُقرض *</Label>
          <RegistryNamePicker id="loan-lender" ariaLabel="المُقرض" companyId={companyId} value={lender}
            placeholder="أنت أو أي شخص من السجل" plainPlaceholder="اسم المُقرض" onChange={setLender} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="loan-amount">مبلغ القرض *</Label><Input id="loan-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="loan-date">التاريخ</Label><Input id="loan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="loan-due">موعد السداد</Label><Input id="loan-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="loan-note">ملاحظة</Label><Input id="loan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" /></div>
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">تمويل مشروع من القرض</p>
          <div className="grid grid-cols-2 gap-3">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label="المشروع المموَّل"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>يبقى في المنظومة</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {projectId !== NONE && (
              <Input aria-label="مبلغ التمويل" type="number" min="0" step="0.01" value={funded} placeholder={value ? String(value) : 'كامل القرض'} onChange={(e) => setFunded(e.target.value)} />
            )}
          </div>
        </div>

        {value > 0 && (
          <div role="status" className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm space-y-1.5">
            <p className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium">{lender.text || 'المُقرض'}</span><ArrowLeft className="w-3.5 h-3.5" />
              <span className="font-medium">{COMPANY_LABEL}</span>
              {toProject > 0 && <><ArrowLeft className="w-3.5 h-3.5" /><span className="font-medium">{projectName}</span></>}
            </p>
            <p className="text-xs text-muted-foreground">
              {COMPANY_LABEL} مدينة لـ{lender.text || 'المُقرض'} بـ {formatCurrency(value)}
              {toProject > 0 && <>، و«{projectName}» مدين لـ{COMPANY_LABEL} بـ {formatCurrency(toProject)}</>}.
              {toProject > 0 && toProject < value && ` يبقى ${formatCurrency(value - toProject)} في المنظومة.`}
            </p>
          </div>
        )}
        <Button onClick={submit} disabled={save.isPending} className="w-full">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ القرض'}</Button>
      </DialogContent>
    </Dialog>
  );
}
