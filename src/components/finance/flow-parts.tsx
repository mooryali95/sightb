/**
 * The pieces the company map and a project's link to the company share, so
 * both read the same: the status symbols, the spend ring and the flow bar.
 */
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/finance';
import type { MapHealth } from '@/lib/finance/company-map';


/** Spend against budget as a ring; the arc is clamped, the number is not. */
export function SpendRing({ pct, health }: { pct: number | null; health: MapHealth }) {
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

export function FlowBar({ icon, label, amount, scale, tip, children }: { icon: ReactNode; label: string; amount: number; scale: number; tip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex w-24 shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">{icon}{label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="flex h-full overflow-hidden rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${Math.max(scale * 100, amount > 0 ? 3 : 0)}%` }}>{children}</span>
          </span>
          <span className="w-24 shrink-0 text-left font-mono tabular-nums">{formatCurrency(amount)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

