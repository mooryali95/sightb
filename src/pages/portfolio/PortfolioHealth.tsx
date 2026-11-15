/**
 * «حالة مشاريع المحفظة»: each project with the same status symbol and words
 * as on the company map and the dashboard (✓ ▲ ✕ ○), from healthOf, its
 * spend against budget, and a way into it. The ones over budget come first.
 */
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { HEALTH, healthOf, type MapHealth, type MapProjectInput } from '@/lib/finance/company-map';
import { SpendRing } from '@/components/finance/flow-parts';
import { cn } from '@/lib/utils';

const RANK: Record<MapHealth, number> = { bad: 0, warn: 1, good: 2, idle: 3 };

export function PortfolioHealth({ projects }: { projects: MapProjectInput[] }) {
  if (projects.length === 0) return null;
  const rows = projects
    .map((p) => ({ ...p, health: healthOf(p), pct: p.planned > 0 ? (p.actual / p.planned) * 100 : null }))
    .sort((a, b) => RANK[a.health] - RANK[b.health] || (b.pct ?? -1) - (a.pct ?? -1));
  const counts = (Object.keys(RANK) as MapHealth[]).map((h) => [h, rows.filter((r) => r.health === h).length] as const).filter(([, n]) => n > 0);

  return (
    <section aria-label="حالة مشاريع المحفظة" className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-accent" aria-hidden />حالة مشاريع المحفظة</h3>
        <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {counts.map(([h, n]) => <span key={h}><span className={HEALTH[h].mark} aria-hidden>{HEALTH[h].symbol}</span> {HEALTH[h].label} {n}</span>)}
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/project/${r.id}`} aria-label={`${r.name}: ${HEALTH[r.health].label}`}
              className={cn('flex items-center gap-3 rounded-xl border bg-background p-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', HEALTH[r.health].tone)}>
              <SpendRing pct={r.pct === null ? null : Math.round(r.pct * 100) / 100} health={r.health} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block text-[11px] text-muted-foreground"><span className={HEALTH[r.health].mark} aria-hidden>{HEALTH[r.health].symbol}</span> {HEALTH[r.health].label}</span>
              </span>
              <span className="text-end text-xs">
                <span className="block font-mono tabular-nums">{formatCurrency(r.actual)}</span>
                <span className="block text-[10px] text-muted-foreground">{r.planned > 0 ? `من ${formatCurrency(r.planned)}` : 'بلا موازنة'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
