/**
 * The seventh layer: change orders.
 *
 * A change order is the one mechanism that edits an approved budget after the
 * fact, so it carries more money risk per line than anything else in this
 * slice. Approving one with budget items appends those items to the project
 * and — unless explicitly disabled — cuts a new baseline version.
 *
 * The tests below are about when that application runs, and when it must not.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';

const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
  logDeletion: vi.fn().mockResolvedValue(undefined),
}));

const PROJECT = 'proj-1';
const addBudgetItem = vi.fn().mockResolvedValue('bi-new');
const createBaseline = vi.fn().mockResolvedValue('base-new');

function coRow(over: Record<string, unknown> = {}) {
  return {
    id: 'co-1', project_id: PROJECT, description: 'توسعة الطابق الثاني',
    change_type: 'scope_addition', amount_impact: 50000, duration_impact: 10,
    status: 'proposed', budget_items_json: JSON.stringify([]),
    auto_rebaseline: true, created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * One variable item and one fixed one, deliberately.
 *
 * Change-order items enter the budget as `direct` whatever their cost type, and
 * a fixture where every item is variable cannot tell that apart from a rule
 * that derives costClass from costType — an earlier version of this file had
 * exactly that hole, and a fault injection walked straight through it.
 */
const twoItems = [
  { category: 'materials', description: 'حديد إضافي', plannedAmount: 30000, costType: 'variable' },
  { category: 'labor', description: 'عمالة إضافية', plannedAmount: 20000, costType: 'fixed' },
];

function storedChangeOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'co-1', projectId: PROJECT, description: 'توسعة الطابق الثاني',
    changeType: 'scope_addition', amountImpact: 50000, durationImpact: 10,
    status: 'proposed', budgetItems: twoItems, autoRebaseline: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as never;
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  addBudgetItem.mockClear();
  createBaseline.mockClear();
  vi.clearAllMocks();
  useStore.setState({
    changeOrders: [], budgetItems: [], baselines: [],
    addBudgetItem, createBaseline,
  } as never);
});

describe('an approved change order writes its items into the budget', () => {
  it('applies nothing while the order is only proposed', async () => {
    mock.on('change_orders', 'insert', () => ({ data: coRow({ budget_items_json: JSON.stringify(twoItems) }) }));

    await store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة', status: 'proposed',
      budgetItems: twoItems,
    } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(createBaseline).not.toHaveBeenCalled();
  });

  it('applies nothing when an approved order carries no items', async () => {
    mock.on('change_orders', 'insert', () => ({ data: coRow({ status: 'approved' }) }));

    await store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة', status: 'approved', budgetItems: [],
    } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
  });

  /**
   * The `[أمر تغيير]` prefix is what distinguishes a line that entered the
   * budget through a change order from one that was in the original plan.
   * Without it a variance report cannot separate the two.
   */
  it('adds each item once, marked as coming from a change order', async () => {
    mock.on('change_orders', 'insert', () => ({
      data: coRow({ status: 'approved', budget_items_json: JSON.stringify(twoItems) }),
    }));

    await store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة', status: 'approved', budgetItems: twoItems,
    } as never);

    expect(addBudgetItem).toHaveBeenCalledTimes(2);
    expect(addBudgetItem.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      description: '[أمر تغيير] حديد إضافي',
      plannedAmount: 30000,
      costClass: 'direct',
    });
    // the fixed-cost item is still booked as a direct cost
    expect(addBudgetItem.mock.calls[1][0]).toMatchObject({
      description: '[أمر تغيير] عمالة إضافية',
      plannedAmount: 20000,
      costType: 'fixed',
      costClass: 'direct',
    });
  });

  it('cuts the next baseline version, counting from the ones already there', async () => {
    useStore.setState({
      baselines: [{ id: 'b1', projectId: PROJECT, version: 2 }, { id: 'b2', projectId: PROJECT, version: 5 }],
    } as never);
    mock.on('change_orders', 'insert', () => ({
      data: coRow({ status: 'approved', budget_items_json: JSON.stringify(twoItems) }),
    }));

    await store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة الطابق الثاني', status: 'approved', budgetItems: twoItems,
    } as never);

    expect(createBaseline).toHaveBeenCalledTimes(1);
    expect(createBaseline.mock.calls[0][0]).toBe(PROJECT);
    expect(createBaseline.mock.calls[0][1]).toMatch(/^v6 — /);
  });

  it('skips the baseline when the order opts out, but still adds the items', async () => {
    mock.on('change_orders', 'insert', () => ({
      data: coRow({ status: 'approved', budget_items_json: JSON.stringify(twoItems), auto_rebaseline: false }),
    }));

    await store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة', status: 'approved',
      budgetItems: twoItems, autoRebaseline: false,
    } as never);

    expect(addBudgetItem).toHaveBeenCalledTimes(2);
    expect(createBaseline).not.toHaveBeenCalled();
  });

  /**
   * A failed baseline must not take the budget items down with it. They are
   * already written, and the user is told to cut the baseline by hand.
   */
  it('keeps the items when the baseline fails', async () => {
    createBaseline.mockRejectedValueOnce(new Error('boom'));
    mock.on('change_orders', 'insert', () => ({
      data: coRow({ status: 'approved', budget_items_json: JSON.stringify(twoItems) }),
    }));

    await expect(store().addChangeOrder({
      projectId: PROJECT, description: 'توسعة', status: 'approved', budgetItems: twoItems,
    } as never)).resolves.toBeDefined();

    expect(addBudgetItem).toHaveBeenCalledTimes(2);
  });
});

describe('approval applies on the transition, not on every save', () => {
  it('applies when an order moves from proposed to approved', async () => {
    useStore.setState({ changeOrders: [storedChangeOrder({ status: 'proposed' })] });

    await store().updateChangeOrder('co-1', { status: 'approved' } as never);

    expect(addBudgetItem).toHaveBeenCalledTimes(2);
  });

  /**
   * The one that matters.
   *
   * The edit dialog loads an existing order with its status intact, and its
   * submit handler always sends `status` back. So re-saving an already-approved
   * order — correcting a typo in its description, nothing more — runs the
   * application path a second time. Nothing downstream stops it: there is no
   * unique constraint on budget_items and no applied-marker on change_orders,
   * both checked before this test was written.
   *
   * The result is every item of that change order added to the budget twice,
   * and a second baseline version cut on top.
   */
  it('does not re-apply when an already-approved order is saved again', async () => {
    useStore.setState({ changeOrders: [storedChangeOrder({ status: 'approved' })] });

    await store().updateChangeOrder('co-1', {
      status: 'approved', description: 'توسعة الطابق الثاني (تصحيح)',
    } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(createBaseline).not.toHaveBeenCalled();
  });

  it('does not apply when an approved order is moved back to rejected', async () => {
    useStore.setState({ changeOrders: [storedChangeOrder({ status: 'approved' })] });

    await store().updateChangeOrder('co-1', { status: 'rejected' } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
  });

  /**
   * Editing the items of an order that was already applied has no safe silent
   * answer: re-running duplicates the originals, and doing nothing loses the
   * new ones. So it does neither quietly — it declines to re-apply and says so.
   */
  it('warns rather than guessing when the items of an applied order change', async () => {
    const { toast } = await import('sonner');
    useStore.setState({ changeOrders: [storedChangeOrder({ status: 'approved' })] });

    await store().updateChangeOrder('co-1', {
      status: 'approved',
      budgetItems: [...twoItems, { category: 'other', description: 'بند ثالث', plannedAmount: 5000, costType: 'fixed' }],
    } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0])
      .toContain('لم تُطبَّق بنود أمر التغيير مجدداً');
  });

  it('stays silent when an applied order is saved with its items untouched', async () => {
    const { toast } = await import('sonner');
    useStore.setState({ changeOrders: [storedChangeOrder({ status: 'approved' })] });

    await store().updateChangeOrder('co-1', {
      status: 'approved', description: 'تصحيح إملائي', budgetItems: twoItems,
    } as never);

    expect(addBudgetItem).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
  });
});
