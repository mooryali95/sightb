import type { Expense } from '@/types/project';

/**
 * Which expenses are advances still outstanding. Before the 22 May migration
 * the database created an expense when an advance was paid; since then a
 * paid advance writes none, that migration deleted the ones outstanding, and
 * the expense flag column was dropped on 29 May. So on live data this flags
 * nothing, and every figure of what is still out on advances reads the
 * requests (getProjectOutstandingAdvances). It stays as a guard for a row in
 * the old shape: an expense is outstanding while the paid advance that
 * created it is, and not once that advance is settled. An expense no request
 * mentions keeps whatever flag it has. Untouched rows keep their identity, so
 * a caller can tell whether anything changed.
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
