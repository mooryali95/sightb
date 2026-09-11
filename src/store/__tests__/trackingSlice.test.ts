/**
 * Change orders and custodies — the two money-shaped parts of this slice.
 *
 * A change order is the one mechanism that edits an approved budget after the
 * fact, so it carries more money risk per line than anything else here.
 * Approving one with budget items appends those items to the project and —
 * unless explicitly disabled — cuts a new baseline version. The first half of
 * this file is about when that application runs, and when it must not.
 *
 * A custody is cash in a named person's hands. Its `spent` and `remaining` are
 * not stored: they are derived from the expense list every time the row is
 * mapped, so the balance shown for one is only ever as right as that
 * derivation. The second half is about that, and about the database guard that
 * refuses a custody larger than the fund behind it.
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
    custodies: [], expenses: [],
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

function custodyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cust-1', project_id: PROJECT, resource_name: 'سالم',
    amount: 10000, status: 'active', received_date: '2026-01-01',
    source_fund_id: 'fund-1', created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function expense(over: Record<string, unknown> = {}) {
  return { id: 'exp-1', projectId: PROJECT, amount: 2500, custodyId: 'cust-1', ...over } as never;
}

describe('a custody balance is derived, never stored', () => {
  it('counts the expenses already booked against it', async () => {
    useStore.setState({
      expenses: [expense({ id: 'e1', amount: 2500 }), expense({ id: 'e2', amount: 1500 })],
    } as never);
    mock.on('custodies', 'insert', () => ({ data: custodyRow({ amount: 10000 }) }));

    await store().addCustody({ projectId: PROJECT, resourceName: 'سالم', amount: 10000 } as never);

    const c = store().custodies[0];
    expect(c.spent).toBe(4000);
    expect(c.remaining).toBe(6000);
  });

  /**
   * Two people can hold custody on the same project at once. Summing the
   * project's expenses instead of this custody's would charge each of them for
   * the other's spending and show both short.
   */
  it('counts only its own expenses, not the project\'s', async () => {
    useStore.setState({
      expenses: [
        expense({ id: 'mine', amount: 2500, custodyId: 'cust-1' }),
        expense({ id: 'theirs', amount: 9000, custodyId: 'cust-2' }),
        expense({ id: 'unattached', amount: 7000, custodyId: undefined }),
      ],
    } as never);
    mock.on('custodies', 'insert', () => ({ data: custodyRow({ amount: 10000 }) }));

    await store().addCustody({ projectId: PROJECT, resourceName: 'سالم', amount: 10000 } as never);

    expect(store().custodies[0].spent).toBe(2500);
    expect(store().custodies[0].remaining).toBe(7500);
  });

  it('opens a custody with nothing spent when no expenses point at it', async () => {
    mock.on('custodies', 'insert', () => ({ data: custodyRow() }));

    await store().addCustody({ projectId: PROJECT, resourceName: 'سالم', amount: 10000 } as never);

    expect(store().custodies[0]).toMatchObject({ spent: 0, remaining: 10000, status: 'active' });
  });
});

describe('the over-limit refusal comes from the database and must reach the user', () => {
  /**
   * A custody larger than the fund behind it is refused by a database trigger,
   * and that trigger's message is the only thing saying by how much. Replacing
   * it with a generic failure leaves the user guessing at a number the system
   * already knows.
   */
  it('surfaces the trigger message verbatim', async () => {
    mock.on('custodies', 'insert', () => ({
      error: { message: 'مبلغ العهدة يتجاوز رصيد الدفعة المتاح (7,500.00 ر.س)' },
    }));

    await expect(store().addCustody({
      projectId: PROJECT, resourceName: 'سالم', amount: 10000,
    } as never)).rejects.toThrow('مبلغ العهدة يتجاوز رصيد الدفعة المتاح (7,500.00 ر.س)');

    expect(store().custodies).toHaveLength(0);
  });

  it('still throws on an unrelated database error', async () => {
    mock.on('custodies', 'insert', () => ({ error: { message: 'connection reset' } }));

    await expect(store().addCustody({
      projectId: PROJECT, resourceName: 'سالم', amount: 10000,
    } as never)).rejects.toBeDefined();

    expect(store().custodies).toHaveLength(0);
  });
});

/**
 * `sourceFundId` is three-valued on the way in and two-valued in the store:
 * a value sets it, `null` means "clear it", and absent means "leave it alone".
 * The Custody type spells "cleared" as absent, so the three have to collapse to
 * two without the absent case being mistaken for a clear.
 */
describe('clearing a custody\'s source fund is distinct from not touching it', () => {
  beforeEach(() => {
    useStore.setState({
      custodies: [{
        id: 'cust-1', projectId: PROJECT, resourceName: 'سالم', amount: 10000,
        spent: 2500, remaining: 7500, status: 'active', sourceFundId: 'fund-1',
      }],
    } as never);
  });

  it('clears it when the patch says null, on the wire and in the store', async () => {
    await store().updateCustody('cust-1', { sourceFundId: null });

    expect(mock.find('custodies', 'update')?.payload).toMatchObject({ source_fund_id: null });
    expect(store().custodies[0].sourceFundId).toBeUndefined();
  });

  it('leaves it alone when the patch does not mention it', async () => {
    await store().updateCustody('cust-1', { notes: 'ملاحظة' });

    expect(mock.find('custodies', 'update')?.payload).not.toHaveProperty('source_fund_id');
    expect(store().custodies[0].sourceFundId).toBe('fund-1');
  });

  it('moves it when the patch names another fund', async () => {
    await store().updateCustody('cust-1', { sourceFundId: 'fund-2' });

    expect(mock.find('custodies', 'update')?.payload).toMatchObject({ source_fund_id: 'fund-2' });
    expect(store().custodies[0].sourceFundId).toBe('fund-2');
  });

  /**
   * An update patches fields; it does not re-derive. Zeroing the balance here
   * would make a closing edit look like an unspent custody.
   */
  it('keeps the derived balance while patching other fields', async () => {
    await store().updateCustody('cust-1', { status: 'closed', closedDate: '2026-03-01' });

    expect(store().custodies[0]).toMatchObject({
      status: 'closed', spent: 2500, remaining: 7500,
    });
  });

  it('removes only the custody asked for', async () => {
    useStore.setState({
      custodies: [
        { id: 'cust-1', resourceName: 'سالم' },
        { id: 'cust-2', resourceName: 'خالد' },
      ],
    } as never);

    await store().deleteCustody('cust-1');

    expect(store().custodies.map((c) => c.id)).toEqual(['cust-2']);
  });
});
