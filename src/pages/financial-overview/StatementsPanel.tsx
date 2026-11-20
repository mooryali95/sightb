/**
 * «القوائم المالية» on the central financial screen: for one company and one
 * period, the income statement (accrual), the cash flow month by month
 * (cash, direct method), the receivables by age, and what is still out or
 * promised. Every figure comes from src/lib/finance/statements.ts.
 *
 * The company and the period live in the address bar (?co=&span=), so a view
 * can be shared. A loss or a negative month is said in words and a symbol,
 * never by colour alone.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, CalendarRange, FileSpreadsheet, HandCoins, Hourglass } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useCompanyLedger } from '@/hooks/useCompanyLedger';
import { formatCurrency, sumMoney } from '@/lib/finance';
import { cashFlowStatement, chargedToProjects, companyOwnCost, incomeStatement, obligations, partyCash, periodOf, projectsCash, receivablesAging, type AgingBucket, type Span } from '@/lib/finance/statements';
import { cn, todayLocal } from '@/lib/utils';

const SPANS: { key: Span; label: string }[] = [
  { key: 'ytd', label: 'هذه السنة' }, { key: 'quarter', label: 'هذا الربع' }, { key: 'month', label: 'هذا الشهر' }, { key: '12m', label: 'آخر 12 شهراً' },
];
const AGE_LABEL: Record<AgingBucket, string> = { '0-30': 'حتى 30 يوماً', '31-60': '31 – 60 يوماً', '61-90': '61 – 90 يوماً', '90+': 'أكثر من 90 يوماً' };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** Without `only`: a whole company, chosen on the panel. With it: these projects of that company (a portfolio, one project). */
export function StatementsPanel({ only }: { only?: { companyId: string; projectIds: string[] } } = {}) {
  const s = useStore(useShallow((st) => ({
    companies: st.companies, projects: st.projects, expenses: st.expenses, revenues: st.revenues,
    indirectCosts: st.indirectCosts, commitments: st.commitments,
  })));
  const [params, setParams] = useSearchParams();
  const companies = s.companies.filter((c) => c.status !== 'archived');
  const companyId = only?.companyId ?? companies.find((c) => c.id === params.get('co'))?.id ?? companies[0]?.id;
  const onlyIds = only?.projectIds.join(',');
  const span = (SPANS.find((x) => x.key === params.get('span'))?.key ?? 'ytd') as Span;
  const set = (key: string, value: string) => setParams((prev) => { const out = new URLSearchParams(prev); out.set(key, value); return out; }, { replace: true });
  const ledger = useCompanyLedger(companyId).data;
  const today = todayLocal();

  const view = useMemo(() => {
    if (!companyId) return null;
    const wanted = onlyIds === undefined ? null : new Set(onlyIds.split(',').filter(Boolean));
    const projects = s.projects.filter((p) => p.companyId === companyId && (!wanted || wanted.has(p.id)));
    const ids = new Set(projects.map((p) => p.id));
    const currencies = [...new Set(projects.map((p) => p.currency))];
    const revenues = s.revenues.filter((r) => ids.has(r.projectId));
    const expenses = s.expenses.filter((e) => ids.has(e.projectId));
    const period = periodOf(span, today);
    // A whole company carries its own cost and its indirect costs, and its cash
    // edge is the parties. A set of projects carries what the company charged
    // it, which is not cash, and its cash edge is the funding in and out.
    const own = !ledger ? [] : wanted ? chargedToProjects(ledger.expenses, ledger.allocations, ids) : companyOwnCost(ledger.expenses, ledger.allocations);
    const indirect = wanted ? [] : s.indirectCosts.filter((c) => c.companyId === companyId).map((c) => ({ date: c.date, amount: c.amount }));
    const cash = !ledger ? { in: [], out: [] } : wanted ? projectsCash(ledger.entries, ids) : partyCash(ledger.entries);
    return {
      currency: currencies[0] ?? 'SAR', mixed: currencies.length > 1, period, projectCount: projects.length,
      income: incomeStatement({ revenues, expenses, companyExpenses: own, indirect }, period),
      months: cashFlowStatement({ revenues, expenses, otherIn: cash.in, otherOut: wanted ? cash.out : [...cash.out, ...own, ...indirect] }, period),
      aging: receivablesAging(revenues, today),
      owed: obligations(expenses, s.commitments.filter((c) => ids.has(c.projectId))),
    };
  }, [companyId, onlyIds, span, today, ledger, s.projects, s.revenues, s.expenses, s.indirectCosts, s.commitments]);

  if (!view || !companyId || (only && view.projectCount === 0)) return null;
  const money = (n: number) => formatCurrency(n, view.currency);
  const { income, months, aging, owed } = view;
  const maxFlow = Math.max(1, ...months.map((m) => Math.max(m.inflow, m.outflow)));
  const maxAge = Math.max(1, ...aging.map((a) => a.amount));
  const totalIn = months.reduce((t, m) => t + m.inflow, 0), totalOut = months.reduce((t, m) => t + m.outflow, 0);
  const late = sumMoney(aging.filter((a) => a.bucket !== '0-30'));

  return (
    <section aria-label="القوائم المالية" className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />القوائم المالية</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" aria-hidden />من {view.period.from} إلى {view.period.to} · {view.projectCount} مشروع</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!only && companies.length > 1 && (
            <Select value={companyId} onValueChange={(v) => set('co', v)}>
              <SelectTrigger className="w-[200px]" aria-label="المنظومة"><SelectValue /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <div role="group" aria-label="الفترة" className="flex rounded-lg border border-border p-0.5">
            {SPANS.map((x) => (
              <button key={x.key} type="button" aria-pressed={span === x.key} onClick={() => set('span', x.key)}
                className={cn('rounded-md px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  span === x.key ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:text-foreground')}>{x.label}</button>
            ))}
          </div>
        </div>
      </header>

      {view.mixed ? (
        <p role="status" className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">مشاريع هذه المنظومة بعملات مختلفة، فلا تُجمع في قائمة واحدة. افتح كل مشروع لقائمته.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <article aria-label="قائمة الدخل" className="rounded-xl border border-border p-3">
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold"><span>قائمة الدخل</span><span className="text-[11px] font-normal text-muted-foreground">أساس الاستحقاق: بتاريخ الفاتورة</span></h3>
            <dl className="text-sm">
              <Line label="الإيراد المفوتر" value={money(income.revenue)} />
              <Line label="− التكلفة المباشرة للمشاريع" value={money(income.directCost)} muted />
              <Line label="= مجمل الربح" value={money(income.grossProfit)} strong negative={income.grossProfit < 0} note={income.grossMargin === null ? undefined : `${income.grossMargin.toFixed(1)}%`} />
              <Line label={only ? '− المحمَّل من المنظومة' : '− مصاريف المنظومة'} value={money(income.companyCost)} muted />
              {!only && <Line label="− تكاليف غير مباشرة" value={money(income.indirectCost)} muted />}
              <Line label="= صافي الربح" value={money(income.netProfit)} strong total negative={income.netProfit < 0} note={income.netMargin === null ? undefined : `${income.netMargin.toFixed(1)}%`} />
            </dl>
            {!ledger && <p className="mt-2 text-[11px] text-muted-foreground">○ دفتر المنظومة غير متاح، فمصاريفها وتمويلها غير محسوبة هنا.</p>}
          </article>

          <article aria-label="التدفق النقدي" className="rounded-xl border border-border p-3">
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-1.5"><Banknote className="h-4 w-4 text-accent" aria-hidden />التدفق النقدي</span><span className="text-[11px] font-normal text-muted-foreground">الأساس النقدي: ما دخل وخرج فعلاً</span></h3>
            <table className="w-full text-xs">
              <thead className="text-[11px] text-muted-foreground"><tr><th className="pb-1 text-start font-normal">الشهر</th><th className="pb-1 text-start font-normal">داخل / خارج</th><th className="pb-1 text-end font-normal">الصافي</th><th className="pb-1 text-end font-normal">التراكمي</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-t border-border/60">
                    <th scope="row" className="py-1.5 pe-2 text-start font-normal whitespace-nowrap">{MONTHS[Number(m.month.slice(5)) - 1]} {m.month.slice(0, 4)}</th>
                    <td className="w-full py-1.5" title={`داخل ${money(m.inflow)} · خارج ${money(m.outflow)}`}>
                      <span className="block h-1.5 rounded-full bg-success" style={{ width: `${(m.inflow / maxFlow) * 100}%` }} />
                      <span className="mt-0.5 block h-1.5 rounded-full bg-foreground/35" style={{ width: `${(m.outflow / maxFlow) * 100}%` }} />
                    </td>
                    <td className="py-1.5 ps-2 text-end font-mono tabular-nums whitespace-nowrap">{m.net < 0 && <span aria-hidden>▼ </span>}{money(m.net)}</td>
                    <td className="py-1.5 ps-2 text-end font-mono tabular-nums whitespace-nowrap">{money(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-border font-medium"><th scope="row" className="pt-1.5 text-start">المجموع</th><td className="pt-1.5 text-[11px] text-muted-foreground">داخل {money(totalIn)} · خارج {money(totalOut)}</td><td className="pt-1.5 text-end font-mono tabular-nums" colSpan={2}>{totalIn - totalOut < 0 ? '▼ عجز ' : ''}{money(totalIn - totalOut)}</td></tr></tfoot>
            </table>
            <p className="mt-2 flex gap-3 text-[11px] text-muted-foreground"><span><span className="inline-block h-1.5 w-3 rounded-full bg-success" aria-hidden /> داخل: تحصيل {only ? 'وتمويل' : 'وقروض'}</span><span><span className="inline-block h-1.5 w-3 rounded-full bg-foreground/35" aria-hidden /> خارج: صرف وسداد</span><span>التراكمي يبدأ من صفر أول الفترة</span></p>
          </article>

          <article aria-label="أعمار الذمم" className="rounded-xl border border-border p-3">
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-1.5"><Hourglass className="h-4 w-4 text-accent" aria-hidden />أعمار الذمم المدينة</span><span className="text-[11px] font-normal text-muted-foreground">مفوتر لم يُحصَّل، حتى اليوم</span></h3>
            <ul className="space-y-1.5 text-xs">
              {aging.map((a) => (
                <li key={a.bucket} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
                  <span>{a.bucket === '90+' && a.amount > 0 && <span className="text-destructive" aria-hidden>✕ </span>}{AGE_LABEL[a.bucket]}</span>
                  <span className="h-2 rounded-full bg-muted"><span className={cn('block h-2 rounded-full', a.bucket === '0-30' ? 'bg-success' : a.bucket === '90+' ? 'bg-destructive' : 'bg-warning')} style={{ width: `${(a.amount / maxAge) * 100}%` }} /></span>
                  <span className="font-mono tabular-nums">{money(a.amount)} <span className="text-muted-foreground">({a.count})</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">{late > 0 ? <>▲ متأخر أكثر من 30 يوماً: <b className="font-mono text-foreground">{money(late)}</b></> : '✓ لا ذمم متأخرة أكثر من 30 يوماً'}</p>
          </article>

          <article aria-label="السلف والالتزامات" className="rounded-xl border border-border p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><HandCoins className="h-4 w-4 text-accent" aria-hidden />السلف والالتزامات</h3>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Tile label="سلف قائمة لم تُسوَّ" value={money(owed.advances)} note={`${owed.advanceCount} سلفة · خارج المصروف حتى تُسوّى`} />
              <Tile label="التزامات متعاقد عليها لم تُصرف" value={money(owed.commitments)} note={`${owed.commitmentCount} التزام نشط`} />
            </dl>
          </article>
        </div>
      )}
    </section>
  );
}

function Line({ label, value, note, strong, muted, total, negative }: { label: string; value: string; note?: string; strong?: boolean; muted?: boolean; total?: boolean; negative?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', total && 'mt-1 border-t-2 border-foreground/20 pt-2', strong && !total && 'border-t border-border')}>
      <dt className={cn(muted && 'text-muted-foreground', strong && 'font-semibold')}>{label}</dt>
      <dd className={cn('font-mono tabular-nums', strong && 'font-semibold')}>
        {negative && <span className="me-1 text-xs font-sans">▼ خسارة</span>}{value}
        {note && <span className="ms-2 text-[11px] font-normal text-muted-foreground">{note}</span>}
      </dd>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">{value}</dd>
      <dd className="text-[10px] text-muted-foreground">{note}</dd>
    </div>
  );
}
