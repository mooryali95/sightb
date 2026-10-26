/** Add a person, vendor or entity to the registry, or edit one. */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { PARTY_KIND_LABELS, type Party, type PartyKind } from '@/lib/finance/company-ledger';
import { createParty } from '@/services/companyLedgerService';
import { updateParty } from '@/services/registryService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';

interface Props {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this entry; absent to add a new one. */
  party?: Party | null;
  /** Prefill a new entry, e.g. from a name found on expenses. */
  initial?: { name?: string; kind?: PartyKind; aliases?: string[] };
  onSaved?: (party: Party) => void;
}

const KINDS: { kind: PartyKind; hint: string }[] = [
  { kind: 'person', hint: 'موظف أو متعاون' },
  { kind: 'owner', hint: 'من ملاك المنظومة' },
  { kind: 'vendor', hint: 'مورد أو مقدّم خدمة' },
  { kind: 'entity', hint: 'جهة حكومية أو جمعية' },
];

export function PartyFormDialog({ companyId, open, onOpenChange, party, initial, onSaved }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PartyKind>('person');
  const [role, setRole] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [alias, setAlias] = useState('');
  const create = useLedgerMutation(companyId, createParty);
  const update = useLedgerMutation(companyId, (p: Parameters<typeof updateParty>[1]) => updateParty(party!.id, p));

  useEffect(() => {
    if (!open) return;
    setName(party?.name ?? initial?.name ?? '');
    setKind(party?.kind ?? initial?.kind ?? 'person');
    setRole(party?.role ?? '');
    setAliases(party?.aliases ?? initial?.aliases ?? []);
    setAlias('');
  }, [open, party, initial]);

  const addAlias = () => {
    const a = alias.trim();
    if (a && a !== name.trim() && !aliases.includes(a)) setAliases([...aliases, a]);
    setAlias('');
  };

  const save = async () => {
    if (!name.trim()) { toast.error('الاسم مطلوب'); return; }
    try {
      if (party) {
        await update.mutateAsync({ name, kind, role, aliases });
        onSaved?.({ ...party, name: name.trim(), kind, role, aliases });
        toast.success('تم حفظ التعديلات');
      } else {
        const p = await create.mutateAsync({ companyId, name, kind, role, aliases });
        onSaved?.(p);
        toast.success(`أُضيف «${p.name}» إلى السجل`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  };

  const busy = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{party ? `تعديل «${party.name}»` : 'إضافة إلى سجل الموارد'}</DialogTitle>
          <DialogDescription>يُستخدم في كل مشاريع الشركة: يُختار عند المصروف بدل كتابة الاسم.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="party-name">الاسم *</Label>
            <Input id="party-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: د أيمن أصلان" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium mb-1.5">الصفة</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الصفة">
              {KINDS.map((k) => (
                <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} onClick={() => setKind(k.kind)}
                  className={`rounded-lg border p-2.5 text-start transition-colors ${kind === k.kind ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/40'}`}>
                  <span className="block text-sm font-medium">{PARTY_KIND_LABELS[k.kind]}</span>
                  <span className="block text-[11px] text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="party-role">العمل أو الدور</Label>
            <Input id="party-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="مثال: مدير المشروع، مصمم، قاعات" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="party-alias">أسماء أخرى يُكتب بها</Label>
            <div className="flex gap-2">
              <Input id="party-alias" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="مثال: دأيمن، أبو رؤى"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }} />
              <Button type="button" variant="outline" onClick={addAlias} disabled={!alias.trim()}>إضافة</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">يتعرّف بها النظام على المصروفات التي كُتب فيها الاسم بطريقة أخرى.</p>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {aliases.map((a) => (
                  <Badge key={a} variant="secondary" className="gap-1 pe-1">
                    {a}
                    <button type="button" aria-label={`حذف ${a}`} onClick={() => setAliases(aliases.filter((x) => x !== a))} className="rounded-full p-0.5 hover:bg-muted">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ…' : party ? 'حفظ' : 'إضافة إلى السجل'}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
