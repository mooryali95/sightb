/**
 * The item-by-item comparison of an amendment's two snapshots, kept pure.
 */
import type { BudgetAmendmentSnapshotItem } from '@/types/project';

export type ComparisonType = 'unchanged' | 'modified' | 'added' | 'removed';

export interface ComparisonRow {
  key: string;
  before?: BudgetAmendmentSnapshotItem;
  after?: BudgetAmendmentSnapshotItem;
  type: ComparisonType;
}

const keyOf = (item: BudgetAmendmentSnapshotItem) => item.id || `${item.category}-${item.description}`;

/** Rows keyed by item id, changes first: added, modified, removed, then unchanged. */
export function compareSnapshots(before: BudgetAmendmentSnapshotItem[], after: BudgetAmendmentSnapshotItem[]): ComparisonRow[] {
  const beforeMap = new Map(before.map((b) => [keyOf(b), b]));
  const afterMap = new Map(after.map((a) => [keyOf(a), a]));
  const allKeys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const rows: ComparisonRow[] = [];
  for (const k of allKeys) {
    const b = beforeMap.get(k);
    const a = afterMap.get(k);
    let type: ComparisonType = 'unchanged';
    if (b && !a) type = 'removed';
    else if (!b && a) type = 'added';
    // A move to another category is a change too, even at the same amount.
    else if (b && a && (b.plannedAmount !== a.plannedAmount || b.description !== a.description || b.category !== a.category)) type = 'modified';
    rows.push({ key: k, before: b, after: a, type });
  }
  const order: Record<ComparisonType, number> = { added: 0, modified: 1, removed: 2, unchanged: 3 };
  rows.sort((x, y) => order[x.type] - order[y.type]);
  return rows;
}
