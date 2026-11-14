/**
 * «خريطة المنظومة» on the company page: the company at the head, its
 * projects under it grouped by portfolio, and on each project's strip the
 * money that went to it from the company (funding, charged costs) and came
 * back. A three-column band says what belongs to the company alone, to
 * both, and to the project alone. Figures come from buildCompanyMap.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Building2, FolderKanban, Landmark, Network, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/finance';
import { buildCompanyMap, type MapHealth, type MapProject, type MapProjectInput } from '@/lib/finance/company-map';
import type { CompanyExpense, ExpenseAllocation, IntercompanyEntry } from '@/lib/finance/company-ledger';
import { cn } from '@/lib/utils';

interface Props {
  companyName: string;
  projects: MapProjectInput[];
  /** null while loading; 'not-ready' when the ledger tables are not live. */
  ledger: { entries: IntercompanyEntry[]; allocations: ExpenseAllocation[]; expenses: CompanyExpense[] } | null | 'not-ready';
  loading?: boolean;
  net: number | null;
  onNewProject?: () => void;
}

// The label is in the body colour so it always reads; the colour rides on
// the symbol and the border, and the symbol alone carries the meaning.
const HEALTH: Record<MapHealth, { symbol: string; label: string; tone: string; mark: string }> = {
  good: { symbol: '✓', label: 'على المسار', tone: 'border-success/40', mark: 'text-success' },
  warn: { symbol: '▲', label: 'يحتاج انتباه', tone: 'border-warning/50', mark: 'text-warning' },
  bad: { symbol: '✕', label: 'تجاوز الموازنة', tone: 'border-destructive/50', mark: 'text-destructive' },
  idle: { symbol: '○', label: 'لا صرف جارٍ', tone: 'border-border', mark: 'text-muted-foreground' },
};

const money = (n: number) => formatCurrency(n);

export function CompanyMap({ companyName, projects, ledger, loading, net, onNewProject }: Props) {
  const live = ledger !== null && ledger !== 'not-ready' ? ledger : null;
  const map = useMemo(() => buildCompanyMap(projects, live), [projects, live]);

  if (loading) {
    return (
      <section aria-label="خريطة المنظومة" aria-busy="true" className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="h-24 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted/70 animate-pulse motion-reduce:animate-none" />)}</div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section aria-label="خريطة المنظومة" className="mb-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <Network className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <h2 className="mt-3 font-bold">خريطة المنظومة تبدأ بأول مشروع</h2>
        <p className="mt-1 text-sm text-muted-foreground">أضف مشروعاً لترى ما ترسله المنظومة إليه، وما يُحمَّل عليه، وما يعود منه.</p>
        {onNewProject && <Button className="mt-4 gap-1" onClick={onNewProject}><Plus className="h-4 w-4" />مشروع جديد</Button>}
      </section>
    );
  }

  const c = map.company;
  const splitTotal = map.split.companyOnly + map.split.between + map.split.projectOnly || 1;

  return (
    <TooltipProvider delayDuration={150}>
      <section aria-label="خريطة المنظومة" className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 font-bold"><Network className="h-5 w-5 text-accent" aria-hidden />خريطة المنظومة</h2>
          <ul className="flex flex-wrap gap-3 text-[11px] text-muted-foreground" aria-label="مفتاح الألوان">
            <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-accent" />تمويل من المنظومة</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-foreground/35" />محمَّل من مصاريفها</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-success" />عاد إلى المنظومة</li>
          </ul>
        </header>

        {/* The hub: the company itself. */}
        <div className="relative px-5 pt-5">
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-accent/40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/20 ring-1 ring-accent/50"><Building2 className="h-5 w-5 text-accent" aria-hidden /></span>
                <div>
                  <p className="text-xs opacity-85">المنظومة</p>
                  <p className="text-lg font-bold">{companyName}</p>
                </div>
              </div>
              {net !== null && (
                <div className="text-left">
                  <p className="text-xs opacity-85">صافي الشركة المخطط</p>
                  <p className="font-mono text-2xl font-bold tabular-nums">{net < 0 && <span className="ml-1 text-sm font-semibold">▼ عجز</span>}{money(net)}</p>
                </div>
              )}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <HubFigure label="مصاريف المنظومة" value={c.ownSpend}
                note={c.ownSpend > 0 ? `${money(c.charged)} حُمِّلت على المشاريع · ${money(c.retained)} بقيت عليها` : 'لا مصاريف مسجّلة'} />
              <HubFigure label="أُرسل إلى المشاريع" value={c.fundedOut} note={`عاد منه ${money(c.returned)}`} />
              <HubFigure label="لنا على المشاريع والأشخاص" value={c.owedToCompany} />
              <HubFigure label="علينا للأشخاص" value={c.owedByCompany} />
            </dl>
          </div>
          {/* The trunk the projects hang from. */}
          <div aria-hidden className="mx-auto h-6 w-px bg-gradient-to-b from-accent to-border" />
        </div>

        {ledger === 'not-ready' && (
          <p role="status" className="mx-5 mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            ○ دفتر المنظومة غير مفعّل بعد: تظهر المشاريع ومصروفها، أما التمويل والتحميل والسداد فتظهر عند تفعيله.
          </p>
        )}

        <div className="space-y-5 px-5 pb-5">
          {map.groups.map((g) => (
            <div key={g.name}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><FolderKanban className="h-3.5 w-3.5" aria-hidden />{g.name} <span className="font-normal">({g.projects.length})</span></h3>
              <ul className="grid gap-3 lg:grid-cols-2">
                {g.projects.map((p, i) => <ProjectStrip key={p.id} p={p} index={i} flows={live !== null} />)}
              </ul>
            </div>
          ))}
        </div>

        {/* What belongs to whom. */}
        <footer className="border-t border-border bg-muted/30 px-5 py-4">
          <p className="mb-2 text-xs font-semibold">لمن يتبع كل ريال</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
            aria-label={`للمنظومة وحدها ${money(map.split.companyOnly)}، بينهما ${money(map.split.between)}، للمشاريع وحدها ${money(map.split.projectOnly)}`}>
            <span className="bg-foreground/70" style={{ width: `${(map.split.companyOnly / splitTotal) * 100}%` }} />
            <span className="bg-accent" style={{ width: `${(map.split.between / splitTotal) * 100}%` }} />
            <span className="bg-success/70" style={{ width: `${(map.split.projectOnly / splitTotal) * 100}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <SplitCell swatch="bg-foreground/70" label="للمنظومة وحدها" value={map.split.companyOnly} hint="مصاريفها التي لم تُحمَّل على مشروع" />
            <SplitCell swatch="bg-accent" label="بين المنظومة والمشاريع" value={map.split.between} hint="تمويل أرسلته + ما حمّلته من مصاريفها" />
            <SplitCell swatch="bg-success/70" label="للمشاريع وحدها" value={map.split.projectOnly} hint="المصروف المباشر من دفعات كل مشروع" />
          </dl>
        </footer>
      </section>
    </TooltipProvider>
  );
}

function HubFigure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl bg-primary-foreground/5 p-3 ring-1 ring-primary-foreground/10 dark:bg-background/40 dark:ring-border">
      <dt className="text-[11px] opacity-85">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">{money(value)}</dd>
      {note && <dd className="mt-0.5 text-[10px] opacity-85">{note}</dd>}
    </div>
  );
}

function SplitCell({ swatch, label, value, hint }: { swatch: string; label: string; value: number; hint: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted-foreground"><span className={cn('h-2 w-2 rounded-full', swatch)} />{label}</dt>
      <dd className="mt-0.5 font-mono font-semibold tabular-nums">{money(value)}</dd>
      <dd className="text-[10px] text-muted-foreground">{hint}</dd>
    </div>
  );
}

/** Spend against budget as a ring; the arc is clamped, the number is not. */
function SpendRing({ pct, health }: { pct: number | null; health: MapHealth }) {
  const r = 18, c = 2 * Math.PI * r;
  const shown = Math.min(100, pct ?? 0);
  const stroke = health === 'bad' ? 'hsl(var(--destructive))' : health === 'warn' ? 'hsl(var(--warning))' : 'hsl(var(--accent))';
  return (
    <svg viewBox="0 0 44 44" className="h-12 w-12 shrink-0 -rotate-90" role="img" aria-label={pct === null ? 'بلا موازنة' : `صُرف ${pct.toFixed(0)}% من الموازنة`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700" />
      <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central" className="fill-foreground font-mono text-[10px] font-semibold">
        {pct === null ? '—' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}

function ProjectStrip({ p, index, flows }: { p: MapProject; index: number; flows: boolean }) {
  const navigate = useNavigate();
  const h = HEALTH[p.health];
  const out = p.funded + p.charged;
  return (
    <li style={{ animationDelay: `${index * 40}ms` }} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both">
      <button type="button" onClick={() => navigate(`/project/${p.id}`)} aria-label={`${p.name}: ${h.label}`}
        className="group w-full rounded-xl border border-border bg-background/60 p-3 text-right transition hover:border-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="flex items-center gap-3">
          <SpendRing pct={p.spendPct} health={p.health} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">العقد {money(p.contract)} · صُرف {money(p.actual)}</p>
          </div>
          <span className={cn('shrink-0 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground', h.tone)}><span className={h.mark} aria-hidden>{h.symbol}</span> {h.label}</span>
        </div>

        {flows && (
          <div className="mt-3 space-y-1.5">
            <FlowBar icon={<ArrowDown className="h-3 w-3" aria-hidden />} label="من المنظومة" amount={out} scale={p.outScale}
              tip={`تمويل ${money(p.funded)} + محمَّل من مصاريفها ${money(p.charged)}`}>
              <span className="bg-accent" style={{ width: out > 0 ? `${(p.funded / out) * 100}%` : '0%' }} />
              <span className="bg-foreground/35" style={{ width: out > 0 ? `${(p.charged / out) * 100}%` : '0%' }} />
            </FlowBar>
            <FlowBar icon={<ArrowUp className="h-3 w-3" aria-hidden />} label="إلى المنظومة" amount={p.returned} scale={p.backScale} tip="ما سدّده المشروع للمنظومة">
              <span className="w-full bg-success" />
            </FlowBar>
            <p className="pt-0.5 text-[11px]">
              {Math.abs(p.owes) < 0.005
                ? <span className="text-muted-foreground">✓ لا ذمة بينه وبين المنظومة</span>
                : p.owes > 0
                  ? <span><Landmark className="inline h-3 w-3 text-accent" aria-hidden /> عليه للمنظومة <b className="font-mono tabular-nums">{money(p.owes)}</b></span>
                  : <span>للمشروع على المنظومة <b className="font-mono tabular-nums">{money(-p.owes)}</b></span>}
            </p>
          </div>
        )}
      </button>
    </li>
  );
}

function FlowBar({ icon, label, amount, scale, tip, children }: { icon: React.ReactNode; label: string; amount: number; scale: number; tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex w-24 shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">{icon}{label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="flex h-full overflow-hidden rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${Math.max(scale * 100, amount > 0 ? 3 : 0)}%` }}>{children}</span>
          </span>
          <span className="w-24 shrink-0 text-left font-mono tabular-nums">{money(amount)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
