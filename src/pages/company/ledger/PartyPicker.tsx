/** Choose a person, an owner or a vendor of the company, or add one on the spot. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { PARTY_KIND_LABELS, type Party, type PartyKind } from '@/lib/finance/company-ledger';
import { createParty } from '@/services/companyLedgerService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';

interface Props {
  companyId: string;
  parties: Party[];
  value: string | null;
  onChange: (id: string | null) => void;
  defaultKind?: PartyKind;
  ariaLabel: string;
}

export function PartyPicker({ companyId, parties, value, onChange, defaultKind = 'person', ariaLabel }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PartyKind>(defaultKind);
  const add = useLedgerMutation(companyId, createParty);

  const confirm = async () => {
    if (!name.trim()) { toast.error('الاسم مطلوب'); return; }
    try {
      const p = await add.mutateAsync({ companyId, name, kind });
      onChange(p.id);
      setAdding(false); setName('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'فشل إضافة الطرف'); }
  };

  if (adding) {
    return (
      <div className="flex gap-1">
        <Input autoFocus aria-label="اسم الطرف الجديد" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className="flex-1" />
        <Select value={kind} onValueChange={(v) => setKind(v as PartyKind)}>
          <SelectTrigger className="w-24" aria-label="صفة الطرف"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PARTY_KIND_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" size="icon" aria-label="تأكيد الإضافة" onClick={confirm} disabled={add.isPending}><Check className="w-4 h-4" /></Button>
        <Button type="button" size="icon" variant="ghost" aria-label="إلغاء" onClick={() => setAdding(false)}><X className="w-4 h-4" /></Button>
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <Select value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="flex-1" aria-label={ariaLabel}><SelectValue placeholder="اختر" /></SelectTrigger>
        <SelectContent>
          {parties.filter((p) => !p.archived).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {PARTY_KIND_LABELS[p.kind]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" size="icon" variant="outline" aria-label="إضافة طرف" onClick={() => { setKind(defaultKind); setAdding(true); }}><UserPlus className="w-4 h-4" /></Button>
    </div>
  );
}
