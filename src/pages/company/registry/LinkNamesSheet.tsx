/**
 * «ربط الأسماء بالسجل»: every name written on the company's expenses that is
 * not yet linked to a registry entry, gathered by person. For each: link it
 * to the entry it matches (one click when sure), say whether a guess is
 * right, add it to the registry, or set it aside. Linking also remembers the
 * spelling, so the next expense written that way is recognised.
 */
import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, HelpCircle, Link2, Plus, Sparkles, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import { normalizeName, groupUnlinked, type UnlinkedGroup } from '@/lib/registry/names';
import { PARTY_KIND_LABELS, type Party } from '@/lib/finance/company-ledger';
import { linkExpensesToParty } from '@/services/registryService';
import { useLedgerMutation } from '@/hooks/useCompanyLedger';
import { useStore } from '@/store/useStore';
import type { Expense } from '@/types/project';
import { PartyFormDialog } from './PartyFormDialog';

interface Props {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties: Party[];
  /** The company's projects' expenses not linked to an entry. */
  unlinked: Expense[];
}

export function LinkNamesSheet({ companyId, open, onOpenChange, parties, unlinked }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<UnlinkedGroup | null>(null);
  const link = useLedgerMutation(companyId, linkExpensesToParty);
  const active = parties.filter((p) => !p.archived);

  const groups = useMemo(
    () => groupUnlinked(unlinked.map((e) => ({ text: e.vendor, amount: e.amount })), active)
      .filter((g) => !hidden.has(g.name))
      .map((g) => (g.suggestion && rejected.has(g.name) ? { ...g, suggestion: null } : g)),
    [unlinked, active, hidden, rejected],
  );
  const sure = groups.filter((g) => g.suggestion?.sure);

  const idsOf = (g: UnlinkedGroup) => {
    const keys = new Set(g.spellings.map(normalizeName));
    return unlinked.filter((e) => keys.has(normalizeName(e.vendor ?? ''))).map((e) => e.id);
  };

  const doLink = async (g: UnlinkedGroup, party: Party, quiet = false) => {
    const expenseIds = idsOf(g);
    await link.mutateAsync({ party, expenseIds, spellings: g.spellings });
    const ids = new Set(expenseIds);
    useStore.setState((s) => ({ expenses: s.expenses.map((e) => (ids.has(e.id) ? { ...e, partyId: party.id } : e)) }));
    if (!quiet) toast.success(`رُبطت ${expenseIds.length} حركة بـ «${party.name}»`);
  };

  const linkAllSure = async () => {
    let n = 0;
    try {
      for (const g of sure) {
        const p = active.find((x) => x.id === g.suggestion!.partyId);
        if (p) { await doLink(g, p, true); n += g.count; }
      }
      toast.success(`رُبطت ${n} حركة بأصحابها في السجل`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل الربط');
    }
  };

  const total = unlinked.length;
  const linkedNow = total - groups.reduce((s, g) => s + g.count, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Link2 className="w-5 h-5 text-primary" />ربط الأسماء بسجل الموارد</SheetTitle>
          <SheetDescription>
            أسماء كُتبت في المصروفات ولم تُربط بأحد في السجل، مجمّعة حسب الشخص. اربطها مرة واحدة، ويتعرّف النظام على الاسم بعدها.
          </SheetDescription>
        </SheetHeader>

        {groups.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="font-medium">كل الأسماء مربوطة بالسجل</p>
            <p className="text-sm text-muted-foreground mt-1">أي مصروف جديد يُختار مورده من السجل مباشرة.</p>
            <Button className="mt-5" onClick={() => onOpenChange(false)}>تم</Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {sure.length > 0 && (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 flex items-center justify-between gap-3">
                <p className="text-sm"><Sparkles className="inline w-4 h-4 text-success me-1" />{sure.length} اسماً مطابقاً تماماً لأصحابه في السجل.</p>
                <Button size="sm" onClick={linkAllSure} disabled={link.isPending}>ربطها كلها</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {groups.length} اسماً بانتظار الربط · {groups.reduce((s, g) => s + g.count, 0)} حركة{linkedNow > 0 && ` · رُبطت ${linkedNow}`}
            </p>

            {groups.map((g) => {
              const suggested = g.suggestion ? active.find((p) => p.id === g.suggestion!.partyId) : undefined;
              return (
                <article key={g.name} className="rounded-lg border border-border bg-card p-3 space-y-2.5" aria-label={g.name}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.count} حركة · {formatCurrency(g.total)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="shrink-0 h-8 w-8" aria-label={`تجاهل ${g.name}`} title="ليس شخصاً ولا جهة: تجاهل الآن"
                      onClick={() => setHidden(new Set([...hidden, g.name]))}><EyeOff className="w-4 h-4" /></Button>
                  </div>
                  {g.spellings.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {g.spellings.map((s) => <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>)}
                    </div>
                  )}

                  {suggested && g.suggestion!.sure && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-success/5 px-2.5 py-2">
                      <span className="text-sm"><CheckCircle2 className="inline w-4 h-4 text-success me-1" />مطابق: <strong>{suggested.name}</strong></span>
                      <Button size="sm" onClick={() => doLink(g, suggested).catch((e) => toast.error(e.message))} disabled={link.isPending}>ربط</Button>
                    </div>
                  )}
                  {suggested && !g.suggestion!.sure && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning/5 px-2.5 py-2">
                      <span className="text-sm"><HelpCircle className="inline w-4 h-4 text-warning me-1" />هل هو <strong>{suggested.name}</strong>؟</span>
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => doLink(g, suggested).catch((e) => toast.error(e.message))} disabled={link.isPending}>نعم، اربط</Button>
                        <Button size="sm" variant="outline" onClick={() => setRejected(new Set([...rejected, g.name]))}>لا</Button>
                      </div>
                    </div>
                  )}
                  {!suggested && g.mergeInto && (
                    <p className="text-xs text-muted-foreground">قد يكون نفسه «{g.mergeInto}». أضِف ذاك أولاً، ويقترح النظام ربط هذا به.</p>
                  )}

                  {!g.suggestion?.sure && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setCreating(g)}><Plus className="w-3.5 h-3.5" />إضافة إلى السجل</Button>
                      {active.length > 0 && (
                        <Select onValueChange={(id) => { const p = active.find((x) => x.id === id); if (p) doLink(g, p).catch((e) => toast.error(e.message)); }}>
                          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs" aria-label={`ربط ${g.name} بموجود`}><SelectValue placeholder="أو اربط بموجود…" /></SelectTrigger>
                          <SelectContent>{active.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {PARTY_KIND_LABELS[p.kind]}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <PartyFormDialog companyId={companyId} open={!!creating} onOpenChange={(o) => { if (!o) setCreating(null); }}
          initial={creating ? { name: creating.name, aliases: creating.spellings.filter((s) => s !== creating.name) } : undefined}
          onSaved={(p) => { const g = creating; setCreating(null); if (g) doLink(g, p).catch((e) => toast.error(e.message)); }} />
      </SheetContent>
    </Sheet>
  );
}
