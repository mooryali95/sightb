/**
 * A registry entry's page: everything the company and its projects paid one
 * person, vendor or entity, by project and by kind of spend, what they paid
 * for the company themselves, where their account stands, and every row,
 * each linked to the project it came from.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, FolderKanban, Landmark, Pencil, Scale, Wallet } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useCoreData, useDetailsData } from '@/hooks/useAppData';
import { useCompanyLedger } from '@/hooks/useCompanyLedger';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import { COMPANY_EXPENSE_KIND_LABELS, PARTY_KIND_LABELS, type CompanyExpenseKind } from '@/lib/finance/company-ledger';
import { initialsOf } from '@/lib/registry/names';
import { summarizeParty } from '@/lib/registry/party-summary';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { PartyFormDialog } from './company/registry/PartyFormDialog';

const kindLabel = (k: string) =>
  EXPENSE_CATEGORY_LABELS[k as ExpenseCategory] ?? COMPANY_EXPENSE_KIND_LABELS[k as CompanyExpenseKind] ?? k;

function Figure({ icon, label, value, tone, hint }: { icon: React.ReactNode; label: string; value: string; tone?: 'warn' | 'good'; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" title={hint}>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
      <p className={`mt-1 text-xl font-semibold font-mono ${tone === 'warn' ? 'text-warning' : tone === 'good' ? 'text-success' : ''}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export default function PartyDetail() {
  const { id: companyId, partyId } = useParams<{ id: string; partyId: string }>();
  useCoreData();
  useDetailsData();
  const { isAdmin, canEdit } = useRole();
  const companies = useStore((s) => s.companies);
  const allProjects = useStore((s) => s.projects);
  const allExpenses = useStore((s) => s.expenses);
  const ledger = useCompanyLedger(companyId);
  const [editing, setEditing] = useState(false);
  const [projectFilter, setProjectFilter] = useState('all');

  const company = companies.find((c) => c.id === companyId);
  const projects = useMemo(() => allProjects.filter((p) => p.companyId === companyId).map((p) => ({ id: p.id, name: p.name })), [allProjects, companyId]);
  const party = ledger.data?.parties.find((p) => p.id === partyId);
  const summary = useMemo(() => {
    if (!ledger.data || !partyId) return null;
    const ids = new Set(projects.map((p) => p.id));
    return summarizeParty(partyId, { expenses: allExpenses.filter((e) => ids.has(e.projectId)), projects, companyExpenses: ledger.data.expenses, entries: ledger.data.entries });
  }, [ledger.data, partyId, projects, allExpenses]);

  if (ledger.isLoading) {
    return <AppLayout><div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}</div></AppLayout>;
  }
  if (!party || !summary) {
    return (
      <AppLayout>
        <div className="py-20 text-center">
          <p className="font-medium">لم يُعثر على هذا المورد في سجل الشركة.</p>
          <Button asChild variant="outline" className="mt-4"><Link to={`/company/${companyId}`}>العودة إلى الشركة</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const paid = summary.paidByProjects + summary.paidByCompany;
  const maxProject = Math.max(1, ...summary.byProject.map((p) => p.total));
  const rows = projectFilter === 'all' ? summary.rows
    : projectFilter === 'company' ? summary.rows.filter((r) => r.source === 'company')
    : summary.rows.filter((r) => r.projectId === projectFilter);
  const editable = isAdmin || canEdit('company', companyId!);

  return (
    <AppLayout>
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to={`/company/${companyId}`} className="hover:text-foreground">{company?.name ?? 'الشركة'}</Link>
        <ChevronLeft className="w-4 h-4" />
        <Link to={`/company/${companyId}#registry`} className="hover:text-foreground">سجل الموارد</Link>
        <ChevronLeft className="w-4 h-4" />
        <span className="text-foreground font-medium">{party.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold">
            {initialsOf(party.name)}
          </span>
          <div>
            <h1 className="text-2xl font-bold flex flex-wrap items-center gap-2">
              {party.name}
              <Badge variant="outline">{PARTY_KIND_LABELS[party.kind]}</Badge>
            </h1>
            {party.role && <p className="text-sm text-muted-foreground mt-0.5">{party.role}</p>}
            {(party.aliases?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">يُكتب أيضاً: {party.aliases!.join('، ')}</p>
            )}
          </div>
        </div>
        {editable && <Button variant="outline" className="gap-1.5" onClick={() => setEditing(true)}><Pencil className="w-4 h-4" />تعديل</Button>}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Figure icon={<Wallet className="w-3.5 h-3.5" />} label="إجمالي ما صُرف له" value={formatCurrency(paid)} />
        <Figure icon={<FolderKanban className="w-3.5 h-3.5" />} label="من المشاريع" value={formatCurrency(summary.paidByProjects)}
          hint={summary.byProject.length ? `${summary.byProject.length} ${summary.byProject.length === 1 ? 'مشروع' : 'مشاريع'}` : undefined} />
        <Figure icon={<Landmark className="w-3.5 h-3.5" />} label="دفعه عن المنظومة من جيبه" value={formatCurrency(summary.paidForCompany)} />
        <Figure icon={<Scale className="w-3.5 h-3.5" />} label="الرصيد مع المنظومة"
          value={summary.companyOwesThem === 0 ? 'لا شيء' : formatCurrency(Math.abs(summary.companyOwesThem))}
          tone={summary.companyOwesThem > 0 ? 'warn' : summary.companyOwesThem < 0 ? 'good' : undefined}
          hint={summary.companyOwesThem > 0 ? 'على المنظومة له' : summary.companyOwesThem < 0 ? 'عليه للمنظومة' : 'لا ذمم مفتوحة'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <section className="stat-card" aria-label="حسب المشروع">
          <h2 className="text-sm font-semibold mb-3">حسب المشروع</h2>
          {summary.byProject.length === 0 ? <p className="text-sm text-muted-foreground">لم يُصرف له من أي مشروع.</p> : (
            <ul className="space-y-2.5">
              {summary.byProject.map((p) => (
                <li key={p.projectId}>
                  <Link to={`/project/${p.projectId}`} className="block group">
                    <span className="flex justify-between text-sm">
                      <span className="group-hover:text-primary">{p.name} <span className="text-xs text-muted-foreground">· {p.count} حركة</span></span>
                      <span className="font-mono font-semibold">{formatCurrency(p.total)}</span>
                    </span>
                    <span className="mt-1 block h-2 rounded-full bg-muted overflow-hidden">
                      <span className="block h-full bg-primary" style={{ width: `${(p.total / maxProject) * 100}%` }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="stat-card" aria-label="حسب النوع">
          <h2 className="text-sm font-semibold mb-3">حسب النوع</h2>
          {summary.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">لا شيء بعد.</p> : (
            <ul className="divide-y divide-border">
              {summary.byCategory.map((c) => (
                <li key={c.category} className="flex justify-between py-2 text-sm">
                  <span>{kindLabel(c.category)}</span>
                  <span className="font-mono">{formatCurrency(c.total)} <span className="text-xs text-muted-foreground">({summary.paidByProjects > 0 ? ((c.total / summary.paidByProjects) * 100).toFixed(0) : 0}%)</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="stat-card" aria-label="كل الحركات">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">كل الحركات <span className="text-muted-foreground font-normal">({rows.length})</span></h2>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[200px] h-9" aria-label="تصفية حسب المصدر"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المصادر</SelectItem>
              {summary.byProject.map((p) => <SelectItem key={p.projectId} value={p.projectId}>{p.name}</SelectItem>)}
              {summary.rows.some((r) => r.source === 'company') && <SelectItem value="company">المنظومة</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">لا حركات.</p> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>التاريخ</th><th>من</th><th>البيان</th><th>النوع</th><th>المبلغ</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.source}-${r.id}`}>
                    <td className="text-xs font-mono whitespace-nowrap">{r.date}</td>
                    <td className="text-sm whitespace-nowrap">
                      {r.source === 'project' ? <Link to={`/project/${r.projectId}`} className="text-primary hover:underline">{r.projectName}</Link> : 'المنظومة'}
                    </td>
                    <td className="text-sm">
                      {r.description || '—'}
                      {r.paidByThem && <span className="block text-[11px] text-warning">دفعه من جيبه عن المنظومة</span>}
                    </td>
                    <td><Badge variant="outline" className="text-[11px]">{kindLabel(r.category)}</Badge></td>
                    <td className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PartyFormDialog companyId={companyId!} open={editing} onOpenChange={setEditing} party={party} />
    </AppLayout>
  );
}
