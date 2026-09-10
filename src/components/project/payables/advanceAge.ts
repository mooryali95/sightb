/**
 * How long an advance has been outstanding, and how loudly to say so.
 *
 * Both were defined inside the payables section and used from two places: the
 * aging alerts and export rows there, and the request rows in the tab. Pulling
 * them out keeps one copy rather than letting the thresholds drift between a
 * badge and the alert that is supposed to agree with it.
 */
import type { PaymentRequest } from '@/types/project';

/** Whole days since the advance was paid, or created if it never was. */
export function advanceAgeDays(req: Pick<PaymentRequest, 'paidDate' | 'createdAt'>): number {
  const t = req.paidDate ? new Date(req.paidDate).getTime() : new Date(req.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

/** Badge styling by age: 90 days is critical, 60 late, 30 worth watching. */
export function ageBadgeClasses(days: number): string {
  return days >= 90 ? 'border-destructive text-destructive bg-destructive/10'
    : days >= 60 ? 'border-warning text-warning-foreground bg-warning/15'
    : days >= 30 ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
    : 'border-muted text-muted-foreground';
}
