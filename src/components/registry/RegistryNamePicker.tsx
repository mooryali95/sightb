/**
 * Pick who was paid from the company's registry instead of typing a name.
 * Typing searches the registry however the name is spelled («دأنور» finds
 * «د أنور أسعد»); a name not there yet can be added on the spot, or kept as
 * plain text. Before the registry exists on the database it is a plain input.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Type, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useParties } from '@/hooks/useParties';
import { PARTY_KIND_LABELS, type Party } from '@/lib/finance/company-ledger';
import { initialsOf, normalizeName, searchParties } from '@/lib/registry/names';
import { cn } from '@/lib/utils';
import { PartyFormDialog } from '@/pages/company/registry/PartyFormDialog';

export interface RegistryName { text: string; partyId?: string }

interface Props {
  companyId: string | undefined;
  value: RegistryName;
  /** `party` is the registry entry picked, so a form can fill its other fields from it. */
  onChange: (v: RegistryName, party?: Party) => void;
  id?: string;
  ariaLabel: string;
  placeholder?: string;
  /** Placeholder while the registry is empty and the field is a plain input. */
  plainPlaceholder?: string;
}

export function RegistryNamePicker({ companyId, value, onChange, id, ariaLabel, placeholder = 'ابحث في السجل أو اكتب اسماً', plainPlaceholder = 'اختياري' }: Props) {
  const parties = useParties(companyId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const list = useMemo(() => parties.data ?? [], [parties.data]);
  const results = useMemo(() => searchParties(query, list), [query, list]);
  const linked = value.partyId ? list.find((p) => p.id === value.partyId) : undefined;

  // No registry yet (database before 20261027090000, or no company): a plain field.
  if (!companyId || (parties.isSuccess && list.length === 0 && !adding)) {
    return (
      <div className="flex gap-1">
        <Input id={id} aria-label={ariaLabel} value={value.text} placeholder={plainPlaceholder} className="flex-1"
          onChange={(e) => onChange({ text: e.target.value })} />
        {companyId && value.text.trim() && (
          <Button type="button" variant="outline" size="icon" aria-label="إضافة إلى سجل الموارد" title="إضافة إلى سجل الموارد"
            onClick={() => setAdding(value.text.trim())}><Plus className="w-4 h-4" /></Button>
        )}
        {companyId && <PartyFormDialog companyId={companyId} open={!!adding} onOpenChange={(o) => { if (!o) setAdding(null); }}
          initial={adding ? { name: adding } : undefined} onSaved={(p) => onChange({ text: p.name, partyId: p.id }, p)} />}
      </div>
    );
  }

  const pick = (p: Party) => { onChange({ text: p.name, partyId: p.id }, p); setOpen(false); setQuery(''); };
  const typed = query.trim();
  const exact = typed && list.some((p) => normalizeName(p.name) === normalizeName(typed));

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery(linked ? '' : value.text); }}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={ariaLabel}
            className="w-full justify-between font-normal h-10 px-3">
            {value.text ? (
              <span className="flex items-center gap-2 min-w-0">
                {linked
                  ? <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{initialsOf(linked.name)}</span>
                  : <Type aria-hidden className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="truncate">{value.text}</span>
                {linked
                  ? <span className="text-xs text-success flex items-center gap-0.5 shrink-0"><UserCheck className="w-3 h-3" />من السجل</span>
                  : <span className="text-xs text-muted-foreground shrink-0">نص فقط</span>}
              </span>
            ) : <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="اكتب الاسم…" aria-label="بحث في سجل الموارد" />
            <CommandList>
              <CommandEmpty>{typed ? 'لا أحد في السجل بهذا الاسم.' : 'السجل فارغ.'}</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup heading="من سجل الموارد">
                  {results.map((p) => (
                    <CommandItem key={p.id} value={p.id} onSelect={() => pick(p)} className="gap-2">
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{initialsOf(p.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">{PARTY_KIND_LABELS[p.kind]}{p.role ? ` · ${p.role}` : ''}</span>
                      </span>
                      {p.id === value.partyId && <Check className="w-4 h-4 text-primary" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {typed && !exact && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem value="__add" onSelect={() => { setOpen(false); setAdding(typed); }} className="gap-2">
                      <Plus className="w-4 h-4 text-primary" />إضافة «{typed}» إلى السجل
                    </CommandItem>
                    <CommandItem value="__text" onSelect={() => { onChange({ text: typed }); setOpen(false); }} className="gap-2 text-muted-foreground">
                      <Type className="w-4 h-4" />استخدام «{typed}» كنص فقط
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
              {value.text && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem value="__clear" onSelect={() => { onChange({ text: '' }); setOpen(false); }} className={cn('gap-2 text-muted-foreground')}>
                      <X className="w-4 h-4" />بدون مورد
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <PartyFormDialog companyId={companyId} open={!!adding} onOpenChange={(o) => { if (!o) setAdding(null); }}
        initial={adding ? { name: adding } : undefined} onSaved={(p) => onChange({ text: p.name, partyId: p.id }, p)} />
    </>
  );
}
