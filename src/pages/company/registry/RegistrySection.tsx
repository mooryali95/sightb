/**
 * «سجل الموارد» on the company page: the company's people, owners, vendors
 * and entities, one entry each, used by every project. Each card says what
 * they were paid across the company and where their account stands, and
 * opens their page. Names still written by hand on expenses are counted, and
 * one button gathers them for linking.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Clock, Link2, Plus, Search, Users } from 'lucide-react';
import { useCompanyLedger } from '@/hooks/useCompanyLedger';
import { LedgerNotReady } from '@/services/companyLedgerService';
import { formatCurrency } from '@/lib/finance';
import { PARTY_KIND_LABELS, type PartyKind } from '@/lib/finance/company-ledger';
import { initialsOf, normalizeName } from '@/lib/registry/names';
import { summarizeParty } from '@/lib/registry/party-summary';
import type { Expense } from '@/types/project';
import { PartyFormDialog } from './PartyFormDialog';
import { LinkNamesSheet } from './LinkNamesSheet';

interface Props {
  companyId: string;
  projects: { id: string; name: string }[];
  /** Every expense of the company's projects. */
  expenses: Expense[];
  canEdit: boolean;
}

const FILTERS: { key: PartyKind | 'all'; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'person', label: 'أشخاص' }, { key: 'owner', label: 'ملاك' },
  { key: 'vendor', label: 'موردون' }, { key: 'entity', label: 'جهات' },
];

const initial = initialsOf;

export function RegistrySection({ companyId, projects, expenses, canEdit }: Props) {
  const ledger = useCompanyLedger(companyId);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PartyKind | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);

  const data = ledger.data;
  const unlinked = useMemo(() => expenses.filter((e) => !e.partyId && (e.vendor ?? '').trim() && e.approvalStatus !== 'rejected'), [expenses]);
  const cards = useMemo(() => {
    if (!data) return [];
    const needle = normalizeName(q);
    return data.parties
      .filter((p) => !p.archived && (filter === 'all' || p.kind === filter))
      .filter((p) => !needle || [p.name, p.role ?? '', ...(p.aliases ?? [])].some((s) => normalizeName(s).includes(needle)))
      .map((p) => ({ party: p, s: summarizeParty(p.id, { expenses, projects, companyExpenses: data.expenses, entries: data.entries }) }))
      .sort((a, b) => (b.s.paidByProjects + b.s.paidByCompany) - (a.s.paidByProjects + a.s.paidByCompany) || a.party.name.localeCompare(b.party.name, 'ar'));
  }, [data, q, filter, expenses, projects]);

  if (ledger.error instanceof LedgerNotReady) {
    return (
      <section className="stat-card mb-6 border-dashed" aria-label="سجل الموارد">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">سجل الموارد — بانتظار التفعيل</h3>
            <p className="text-xs text-muted-foreground mt-1">يظهر هنا بعد تطبيق تحديث قاعدة البيانات مرة واحدة.</p>
          </div>
        </div>
      </section>
    );
  }

  const count = data?.parties.filter((p) => !p.archived).length ?? 0;
  return (
    <section id="registry" className="stat-card mb-6 scroll-mt-20" aria-label="سجل الموارد">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-primary" />سجل الموارد</h2>
          <p className="text-xs text-muted-foreground mt-0.5">الأشخاص والموردون والجهات، مرة واحدة للشركة، ويُختارون في كل مشروع.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && unlinked.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLinking(true)}>
              <Link2 className="w-4 h-4" />ربط الأسماء
              <Badge variant="secondary" className="ms-1 h-5 px-1.5">{unlinked.length}</Badge>
            </Button>
          )}
          {canEdit && <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />إضافة</Button>}
        </div>
      </div>

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الدور…" className="w-[220px] ps-9 h-9" aria-label="بحث في السجل" />
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="تصفية حسب الصفة">
            {FILTERS.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {ledger.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : count === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="font-medium">السجل فارغ</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {unlinked.length > 0 ? `في المصروفات ${unlinked.length} حركة تحمل أسماء موردين. ابدأ بربطها، فيُبنى السجل منها.` : 'أضف أول شخص أو مورد.'}
          </p>
          {canEdit && (unlinked.length > 0
            ? <Button onClick={() => setLinking(true)} className="gap-1.5"><Link2 className="w-4 h-4" />بناء السجل من المصروفات</Button>
            : <Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="w-4 h-4" />إضافة</Button>)}
        </div>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">لا نتائج.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map(({ party: p, s }) => {
            const paid = s.paidByProjects + s.paidByCompany;
            return (
              <li key={p.id}>
                <Link to={`/company/${companyId}/party/${p.id}`}
                  className="group flex gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/50 hover:shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">{initial(p.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium truncate group-hover:text-primary">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{PARTY_KIND_LABELS[p.kind]}</Badge>
                    </span>
                    {p.role && <span className="block text-xs text-muted-foreground truncate">{p.role}</span>}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span><span className="text-muted-foreground">صُرف له </span><span className="font-mono font-semibold">{formatCurrency(paid)}</span></span>
                      {s.byProject.length > 0 && <span className="text-muted-foreground">{s.byProject.length === 1 ? s.byProject[0].name : `${s.byProject.length} مشاريع`}</span>}
                      {s.companyOwesThem > 0 && <Badge className="bg-warning/15 text-warning hover:bg-warning/15 text-[10px]">له {formatCurrency(s.companyOwesThem)}</Badge>}
                      {s.companyOwesThem < 0 && <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-[10px]">عليه {formatCurrency(-s.companyOwesThem)}</Badge>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <PartyFormDialog companyId={companyId} open={adding} onOpenChange={setAdding} />
      {data && <LinkNamesSheet companyId={companyId} open={linking} onOpenChange={setLinking} parties={data.parties} unlinked={unlinked} />}
    </section>
  );
}
