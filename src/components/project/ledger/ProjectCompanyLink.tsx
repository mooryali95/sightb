/**
 * «علاقة المشروع بالمنظومة» on the project's overview: the same strip the
 * company map draws for this project, from the same function, so the two
 * pages always agree. It says what the project spent from its own funds,
 * what reached it from the company (funding and charged costs), what it
 * sent back, and what it still owes, with a way to the company map.
 */
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Building2, Landmark, Network } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/finance';
import { buildCompanyMap, HEALTH, type MapProjectInput } from '@/lib/finance/company-map';
import { FlowBar, SpendRing } from '@/components/finance/flow-parts';
import { useCompanyLedger } from '@/hooks/useCompanyLedger';
import { cn } from '@/lib/utils';

interface Props { project: MapProjectInput; companyId: string | undefined; companyName?: string }

export function ProjectCompanyLink({ project, companyId, companyName }: Props) {
  const ledger = useCompanyLedger(companyId);
  // No company, or a reader without access to its books: nothing to draw.
  if (!companyId || !ledger.data) return null;
  const p = buildCompanyMap([project], ledger.data).projects[0];
  const h = HEALTH[p.health];
  const fromCompany = p.funded + p.charged;
  const linked = fromCompany > 0 || p.returned > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <section aria-label="علاقة المشروع بالمنظومة" className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-accent" aria-hidden />علاقة المشروع بالمنظومة</h3>
          <Link to={`/company/${companyId}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
            <Building2 className="h-3.5 w-3.5" aria-hidden />{companyName ?? 'المنظومة'} · خريطة المنظومة<ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </header>

        <div className="flex items-center gap-3">
          <SpendRing pct={p.spendPct} health={p.health} />
          <dl className="grid flex-1 grid-cols-3 gap-2 text-xs">
            <Figure label="من دفعاته (للمشروع وحده)" value={p.actual} />
            <Figure label="وصله من المنظومة" value={fromCompany} />
            <Figure label="عاد منه إليها" value={p.returned} />
          </dl>
          <span className={cn('hidden shrink-0 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground sm:inline', h.tone)}>
            <span className={h.mark} aria-hidden>{h.symbol}</span> {h.label}
          </span>
        </div>

        {linked ? (
          <div className="mt-3 space-y-1.5">
            <FlowBar icon={<ArrowDown className="h-3 w-3" aria-hidden />} label="من المنظومة" amount={fromCompany} scale={1}
              tip={`تمويل ${formatCurrency(p.funded)} + محمَّل من مصاريفها ${formatCurrency(p.charged)}`}>
              <span className="bg-accent" style={{ width: `${(p.funded / fromCompany) * 100}%` }} />
              <span className="bg-foreground/35" style={{ width: `${(p.charged / fromCompany) * 100}%` }} />
            </FlowBar>
            <FlowBar icon={<ArrowUp className="h-3 w-3" aria-hidden />} label="إلى المنظومة" amount={p.returned}
              scale={fromCompany > 0 ? Math.min(1, p.returned / fromCompany) : 1} tip="ما سدّده المشروع للمنظومة">
              <span className="w-full bg-success" />
            </FlowBar>
            <p className="pt-0.5 text-xs">
              {Math.abs(p.owes) < 0.005
                ? <span className="text-muted-foreground">✓ لا ذمة بينه وبين المنظومة</span>
                : p.owes > 0
                  ? <span><Landmark className="inline h-3.5 w-3.5 text-accent" aria-hidden /> عليه للمنظومة <b className="font-mono tabular-nums">{formatCurrency(p.owes)}</b></span>
                  : <span>للمشروع على المنظومة <b className="font-mono tabular-nums">{formatCurrency(-p.owes)}</b></span>}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">○ لم تموّله المنظومة ولم تحمّل عليه شيئاً: يصرف من دفعاته وحده.</p>
        )}
      </section>
    </TooltipProvider>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">{formatCurrency(value)}</dd>
    </div>
  );
}
