/**
 * The twelfth layer: budget amendments.
 *
 * An amendment is the record of a deliberate change to an approved budget: it
 * freezes the budget on the way in, lets the items be edited, then freezes it
 * again on approval. Those two snapshots and their totals are the only evidence
 * of what changed and by how much.
 *
 * So the risk here is not double-counted money — approving an amendment appends
 * nothing. It is that the evidence quietly disagrees with itself: a total
 * computed one way here and another way everywhere else, or a snapshot
 * overwritten after the fact.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';
import { getTotalPlanned } from '@/lib/finance';

const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));

const PROJECT = 'proj-1';
const OTHER = 'proj-2';

function budgetItem(over: Record<string, unknown> = {}) {
  return {
    id: 'bi-1', projectId: PROJECT, category: 'materials', description: 'حديد',
    plannedAmount: 10000, costType: 'fixed', costClass: 'direct',
    ...over,
  } as never;
}

function amendmentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'am-1', project_id: PROJECT, reason: 'إعادة توزيع',
    snapshot_before: [], total_before: 0, status: 'draft',
    created_at: '2026-03-01T00:00:00.000Z',
    ...over,
  };
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  useStore.setState({ budgetAmendments: [], budgetItems: [] });
  mock.on('budget_amendments', 'insert', (c) => ({ data: { ...amendmentRow(), ...(c.payload as object) } }));
  mock.on('budget_amendments', 'update', (c) => ({
    data: { ...amendmentRow(), ...(c.payload as object) },
  }));
});

describe('opening an amendment freezes the budget as it stands', () => {
  it('captures this project\'s items and none of another\'s', async () => {
    useStore.setState({
      budgetItems: [
        budgetItem({ id: 'a', description: 'حديد', plannedAmount: 10000 }),
        budgetItem({ id: 'b', description: 'عمالة', plannedAmount: 4000 }),
        budgetItem({ id: 'x', projectId: OTHER, description: 'دخيل', plannedAmount: 99999 }),
      ],
    });

    await store().openBudgetAmendment(PROJECT, '  إعادة توزيع  ');

    const sent = mock.find('budget_amendments', 'insert')?.payload as Record<string, unknown>;
    const snap = sent.snapshot_before as Array<Record<string, unknown>>;
    expect(snap.map((i) => i.description)).toEqual(['حديد', 'عمالة']);
    expect(sent.total_before).toBe(14000);
    expect(sent.status).toBe('draft');
    expect(sent.reason).toBe('إعادة توزيع');
  });

  it('opens against an empty budget without failing', async () => {
    await store().openBudgetAmendment(PROJECT, 'بداية');

    expect(mock.find('budget_amendments', 'insert')?.payload)
      .toMatchObject({ total_before: 0 });
  });
});

/**
 * The total has to be the same number the rest of the app would report for the
 * same budget, or the amendment's own evidence contradicts the dashboards it is
 * meant to explain.
 *
 * This slice used to carry its own copy of the recurring-months arithmetic, and
 * the copy disagreed with `getTotalPlanned` on exactly one shape: a recurring
 * item with an `endMonth` and no `startMonth`. These tests pin the agreement
 * rather than the formula, so a future edit to either side has to keep them
 * equal rather than merely keep one of them plausible.
 */
describe('the amendment total is the same number the rest of the app computes', () => {
  const shapes = [
    { name: 'recurring across months', costType: 'recurring', plannedAmount: 2000, startMonth: 3, endMonth: 8 },
    { name: 'recurring, start only', costType: 'recurring', plannedAmount: 2000, startMonth: 3 },
    { name: 'recurring, end only', costType: 'recurring', plannedAmount: 2000, endMonth: 6 },
    { name: 'recurring, no months', costType: 'recurring', plannedAmount: 2000 },
    { name: 'recurring, end before start', costType: 'recurring', plannedAmount: 2000, startMonth: 8, endMonth: 3 },
    { name: 'fixed', costType: 'fixed', plannedAmount: 2000 },
  ];

  for (const shape of shapes) {
    it(`agrees on ${shape.name}`, async () => {
      const item = budgetItem(shape);
      useStore.setState({ budgetItems: [item] });

      await store().openBudgetAmendment(PROJECT, 'س');

      const sent = mock.find('budget_amendments', 'insert')?.payload as Record<string, unknown>;
      expect(sent.total_before).toBe(getTotalPlanned([item as never]));
    });
  }

  /**
   * Named separately because it is the one that used to differ: 2,000 a month
   * ending in month 6, with no start recorded, is six months of plan.
   */
  it('counts a recurring item with no start month from month one', async () => {
    useStore.setState({
      budgetItems: [budgetItem({ costType: 'recurring', plannedAmount: 2000, endMonth: 6 })],
    });

    await store().openBudgetAmendment(PROJECT, 'س');

    expect(mock.find('budget_amendments', 'insert')?.payload)
      .toMatchObject({ total_before: 12000 });
  });
});

describe('approving records what the budget became', () => {
  beforeEach(() => {
    useStore.setState({
      budgetAmendments: [{
        id: 'am-1', projectId: PROJECT, reason: 'إعادة توزيع',
        snapshotBefore: [], totalBefore: 14000, status: 'draft',
        createdAt: '2026-03-01T00:00:00.000Z',
      }] as never,
    });
  });

  it('refuses an amendment it does not hold, before writing', async () => {
    await expect(store().approveBudgetAmendment('ghost'))
      .rejects.toThrow('التعديل غير موجود');
    expect(mock.calls).toHaveLength(0);
  });

  it('snapshots the budget as it now stands, and totals it the same way', async () => {
    useStore.setState({
      budgetItems: [
        budgetItem({ id: 'a', plannedAmount: 12000 }),
        budgetItem({ id: 'x', projectId: OTHER, plannedAmount: 99999 }),
      ],
    });

    await store().approveBudgetAmendment('am-1', 'مدير المشروع');

    const sent = mock.find('budget_amendments', 'update')?.payload as Record<string, unknown>;
    expect((sent.snapshot_after as unknown[])).toHaveLength(1);
    expect(sent.total_after).toBe(12000);
    expect(sent.status).toBe('approved');
    expect(sent.approved_by).toBe('مدير المشروع');
    expect(sent.approved_at).toBeTruthy();
  });

  /**
   * Asserted with an empty string, not with the argument omitted. Omitted, `||`
   * and `??` both yield null and the test proves nothing; an empty name is the
   * only input that tells "no approver recorded" apart from "approved by
   * nobody in particular", and an empty string in that column reads as an
   * approval that happened.
   */
  it('records no approver rather than an empty one', async () => {
    await store().approveBudgetAmendment('am-1', '');

    expect(mock.find('budget_amendments', 'update')?.payload)
      .toMatchObject({ approved_by: null });
  });

  it('records no approver when none is given at all', async () => {
    await store().approveBudgetAmendment('am-1');

    expect(mock.find('budget_amendments', 'update')?.payload)
      .toMatchObject({ approved_by: null });
  });

  it('takes the snapshot from the amendment\'s project, not the caller\'s guess', async () => {
    useStore.setState({
      budgetAmendments: [{
        id: 'am-1', projectId: OTHER, reason: 'ر', snapshotBefore: [],
        totalBefore: 0, status: 'draft', createdAt: '2026-03-01T00:00:00.000Z',
      }] as never,
      budgetItems: [budgetItem({ projectId: OTHER, plannedAmount: 500 }), budgetItem({ plannedAmount: 9000 })],
    });

    await store().approveBudgetAmendment('am-1');

    expect(mock.find('budget_amendments', 'update')?.payload)
      .toMatchObject({ total_after: 500 });
  });
});

describe('cancelling and loading', () => {
  it('marks a draft cancelled without touching the budget', async () => {
    useStore.setState({
      budgetAmendments: [{ id: 'am-1', projectId: PROJECT, status: 'draft' }] as never,
      budgetItems: [budgetItem()],
    });

    await store().cancelBudgetAmendment('am-1');

    expect(mock.find('budget_amendments', 'update')?.payload).toEqual({ status: 'cancelled' });
    expect(store().budgetAmendments[0].status).toBe('cancelled');
    expect(store().budgetItems).toHaveLength(1);
  });

  it('replaces one project\'s amendments and keeps another\'s', async () => {
    useStore.setState({
      budgetAmendments: [
        { id: 'stale', projectId: PROJECT },
        { id: 'far', projectId: OTHER },
      ] as never,
    });
    mock.on('budget_amendments', 'select', () => ({ data: [amendmentRow({ id: 'fresh' })] }));

    await store().loadBudgetAmendments(PROJECT);

    expect(store().budgetAmendments.map((a) => a.id).sort()).toEqual(['far', 'fresh']);
  });
});
