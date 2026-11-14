/**
 * «المنظومات»: one row per company, its projects counted by health with the
 * same symbols as the company map (✓ ▲ ✕ ○), and its spend against plan.
 * The companies that need a decision come first. A row opens the company.
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, Network } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { HEALTH, type CompanyHealthRow, type MapHealth } from '@/lib/finance/company-map';

const ORDER: MapHealth[] = ['bad', 'warn', 'good', 'idle'];
const BAR: Record<MapHealth, string> = { bad: 'bg-destructive', warn: 'bg-warning', good: 'bg-success', idle: 'bg-muted-foreground/30' };

export function CompaniesOverview({ rows }: { rows: CompanyHealthRow[] }) {
  if (rows.length < 2) return null; // one company: its own page says it better
  return (
    <section aria-label="المنظومات" className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-accent" aria-hidden />المنظومات</h3>
        <ul aria-label="مفتاح الحالات" className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {ORDER.map((h) => <li key={h}><span className={HEALTH[h].mark} aria-hidden>{HEALTH[h].symbol}</span> {HEALTH[h].label}</li>)}
        </ul>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const label = ORDER.filter((h) => r.counts[h] > 0).map((h) => `${HEALTH[h].label} ${r.counts[h]}`).join('، ');
          return (
            <li key={r.companyId}>
              <Link to={`/company/${r.companyId}`} aria-label={`${r.name}: ${r.total} مشروع${label ? `، ${label}` : ''}`}
                className="group grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="min-w-0">
                  <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {ORDER.map((h) => r.counts[h] > 0 && <span key={h} className={BAR[h]} style={{ width: `${(r.counts[h] / r.total) * 100}%` }} />)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground" aria-hidden>
                    {r.total === 0 ? <span>لا مشاريع بعد</span> : ORDER.filter((h) => r.counts[h] > 0).map((h) => (
                      <span key={h}><span className={HEALTH[h].mark}>{HEALTH[h].symbol}</span> {r.counts[h]}</span>
                    ))}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-end">
                    <span className="block font-mono tabular-nums">{formatCurrency(r.actual)}</span>
                    <span className="block text-[10px] text-muted-foreground">{r.spendPct === null ? 'بلا موازنة' : `${Math.round(r.spendPct)}% من الموازنة`}</span>
                  </span>
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
