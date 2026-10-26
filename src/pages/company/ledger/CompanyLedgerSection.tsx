/**
 * «المالية العامة للمنظومة» on the company page: the company's own spend,
 * how much of it projects carry, and what the company, its projects and
 * its people owe one another, each balance with its statement.
 */
import { useMemo, useState } from 'react';
import { useDialogSession } from '@/hooks/useDialogSession';
import { useCompanyLedger, useLedgerMutation } from '@/hooks/useCompanyLedger';
import { LedgerNotReady, deleteCompanyExpense, deleteEntry } from '@/services/companyLedgerService';
import { formatCurrency } from '@/lib/finance';
import {
  COMPANY, COMPANY_EXPENSE_KIND_LABELS, balancesWithCompany, nodeKey, splitOf, statementOf, summarizeCompanyExpenses,
  type IntercompanyEntry, type LedgerNode,
} from '@/lib/finance/company-ledger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { StatCard } from '@/components/StatCard';
import { ArrowLeftRight, BellRing, Building2, Clock, HandCoins, Landmark, Receipt, Scale, Share2 } from 'lucide-react';
import { fundingByProject, lenderRepaymentDue, loansByLender, recoveryAlerts, type Collected } from '@/lib/finance/loans';
import { toast } from 'sonner';
import { CompanyExpenseDialog, AllocationBar } from './CompanyExpenseDialog';
import { LedgerEntryDialog } from './LedgerEntryDialog';
import { LoanDialog } from './LoanDialog';
import { nodeName, nodeTag, type LedgerProject } from './nodes';

interface Props {
  companyId: string; projects: LedgerProject[]; canEdit: boolean;
  /** Money the projects collected, to tell when a funded project can pay back. */
  collected?: Collected[];
}

export function CompanyLedgerSection({ companyId, projects, canEdit, collected = [] }: Props) {
  const ledger = useCompanyLedger(companyId);
  const expenseForm = useDialogSession<true>();
  const entryForm = useDialogSession<{ preset?: { from: LedgerNode; to: LedgerNode; type: IntercompanyEntry['type']; amount?: number } }>();
  const [statementFor, setStatementFor] = useState<LedgerNode | null>(null);
  const [tab, setTab] = useState('expenses');
  const loanForm = useDialogSession<true>();
  const removeExpense = useLedgerMutation(companyId, deleteCompanyExpense);
  const removeEntry = useLedgerMutation(companyId, deleteEntry);

  const data = ledger.data;
  const summary = useMemo(() => (data ? summarizeCompanyExpenses(data.expenses, data.allocations) : null), [data]);
  const balances = useMemo(() => (data ? balancesWithCompany(data.entries, data.expenses) : []), [data]);
  const receivable = balances.filter((b) => b.owesCompany > 0).reduce((s, b) => s + b.owesCompany, 0);
  const payable = balances.filter((b) => b.owesCompany < 0).reduce((s, b) => s - b.owesCompany, 0);
  const today = new Date().toISOString().slice(0, 10);
  const loans = useMemo(() => (data ? loansByLender(data.entries, today) : []), [data, today]);
  const funding = useMemo(() => (data ? fundingByProject(data.entries) : []), [data]);
  const recoveries = useMemo(() => recoveryAlerts(funding, collected), [funding, collected]);
  const lenderDue = useMemo(() => (data ? lenderRepaymentDue(loans, data.entries) : null), [loans, data]);
  const alertCount = recoveries.length + (lenderDue ? 1 : 0) + loans.filter((l) => l.overdue).length;

  if (ledger.error instanceof LedgerNotReady) {
    return (
      <section className="stat-card mb-6 border-dashed" aria-label="المالية العامة للمنظومة">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">المالية العامة للمنظومة — بانتظار التفعيل</h3>
            <p className="text-xs text-muted-foreground mt-1">
              الميزة جاهزة في التطبيق، وتنتظر تطبيق تحديث قاعدة البيانات مرة واحدة. بعدها تظهر هنا مصاريف المنظومة والتحميل على المشاريع والذمم.
            </p>
          </div>
        </div>
      </section>
    );
  }
  if (ledger.error) {
    return <section className="stat-card mb-6 text-sm text-destructive" aria-label="المالية العامة للمنظومة">تعذّر تحميل المالية العامة: {(ledger.error as Error).message}</section>;
  }
  if (!data || !summary) {
    return <section className="stat-card mb-6 h-40 animate-pulse" aria-label="المالية العامة للمنظومة" />;
  }

  const name = (n: LedgerNode) => nodeName(n, data.parties, projects);
  const partyName = (id: string | null) => (id ? data.parties.find((p) => p.id === id)?.name ?? '—' : '—');
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'مشروع';

  return (
    <section className="mb-6 space-y-4" aria-label="المالية العامة للمنظومة">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Landmark className="w-5 h-5 text-primary" />المالية العامة للمنظومة</h2>
          <p className="text-xs text-muted-foreground">مصاريف الشركة نفسها، ما تحمّله المشاريع منها، والذمم بين المنظومة ومشاريعها والأشخاص.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1" onClick={() => expenseForm.open(true)}><Receipt className="w-4 h-4" />مصروف منظومة</Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => loanForm.open(true)}><HandCoins className="w-4 h-4" />قرض</Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => entryForm.open({})}><ArrowLeftRight className="w-4 h-4" />حركة ذمم</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="مصاريف المنظومة" value={formatCurrency(summary.total)} icon={<Building2 className="w-4 h-4" />}
          subtitle={`${data.expenses.length} مصروف`} tooltip="كل ما سُجّل على الشركة نفسها: رواتب، حوافز، رواتب الملاك، إيجار، رسوم." />
        <StatCard title="محمَّل على المشاريع" value={formatCurrency(summary.allocated)} icon={<Share2 className="w-4 h-4" />}
          subtitle={summary.total > 0 ? `${((summary.allocated / summary.total) * 100).toFixed(0)}% من مصاريف المنظومة` : undefined}
          tooltip="الجزء الذي يدخل تكلفة المشاريع. لا يُحسب مرتين: يُطرح من مصاريف المنظومة العامة." />
        <StatCard title="باقٍ على المنظومة" value={formatCurrency(summary.retained)} icon={<Landmark className="w-4 h-4" />} trend="down"
          tooltip="مصروف تشغيلي عام يُطرح من ربح المشاريع للوصول إلى صافي الشركة." />
        <StatCard title="صافي الذمم" value={formatCurrency(Math.abs(receivable - payable))} icon={<Scale className="w-4 h-4" />}
          trend={receivable - payable >= 0 ? 'up' : 'down'}
          subtitle={`لنا ${formatCurrency(receivable)} · علينا ${formatCurrency(payable)}`}
          tooltip="لنا: ما على المشاريع والأشخاص للمنظومة. علينا: ما على المنظومة لهم (سُلف منهم أو مصاريف دفعوها من جيوبهم)." />
      </div>

      {alertCount > 0 && tab !== 'loans' && (
        <button type="button" onClick={() => setTab('loans')}
          className="w-full flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-right hover:bg-warning/15 transition-colors">
          <BellRing className="w-4 h-4 text-warning shrink-0" />
          <span className="flex-1">{alertCount === 1 ? 'تنبيه قرض واحد ينتظرك' : `${alertCount} تنبيهات قروض تنتظرك`}: استرداد أو سداد مستحق.</span>
          <span className="text-xs text-primary font-medium">عرض</span>
        </button>
      )}

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="expenses">المصاريف والتحميل</TabsTrigger>
          <TabsTrigger value="balances">الذمم {balances.length > 0 && <Badge variant="secondary" className="mr-1">{balances.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="loans">القروض {alertCount > 0 && <Badge variant="destructive" className="mr-1">{alertCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="kinds">حسب النوع</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="stat-card">
          {data.expenses.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">لا توجد مصاريف مسجّلة على المنظومة بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المستفيد</th><th>المبلغ</th><th className="min-w-[220px]">يتبع / حُمِّل على</th><th /></tr></thead>
                <tbody>
                  {data.expenses.map((e) => {
                    const split = splitOf(e, data.allocations);
                    return (
                      <tr key={e.id}>
                        <td className="text-xs font-mono">{e.date}</td>
                        <td><Badge variant="outline" className="text-[11px]">{COMPANY_EXPENSE_KIND_LABELS[e.kind]}</Badge></td>
                        <td className="text-sm">
                          {e.description || '—'}
                          {e.paidByPartyId && <span className="block text-[11px] text-warning">دفعه {partyName(e.paidByPartyId)} من جيبه — ذمة له</span>}
                        </td>
                        <td className="text-sm">{partyName(e.partyId)}</td>
                        <td className="font-mono text-sm font-semibold">{formatCurrency(e.amount)}</td>
                        <td>
                          <AllocationBar total={e.amount} allocated={split.allocated} />
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            {split.rows.length === 0
                              ? 'يتبع المنظومة بالكامل'
                              : <>يتبع المنظومة · حُمِّل {split.rows.map((r) => `${formatCurrency(r.amount)} على ${projectName(r.projectId)}${r.settledInProject ? ' (سدّده المشروع من مصروفه)' : ''}`).join('، ')}
                                  {split.retained > 0 && ` · يبقى ${formatCurrency(split.retained)}`}</>}
                          </p>
                        </td>
                        <td>
                          {canEdit && (
                            <ConfirmDeleteDialog title="حذف مصروف المنظومة" description="يُحذف المصروف وتحميله على المشاريع."
                              onConfirm={async () => { try { await removeExpense.mutateAsync(e.id); toast.success('تم الحذف'); } catch (err) { toast.error((err as Error).message); } }} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="balances">
          {balances.length === 0 ? (
            <p className="stat-card text-center py-8 text-sm text-muted-foreground">لا توجد ذمم مفتوحة بين المنظومة ومشاريعها أو الأشخاص.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {balances.map((b) => {
                const ours = b.owesCompany > 0;
                const settled = Math.abs(b.owesCompany) < 0.005;
                return (
                  <div key={nodeKey(b.node)} className="stat-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{name(b.node)}</p>
                        <p className="text-[11px] text-muted-foreground">{nodeTag(b.node, data.parties)}</p>
                      </div>
                      <Badge variant={settled ? 'secondary' : ours ? 'default' : 'destructive'}>{settled ? 'متساوٍ' : ours ? 'لنا' : 'علينا'}</Badge>
                    </div>
                    <p className={`stat-value mt-2 ${ours ? 'text-primary' : settled ? '' : 'text-destructive'}`}>{formatCurrency(Math.abs(b.owesCompany))}</p>
                    <p className="text-xs text-muted-foreground">
                      {settled ? 'لا شيء مستحق' : ours ? `${name(b.node)} مدين للمنظومة` : `المنظومة مدينة لـ${name(b.node)}`}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatementFor(b.node)}>كشف الحساب</Button>
                      {canEdit && !settled && (
                        <Button size="sm" className="flex-1" onClick={() => entryForm.open({ preset: ours
                          ? { from: b.node, to: COMPANY, type: 'repayment', amount: b.owesCompany }
                          : { from: COMPANY, to: b.node, type: 'repayment', amount: -b.owesCompany } })}>
                          تسجيل سداد
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="loans" className="space-y-3">
          {recoveries.map((r) => (
            <div key={r.projectId} role="alert" className="stat-card border-warning/40 flex flex-wrap items-center gap-3">
              <BellRing className="w-5 h-5 text-warning shrink-0" />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">حان استرداد التمويل من «{projectName(r.projectId)}»</p>
                <p className="text-xs text-muted-foreground">حصّل المشروع {formatCurrency(r.available)} منذ تمويله، وما زال مديناً للمنظومة.</p>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => entryForm.open({ preset: { from: { kind: 'project', id: r.projectId }, to: COMPANY, type: 'repayment', amount: r.suggested } })}>
                  استرداد {formatCurrency(r.suggested)}
                </Button>
              )}
            </div>
          ))}
          {lenderDue && (
            <div role="alert" className="stat-card border-primary/40 flex flex-wrap items-center gap-3">
              <HandCoins className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">استردّت المنظومة ما يكفي لسداد {partyName(lenderDue.partyId)}</p>
                <p className="text-xs text-muted-foreground">ما عاد من المشاريع ولم يُسدَّد بعد للمُقرض.</p>
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => entryForm.open({ preset: { from: COMPANY, to: { kind: 'party', id: lenderDue.partyId }, type: 'repayment', amount: lenderDue.suggested } })}>
                  سداد {formatCurrency(lenderDue.suggested)}
                </Button>
              )}
            </div>
          )}

          {loans.length === 0 ? (
            <div className="stat-card text-center py-8">
              <HandCoins className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">لا قروض للمنظومة. القرض منك أو من أي شخص يدخل المنظومة، وهي تموّل منه المشروع.</p>
              {canEdit && <Button size="sm" className="mt-3 gap-1" onClick={() => loanForm.open(true)}><HandCoins className="w-4 h-4" />تسجيل قرض</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {loans.map((l) => {
                const pct = l.lent > 0 ? Math.min(100, (l.repaid / l.lent) * 100) : 0;
                return (
                  <article key={l.partyId} aria-label={`قرض ${partyName(l.partyId)}`} className="stat-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{partyName(l.partyId)}</p>
                        <p className="text-[11px] text-muted-foreground">أقرض المنظومة {formatCurrency(l.lent)} · منذ {l.firstDate}</p>
                      </div>
                      {l.outstanding <= 0 ? <Badge variant="secondary">مسدَّد</Badge>
                        : l.overdue ? <Badge variant="destructive">متأخر</Badge>
                        : l.dueDate ? <Badge variant="outline">يستحق {l.dueDate}</Badge> : null}
                    </div>
                    <p className="stat-value mt-2 text-destructive">{formatCurrency(l.outstanding)}</p>
                    <p className="text-xs text-muted-foreground">باقٍ على المنظومة · سُدِّد {formatCurrency(l.repaid)}</p>
                    <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden" aria-hidden>
                      <div className="h-full bg-success" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatementFor({ kind: 'party', id: l.partyId })}>كشف الحساب</Button>
                      {canEdit && l.outstanding > 0 && (
                        <Button size="sm" className="flex-1" onClick={() => entryForm.open({ preset: { from: COMPANY, to: { kind: 'party', id: l.partyId }, type: 'repayment', amount: l.outstanding } })}>سداد للمُقرض</Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {funding.length > 0 && (
            <div className="stat-card">
              <p className="text-sm font-semibold mb-2">المشاريع المموَّلة من المنظومة</p>
              <table className="data-table">
                <thead><tr><th>المشروع</th><th>موَّل</th><th>عاد</th><th>باقٍ عليه</th><th /></tr></thead>
                <tbody>
                  {funding.map((f) => (
                    <tr key={f.projectId}>
                      <td className="text-sm">{projectName(f.projectId)}</td>
                      <td className="font-mono text-sm">{formatCurrency(f.funded)}</td>
                      <td className="font-mono text-sm">{formatCurrency(f.returned)}</td>
                      <td className={`font-mono text-sm font-semibold ${f.outstanding > 0 ? 'text-primary' : ''}`}>{formatCurrency(f.outstanding)}</td>
                      <td><Button size="sm" variant="ghost" onClick={() => setStatementFor({ kind: 'project', id: f.projectId })}>كشف</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kinds" className="stat-card">
          {summary.byKind.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">لا توجد مصاريف.</p>
          ) : (
            <div className="space-y-3">
              {summary.byKind.map((k) => (
                <div key={k.kind}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{COMPANY_EXPENSE_KIND_LABELS[k.kind]}</span>
                    <span className="font-mono">{formatCurrency(k.total)} <span className="text-xs text-muted-foreground">· محمَّل {formatCurrency(k.allocated)}</span></span>
                  </div>
                  <AllocationBar total={k.total} allocated={k.allocated} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {canEdit && expenseForm.value !== null && (
        <CompanyExpenseDialog key={expenseForm.session} open onOpenChange={(v) => { if (!v) expenseForm.close(); }}
          companyId={companyId} parties={data.parties} projects={projects} expenses={data.expenses} entries={data.entries} />
      )}
      {canEdit && loanForm.value !== null && (
        <LoanDialog key={loanForm.session} open onOpenChange={(v) => { if (!v) loanForm.close(); }} companyId={companyId} projects={projects} />
      )}
      {canEdit && entryForm.value !== null && (
        <LedgerEntryDialog key={entryForm.session} open onOpenChange={(v) => { if (!v) entryForm.close(); }}
          companyId={companyId} parties={data.parties} projects={projects} expenses={data.expenses} entries={data.entries}
          initial={entryForm.value.preset} />
      )}

      <Sheet open={statementFor !== null} onOpenChange={(v) => { if (!v) setStatementFor(null); }}>
        <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
          {statementFor && (
            <>
              <SheetHeader>
                <SheetTitle>كشف حساب — {name(statementFor)}</SheetTitle>
                <SheetDescription>كل حركة دخلت أو خرجت، والرصيد بعدها. الرصيد الموجب: مدين للآخرين.</SheetDescription>
              </SheetHeader>
              <table className="data-table mt-4">
                <thead><tr><th>التاريخ</th><th>البيان</th><th>مع</th><th>وارد</th><th>صادر</th><th>الرصيد</th><th /></tr></thead>
                <tbody>
                  {statementOf(statementFor, data.entries, data.expenses).map((r) => {
                    return (
                      <tr key={`${r.source}-${r.sourceId}`}>
                        <td className="text-xs font-mono">{r.date}</td>
                        <td className="text-xs">{r.label}</td>
                        <td className="text-xs">{name(r.counterparty)}</td>
                        <td className="font-mono text-xs">{r.inflow ? formatCurrency(r.inflow) : ''}</td>
                        <td className="font-mono text-xs">{r.outflow ? formatCurrency(r.outflow) : ''}</td>
                        <td className="font-mono text-xs font-semibold">{formatCurrency(r.balance)}</td>
                        <td>
                          {canEdit && r.source === 'entry' && (
                            <ConfirmDeleteDialog title="حذف الحركة" description="تُحذف الحركة ويُعاد حساب الرصيد."
                              onConfirm={async () => { try { await removeEntry.mutateAsync(r.sourceId); toast.success('تم الحذف'); } catch (err) { toast.error((err as Error).message); } }} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
