/**
 * Central financial view: companies, portfolios and projects side by side,
 * using the same summary functions as their own pages, so figures match.
 * Read-only — nothing here changes data.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownUp, Info, Search, AlertTriangle, Download } from 'lucide-react';
import { buildOverviewCsv, downloadCsv } from '@/pages/financial-overview/overviewCsv';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStore } from '@/store/useStore';
import { useCoreData, useDetailsData } from '@/hooks/useAppData';
import { formatCurrency, getProjectSummary } from '@/lib/finance';
import { getCompanySummary, getPortfolioSummary } from '@/lib/portfolio';
import { actualProfit } from '@/lib/finance/actual-profit';
import { cn } from '@/lib/utils';
import { normalizeArabicName } from '@/lib/resource-spend';
import { INACTIVE_STATUSES, needsAttention } from '@/pages/dashboard/dashboardFigures';
import type { ProjectStatus } from '@/types/project';

interface Row {
  /** Projects only; a portfolio or a company has none. */
  status?: ProjectStatus;
  id: string; name: string; parent: string; href: string; currency: string; mixed: boolean;
  contract: number; planned: number; actual: number; collected: number; profit: number; margin: number;
  actualProfit: number; actualMargin: number;
}

type SortKey = 'contract' | 'actual' | 'profit' | 'margin' | 'actualProfit' | 'actualMargin' | 'spend' | 'name';

const COLUMNS: { key: keyof Row | 'spend'; label: string; tip: string }[] = [
  { key: 'contract', label: 'قيمة العقود الفعّالة', tip: 'العقد الأصلي + أوامر التغيير المعتمدة.' },
  { key: 'planned', label: 'الموازنة المخططة', tip: 'مجموع بنود الموازنة المعتمدة.' },
  { key: 'actual', label: 'المصروف الفعلي', tip: 'المصروفات المحتسبة: بدون المرفوض والسلف غير المسوّاة.' },
  { key: 'spend', label: 'نسبة الصرف', tip: 'المصروف الفعلي ÷ الموازنة المخططة.' },
  { key: 'collected', label: 'المحصّل', tip: 'الإيرادات بحالة «محصّل» فقط.' },
  { key: 'profit', label: 'الربح المخطط', tip: 'قيمة العقود الفعّالة − الموازنة المخططة (للشركة: بعد خصم التكاليف غير المباشرة).' },
  { key: 'margin', label: 'الهامش', tip: 'الربح المخطط ÷ قيمة العقود الفعّالة.' },
  { key: 'actualProfit', label: 'الربح الفعلي', tip: 'المحصّل − المصروف الفعلي: ما تحقق حتى الآن، لا ما خُطط له. بلا خصم التكاليف غير المباشرة.' },
  { key: 'actualMargin', label: 'الهامش الفعلي', tip: 'الربح الفعلي ÷ المحصّل. صفر قبل أي تحصيل.' },
];

const pct = (n: number) => `${n.toFixed(1)}%`;
const spend = (r: Row) => (r.planned > 0 ? (r.actual / r.planned) * 100 : 0);
// The same rule as the dashboard's "needs attention", so the two counts agree.
const isRisk = (r: Row) => needsAttention(r.status ? { status: r.status } : null, r.actual, r.planned, r.profit);

/** Budget vs actual for the top 8 rows in the current order — plain bars, no chart library on this screen. */
function SpendBars({ rows }: { rows: Row[] }) {
  const top = rows.filter((r) => r.planned > 0 || r.actual > 0).slice(0, 8);
  if (!top.length) return null;
  const max = Math.max(...top.map((r) => Math.max(r.planned, r.actual)), 1);
  return (
    <div className="rounded-lg border border-border bg-card p-4 my-3 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">الموازنة مقابل المصروف الفعلي (أول 8 حسب الترتيب)</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-muted-foreground/40" />الموازنة</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-primary" />المصروف</span>
        </span>
      </div>
      {top.map((r) => {
        const over = r.planned > 0 && r.actual > r.planned;
        return (
          <div key={r.id} className="grid grid-cols-[minmax(80px,160px)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate" title={r.name}>{r.name}</span>
            <div className="space-y-1">
              <div className="h-2 rounded-sm bg-muted-foreground/40" style={{ width: `${(r.planned / max) * 100}%` }} />
              <div className={cn('h-2 rounded-sm', over ? 'bg-destructive' : 'bg-primary')} style={{ width: `${(r.actual / max) * 100}%` }} />
            </div>
            <span className={cn('font-mono', over && 'text-destructive')}>{pct(spend(r))}</span>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: number; tone?: 'destructive' | 'success'; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold font-mono', tone === 'destructive' && 'text-destructive', tone === 'success' && 'text-success')}>{value}</p>
    </div>
  );
}

export default function FinancialOverview() {
  useCoreData();
  useDetailsData();
  const s = useStore();
  const [sort, setSort] = useState<SortKey>('contract');
  const [q, setQ] = useState('');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [tab, setTab] = useState<'companies' | 'portfolios' | 'projects'>('companies');

  const { companyRows, portfolioRows, projectRows } = useMemo(() => {
    const companyName = (id?: string) => s.companies.find((c) => c.id === id)?.name ?? '—';
    const live = s.projects.filter((p) => p.status !== 'archived');
    const projectRows: Omit<Row, 'actualProfit' | 'actualMargin'>[] = live.map((p) => {
      const sum = getProjectSummary(p,
        s.budgetItems.filter((b) => b.projectId === p.id), s.expenses.filter((e) => e.projectId === p.id),
        s.revenues.filter((r) => r.projectId === p.id), s.changeOrders.filter((c) => c.projectId === p.id));
      return { status: p.status, id: p.id, name: p.name, parent: s.portfolios.find((f) => f.id === p.portfolioId)?.name ?? companyName(p.companyId),
        href: `/project/${p.id}`, currency: p.currency, mixed: false, contract: sum.effectiveContractValue, planned: sum.totalPlanned,
        actual: sum.totalActual, collected: sum.collectedRevenue, profit: sum.plannedProfit, margin: sum.plannedProfitMargin };
    });
    const portfolioRows: Omit<Row, 'actualProfit' | 'actualMargin'>[] = s.portfolios.map((f) => {
      const sum = getPortfolioSummary(f, s.projects, s.budgetItems, s.expenses, s.revenues, s.changeOrders, s.milestones, s.risks);
      return { id: f.id, name: f.name, parent: companyName(f.companyId), href: `/portfolio/${f.id}`, currency: sum.currency,
        mixed: sum.isMixedCurrency, contract: sum.totalEffectiveValue, planned: sum.totalPlanned, actual: sum.totalActual,
        collected: sum.totalCollectedRevenue, profit: sum.aggregatePlannedProfit, margin: sum.aggregatePlannedMargin };
    });
    const companyRows: Omit<Row, 'actualProfit' | 'actualMargin'>[] = s.companies.map((c) => {
      const sum = getCompanySummary(c, s.portfolios, s.projects, s.budgetItems, s.expenses, s.revenues, s.changeOrders, s.milestones, s.risks, s.indirectCosts);
      const parts = [...sum.portfolioSummaries, sum.standaloneProjectsSummary];
      const currencies = new Set(parts.flatMap((p) => p.currencies));
      return { id: c.id, name: c.name, parent: '', href: `/company/${c.id}`, currency: [...currencies][0] ?? 'SAR',
        mixed: currencies.size > 1, contract: sum.totalContractValue, planned: parts.reduce((a, p) => a + p.totalPlanned, 0),
        actual: sum.totalActual, collected: parts.reduce((a, p) => a + p.totalCollectedRevenue, 0),
        profit: sum.netProfitAfterIndirect, margin: sum.netProfitMargin };
    });
    const withActual = (rows: Omit<Row, 'actualProfit' | 'actualMargin'>[]): Row[] => rows.map((row) => {
      const a = actualProfit(row.collected, row.actual);
      return { ...row, actualProfit: a.profit, actualMargin: a.margin };
    });
    return { companyRows: withActual(companyRows), portfolioRows: withActual(portfolioRows), projectRows: withActual(projectRows) };
  }, [s.companies, s.portfolios, s.projects, s.budgetItems, s.expenses, s.revenues, s.changeOrders, s.milestones, s.risks, s.indirectCosts]);

  const order = (rows: Row[]) => [...rows]
    .filter((r) => (!query || normalizeArabicName(`${r.name} ${r.parent}`).includes(query)) && (!onlyRisk || isRisk(r)))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'ar') : sort === 'spend' ? spend(b) - spend(a) : b[sort] - a[sort]);

  const query = normalizeArabicName(q);
  // "Active" means not finished: completed and cancelled projects are listed but not counted here.
  const activeProjects = projectRows.filter((r) => !r.status || !INACTIVE_STATUSES.includes(r.status));
  const riskCount = activeProjects.filter(isRisk).length;

  const exportCurrent = () => {
    const map = { companies: [companyRows, 'الشركة الأم'], portfolios: [portfolioRows, 'الشركة'], projects: [projectRows, 'المحفظة / الشركة'] } as const;
    const [rows, label] = map[tab];
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(buildOverviewCsv(order(rows), label), `financial-${tab}-${date}.csv`);
  };

  return (
    <AppLayout>
      <PageHeader eyebrow="عرض فقط" title="الشاشة المالية المركزية"
        subtitle="مقارنة الشركات والمحافظ والمشاريع بنفس المعادلات المستخدمة في صفحاتها — راجع الأرقام قبل أي تعديل" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="الشركات" value={companyRows.length} />
        <Kpi label="المحافظ" value={portfolioRows.length} />
        <Kpi label="المشاريع النشطة" value={activeProjects.length} hint="بدون المكتملة والملغاة والمؤرشفة." />
        <Kpi label="مشاريع تحتاج انتباه" value={riskCount} tone={riskCount ? 'destructive' : 'success'}
          hint="بنفس قاعدة لوحة التحكم: صرف يتجاوز 90% من الموازنة، أو خسارة مخططة، أو مشروع معلّق أو ملغى." />
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم…" className="w-[220px] ps-9" />
        </div>
        <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">ترتيب حسب</span>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="contract">قيمة العقود</SelectItem>
            <SelectItem value="actual">المصروف الفعلي</SelectItem>
            <SelectItem value="spend">نسبة الصرف</SelectItem>
            <SelectItem value="profit">الربح المخطط</SelectItem>
            <SelectItem value="margin">الهامش</SelectItem>
            <SelectItem value="actualProfit">الربح الفعلي</SelectItem>
            <SelectItem value="actualMargin">الهامش الفعلي</SelectItem>
            <SelectItem value="name">الاسم</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={onlyRisk ? 'default' : 'outline'} size="sm" onClick={() => setOnlyRisk(!onlyRisk)}>
          <AlertTriangle className="w-4 h-4 me-1" />ما يحتاج انتباه فقط
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="companies">الشركات ({companyRows.length})</TabsTrigger>
            <TabsTrigger value="portfolios">المحافظ ({portfolioRows.length})</TabsTrigger>
            <TabsTrigger value="projects">المشاريع ({projectRows.length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={exportCurrent}>
            <Download className="w-4 h-4 me-1" />تصدير CSV
          </Button>
        </div>
        <TabsContent value="companies"><SpendBars rows={order(companyRows)} /><Table rows={order(companyRows)} /></TabsContent>
        <TabsContent value="portfolios"><SpendBars rows={order(portfolioRows)} /><Table rows={order(portfolioRows)} parentLabel="الشركة" /></TabsContent>
        <TabsContent value="projects"><SpendBars rows={order(projectRows)} /><Table rows={order(projectRows)} parentLabel="المحفظة / الشركة" /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function Table({ rows, parentLabel }: { rows: Row[]; parentLabel?: string }) {
  const navigate = useNavigate();
  if (!rows.length) return <p className="py-16 text-center text-muted-foreground">لا توجد بيانات.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="p-3 text-start">الاسم</th>
            {parentLabel && <th className="p-3 text-start">{parentLabel}</th>}
            {COLUMNS.map((c) => (
              <th key={c.key} className="p-3 text-start whitespace-nowrap">
                <Tooltip><TooltipTrigger className="inline-flex items-center gap-1">{c.label}<Info className="w-3 h-3" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs">{c.tip}</TooltipContent></Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const money = (n: number) => (r.mixed ? 'عملات مختلطة' : formatCurrency(n, r.currency));
            const sp = spend(r);
            return (
              <tr key={r.id} onClick={() => navigate(r.href)} className="border-t border-border cursor-pointer hover:bg-muted/30">
                <td className="p-3 font-medium"><Link to={r.href} onClick={(e) => e.stopPropagation()} className="hover:text-accent-text focus-visible:underline">{r.name}</Link></td>
                {parentLabel && <td className="p-3 text-muted-foreground">{r.parent}</td>}
                <td className="p-3 font-mono">{money(r.contract)}</td>
                <td className="p-3 font-mono">{money(r.planned)}</td>
                <td className="p-3 font-mono">{money(r.actual)}</td>
                <td className={cn('p-3 font-mono', sp > 100 ? 'text-destructive' : sp > 90 ? 'text-warning' : '')}>{pct(sp)}</td>
                <td className="p-3 font-mono">{money(r.collected)}</td>
                <td className={cn('p-3 font-mono', r.profit < 0 && 'text-destructive')}>{money(r.profit)}</td>
                <td className={cn('p-3 font-mono', r.margin < 0 ? 'text-destructive' : 'text-success')}>{pct(r.margin)}</td>
                <td className={cn('p-3 font-mono', r.actualProfit < 0 && 'text-destructive')}>{money(r.actualProfit)}</td>
                <td className={cn('p-3 font-mono', r.actualMargin < 0 ? 'text-destructive' : 'text-success')}>{pct(r.actualMargin)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
