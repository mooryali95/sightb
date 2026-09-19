import type { Expense } from '@/types/project';

/**
 * Which expenses are advances still outstanding. The database creates an
 * expense when an advance is paid and marks the request outstanding until it
 * is settled; the calculations layer excludes those expenses from spend, but
 * the expense row itself carries no such flag. It is derived here from the
 * requests: an expense is outstanding while the paid advance that created it
 * is, and not once that advance is settled. An expense no request mentions
 * keeps whatever flag it has. Untouched rows keep their identity, so a
 * caller can tell whether anything changed.
 */
export function flagOutstandingAdvances(
  expenses: Expense[] | undefined,
  paymentRequests: { requestType: string; isAdvanceOutstanding?: boolean; autoCreatedExpenseId?: string }[] | undefined,
): Expense[] {
  const known = new Map<string, boolean>();
  for (const r of paymentRequests ?? []) {
    if (r.requestType === 'advance' && r.autoCreatedExpenseId) known.set(r.autoCreatedExpenseId, !!r.isAdvanceOutstanding);
  }
  return (expenses ?? []).map((e) => {
    const flag = known.get(e.id);
    if (flag === undefined) return e;
    return (e.isOutstandingAdvance ?? false) === flag ? e : { ...e, isOutstandingAdvance: flag };
  });
}
