/**
 * The sixth layer: the fund lifecycle.
 *
 * A project fund is cash handed to a site, and the whole control model rests on
 * one rule — **one open fund at a time**. A second fund cannot be opened until
 * the first is settled, unless it is explicitly marked an emergency payment
 * with a stated reason. Every test below exists because breaking it either
 * unlocks that rule quietly or leaves the ledger pointing at money that is not
 * where it says it is.
 *
 * Two failures shaped this file:
 *
 *   - a rejected settlement that returns the fund to `settled` instead of
 *     `acknowledged` would unlock new funds on a settlement nobody approved;
 *   - `deleteFund` unlinks expenses and custodies before deleting the row. Run
 *     in the other order and the rows point at a fund that no longer exists.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';

// `vi.mock` is hoisted above every import, so the recorder has to be built in a
// hoisted block too — a plain top-level const is not initialised yet when the
// mock factory runs.
const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
}));

const PROJECT = 'proj-1';

function fund(over: Record<string, unknown> = {}) {
  return {
    id: 'fund-1', projectId: PROJECT, fundNumber: 1, amount: 10000,
    transferDate: '2026-01-01', status: 'settled', createdBy: 'user-1',
    ...over,
  } as never;
}

function settlement(over: Record<string, unknown> = {}) {
  return {
    id: 'st-1', fundId: 'fund-1', projectId: PROJECT,
    totalReceived: 10000, totalSpent: 0, remainingCash: 0, difference: 0,
    status: 'draft', attachments: [],
    ...over,
  } as never;
}

/** A row as the database returns it, so the mapper is exercised for real. */
function fundRow(over: Record<string, unknown> = {}) {
  return {
    id: 'fund-1', project_id: PROJECT, fund_number: 1, amount: 10000,
    transfer_date: '2026-01-01', status: 'transferred', created_by: 'user-1',
    ...over,
  };
}

function settlementRow(over: Record<string, unknown> = {}) {
  return {
    id: 'st-1', fund_id: 'fund-1', project_id: PROJECT,
    total_received: 10000, total_spent: 0, remaining_cash: 0,
    status: 'draft', attachments: [], ...over,
  };
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  useStore.setState({
    projectFunds: [], fundSettlements: [], expenses: [], custodies: [],
  });
  // createFund reloads from the database first; keep that a no-op so the tests
  // control the fund list through local state rather than through the reload.
  useStore.setState({ loadFundsForProject: vi.fn().mockResolvedValue(undefined) } as never);
});

describe('one open fund at a time', () => {
  it('refuses a second fund while an earlier one is unsettled, and names it', async () => {
    useStore.setState({ projectFunds: [fund({ fundNumber: 3, status: 'acknowledged' })] });

    await expect(store().createFund(PROJECT, 5000, '2026-02-01'))
      .rejects.toThrow('لا يمكن إنشاء دفعة جديدة قبل تسوية الدفعة رقم 3');
    expect(mock.find('project_funds', 'insert')).toBeUndefined();
  });

  it('allows a new fund once every earlier one is settled', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'settled' })] });
    mock.on('project_funds', 'select', () => ({ data: [{ fund_number: 1 }] }));
    mock.on('project_funds', 'insert', () => ({ data: fundRow({ id: 'fund-2', fund_number: 2 }) }));

    await store().createFund(PROJECT, 5000, '2026-02-01');

    expect(mock.find('project_funds', 'insert')?.payload)
      .toMatchObject({ fund_number: 2, amount: 5000, status: 'transferred' });
  });

  /**
   * The rule is per project. A different project's open fund blocking this one
   * would stop unrelated sites from being funded at all.
   */
  it('ignores an unsettled fund belonging to another project', async () => {
    useStore.setState({
      projectFunds: [fund({ id: 'other', projectId: 'proj-2', status: 'transferred' })],
    });
    mock.on('project_funds', 'select', () => ({ data: [] }));
    mock.on('project_funds', 'insert', () => ({ data: fundRow({ fund_number: 1 }) }));

    await store().createFund(PROJECT, 5000, '2026-02-01');

    expect(mock.find('project_funds', 'insert')).toBeDefined();
  });
});

describe('the emergency payment is the only way past that rule', () => {
  beforeEach(() => {
    useStore.setState({ projectFunds: [fund({ fundNumber: 3, status: 'transferred' })] });
    mock.on('project_funds', 'select', () => ({ data: [{ fund_number: 3 }] }));
    mock.on('project_funds', 'insert', () => ({ data: fundRow({ id: 'fund-4', fund_number: 4 }) }));
  });

  it('lets an emergency payment through with a reason', async () => {
    await store().createFund(PROJECT, 5000, '2026-02-01', undefined, {
      emergency: true, emergencyReason: 'إصلاح عاجل',
    });

    expect(mock.find('project_funds', 'insert')?.payload).toMatchObject({ fund_number: 4 });
  });

  it('refuses one without a reason, before touching the database', async () => {
    await expect(store().createFund(PROJECT, 5000, '2026-02-01', undefined, {
      emergency: true, emergencyReason: '   ',
    })).rejects.toThrow('سبب الدفعة الاستثنائية مطلوب');

    expect(mock.calls).toHaveLength(0);
  });

  /**
   * The marker in the notes is what makes an emergency visible afterwards. Lose
   * the prefix and a payment that bypassed the settlement rule reads in every
   * report as an ordinary one.
   */
  it('stamps the notes so the bypass stays visible in the ledger', async () => {
    await store().createFund(PROJECT, 5000, '2026-02-01', 'دفعة مقاول', {
      emergency: true, emergencyReason: 'إصلاح عاجل',
    });

    expect(mock.find('project_funds', 'insert')?.payload).toMatchObject({
      notes: '[دفعة استثنائية] إصلاح عاجل — دفعة مقاول',
    });
  });
});

describe('the fund number is taken from the database, not from local state', () => {
  beforeEach(() => useStore.setState({ projectFunds: [] }));

  it('numbers the next fund one past the highest the database holds', async () => {
    mock.on('project_funds', 'select', () => ({ data: [{ fund_number: 7 }] }));
    mock.on('project_funds', 'insert', () => ({ data: fundRow({ fund_number: 8 }) }));

    await store().createFund(PROJECT, 1000, '2026-02-01');

    expect(mock.find('project_funds', 'insert')?.payload).toMatchObject({ fund_number: 8 });
  });

  /**
   * Two people funding the same project at once collide on the unique number.
   * The retry re-reads rather than incrementing blindly, so the second attempt
   * lands past whatever the winner just wrote.
   */
  it('recomputes and retries once when the number is already taken', async () => {
    let reads = 0;
    mock.on('project_funds', 'select', () => {
      reads += 1;
      return { data: [{ fund_number: reads === 1 ? 1 : 2 }] };
    });
    let inserts = 0;
    mock.on('project_funds', 'insert', () => {
      inserts += 1;
      return inserts === 1
        ? { error: { code: '23505', message: 'duplicate key' } }
        : { data: fundRow({ fund_number: 3 }) };
    });

    await store().createFund(PROJECT, 1000, '2026-02-01');

    expect(reads).toBe(2);
    expect(inserts).toBe(2);
    const attempts = mock.calls.filter((c) => c.table === 'project_funds' && c.op === 'insert');
    expect(attempts.map((c) => (c.payload as { fund_number: number }).fund_number)).toEqual([2, 3]);
  });

  it('gives a collision its own message rather than the raw database error', async () => {
    mock.on('project_funds', 'select', () => ({ data: [{ fund_number: 1 }] }));
    mock.on('project_funds', 'insert', () => ({ error: { code: '23505', message: 'duplicate key' } }));

    await expect(store().createFund(PROJECT, 1000, '2026-02-01'))
      .rejects.toThrow('تعذّر إنشاء الدفعة بسبب تعارض في الترقيم');
  });
});

describe('acknowledging a fund opens its settlement', () => {
  it('refuses a fund that is not merely transferred', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'acknowledged' })] });

    await expect(store().acknowledgeFund('fund-1'))
      .rejects.toThrow('هذه الدفعة لا يمكن إقرار استلامها');
    expect(mock.calls).toHaveLength(0);
  });

  it('refuses a fund that is not in the store', async () => {
    await expect(store().acknowledgeFund('ghost')).rejects.toThrow('الدفعة غير موجودة');
    expect(mock.calls).toHaveLength(0);
  });

  /**
   * The draft settlement is seeded with the fund's own amount as
   * `total_received`. Seed it with anything else and every settlement starts
   * from a received figure that never matches what was transferred.
   */
  it('seeds the draft settlement with the amount that was transferred', async () => {
    useStore.setState({ projectFunds: [fund({ status: 'transferred', amount: 7500 })] });
    mock.on('project_funds', 'update', () => ({ data: fundRow({ status: 'acknowledged' }) }));
    mock.on('fund_settlements', 'insert', () => ({ data: settlementRow({ total_received: 7500 }) }));

    await store().acknowledgeFund('fund-1');

    expect(mock.find('fund_settlements', 'insert')?.payload).toMatchObject({
      fund_id: 'fund-1', total_received: 7500, total_spent: 0, status: 'draft',
    });
    expect(store().fundSettlements[0].totalReceived).toBe(7500);
    expect(store().projectFunds[0].status).toBe('acknowledged');
  });
});

describe('approving a settlement closes the fund with it', () => {
  it('refuses a settlement that was never submitted', async () => {
    useStore.setState({ fundSettlements: [settlement({ status: 'draft' })] });

    await expect(store().approveSettlement('st-1'))
      .rejects.toThrow('لا يمكن اعتماد تسوية ليست في حالة "مُرسلة"');
    expect(mock.calls).toHaveLength(0);
  });

  /**
   * Both writes must land. Approving the settlement while leaving the fund open
   * keeps the project locked out of new funding forever; closing the fund
   * without approving the settlement unlocks funding on an unapproved one.
   */
  it('marks the settlement approved and the fund settled together', async () => {
    useStore.setState({
      fundSettlements: [settlement({ status: 'submitted' })],
      projectFunds: [fund({ status: 'acknowledged' })],
    });
    mock.on('fund_settlements', 'update', () => ({ data: settlementRow({ status: 'approved' }) }));
    mock.on('project_funds', 'update', () => ({ data: fundRow({ status: 'settled' }) }));

    await store().approveSettlement('st-1');

    expect(mock.find('fund_settlements', 'update')?.payload).toMatchObject({ status: 'approved' });
    expect(mock.find('project_funds', 'update')?.payload).toMatchObject({ status: 'settled' });
    expect(store().fundSettlements[0].status).toBe('approved');
    expect(store().projectFunds[0].status).toBe('settled');
  });
});

describe('rejecting a settlement reopens the fund, it does not close it', () => {
  beforeEach(() => {
    useStore.setState({
      fundSettlements: [settlement({ status: 'submitted' })],
      projectFunds: [fund({ status: 'acknowledged' })],
    });
  });

  it('requires a reason, and whitespace is not one', async () => {
    await expect(store().rejectSettlement('st-1', '   '))
      .rejects.toThrow('يجب كتابة سبب الرفض');
    expect(mock.calls).toHaveLength(0);
  });

  /**
   * This is the one that matters. `settled` here would let the project open a
   * new fund on the strength of a settlement that was just refused.
   */
  it('returns the fund to acknowledged, never to settled', async () => {
    mock.on('fund_settlements', 'update', () => ({ data: settlementRow({ status: 'rejected' }) }));
    mock.on('project_funds', 'update', () => ({ data: fundRow({ status: 'acknowledged' }) }));

    await store().rejectSettlement('st-1', 'المرفقات ناقصة');

    expect(mock.find('project_funds', 'update')?.payload).toMatchObject({ status: 'acknowledged' });
    expect(mock.find('fund_settlements', 'update')?.payload)
      .toMatchObject({ status: 'rejected', rejection_reason: 'المرفقات ناقصة' });
    expect(store().projectFunds[0].status).toBe('acknowledged');
  });
});

describe('deleting a fund unlinks before it deletes', () => {
  beforeEach(() => {
    useStore.setState({
      projectFunds: [fund()],
      fundSettlements: [settlement()],
      expenses: [{ id: 'exp-1', fundId: 'fund-1' }, { id: 'exp-2', fundId: 'fund-9' }] as never,
      custodies: [{ id: 'cust-1', sourceFundId: 'fund-1' }] as never,
    });
  });

  /**
   * Order, not just presence. Delete first and the expense and custody rows
   * spend the intervening moment pointing at a fund that is already gone.
   */
  it('clears the expense and custody links before removing the row', async () => {
    await store().deleteFund('fund-1');

    expect(mock.order()).toEqual([
      'expenses:update', 'custodies:update', 'project_funds:delete',
    ]);
    expect(mock.find('expenses', 'update')?.payload).toEqual({ fund_id: null });
    expect(mock.find('custodies', 'update')?.payload).toEqual({ source_fund_id: null });
  });

  it('mirrors all three removals in local state, and leaves other rows alone', async () => {
    await store().deleteFund('fund-1');

    expect(store().projectFunds).toHaveLength(0);
    expect(store().fundSettlements).toHaveLength(0);
    expect(store().expenses.find((e) => e.id === 'exp-1')?.fundId).toBeUndefined();
    // an expense on a different fund keeps its link
    expect(store().expenses.find((e) => e.id === 'exp-2')?.fundId).toBe('fund-9');
    expect(store().custodies[0].sourceFundId).toBeUndefined();
  });

  it('stops at the first failure rather than deleting a half-unlinked fund', async () => {
    mock.on('expenses', 'update', () => ({ error: { message: 'boom' } }));

    await expect(store().deleteFund('fund-1')).rejects.toBeDefined();

    expect(mock.order()).toEqual(['expenses:update']);
    expect(store().projectFunds).toHaveLength(1);
  });
});
