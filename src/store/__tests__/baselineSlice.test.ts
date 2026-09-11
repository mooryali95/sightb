/**
 * The tenth layer: cost baselines.
 *
 * A baseline is the frozen copy of a budget that every variance figure is
 * measured against. If it is wrong, nothing looks broken — the project simply
 * reports that it is on track, or off it, against the wrong reference.
 *
 * Two invariants carry the weight:
 *
 *   - it is a *copy*, not a view. Editing the budget afterwards must not move
 *     the line the project is being judged against;
 *   - exactly one baseline per project is active. Two, and there are two
 *     answers to "how far off plan are we" with nothing saying which is meant.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/store/useStore';

const mock = await vi.hoisted(async () => {
  const { makeDbMock } = await import('./db-mock');
  return makeDbMock();
});

vi.mock('@/services/db', () => ({ db: mock.db }));
vi.mock('@/store/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/helpers')>()),
  getUserId: vi.fn().mockResolvedValue('user-1'),
  logDeletion: vi.fn().mockResolvedValue(undefined),
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

function baseline(over: Record<string, unknown> = {}) {
  return {
    id: 'bl-1', projectId: PROJECT, name: 'v1', version: 1, isActive: true,
    totalPlanned: 10000, items: [], createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as never;
}

function baselineRow(over: Record<string, unknown> = {}) {
  return {
    id: 'bl-new', project_id: PROJECT, name: 'v1', version: 1, is_active: true,
    total_planned: 10000, created_at: '2026-02-01T00:00:00.000Z',
    ...over,
  };
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  useStore.setState({ baselines: [], budgetItems: [] });
  mock.on('cost_baselines', 'insert', () => ({ data: baselineRow() }));
  mock.on('baseline_items', 'insert', () => ({ data: [] }));
});

describe('a baseline needs a budget to freeze', () => {
  it('refuses a project with no budget items, before writing anything', async () => {
    await expect(store().createBaseline(PROJECT, 'v1'))
      .rejects.toThrow('لا توجد بنود موازنة لإنشاء خط أساس');
    expect(mock.calls).toHaveLength(0);
  });

  /**
   * Emptiness is judged per project. Another project's budget must not make
   * this one look fundable, nor end up copied into its baseline.
   */
  it('does not count another project\'s budget as this one\'s', async () => {
    useStore.setState({ budgetItems: [budgetItem({ projectId: OTHER })] });

    await expect(store().createBaseline(PROJECT, 'v1'))
      .rejects.toThrow('لا توجد بنود موازنة لإنشاء خط أساس');
    expect(mock.calls).toHaveLength(0);
  });
});

describe('the snapshot copies this project\'s budget, and totals it', () => {
  it('copies every item of the project and none of another\'s', async () => {
    useStore.setState({
      budgetItems: [
        budgetItem({ id: 'a', description: 'حديد', plannedAmount: 10000 }),
        budgetItem({ id: 'b', description: 'عمالة', plannedAmount: 4000 }),
        budgetItem({ id: 'x', projectId: OTHER, description: 'دخيل', plannedAmount: 99999 }),
      ],
    });

    await store().createBaseline(PROJECT, 'v1');

    const items = mock.find('baseline_items', 'insert')?.payload as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.description)).toEqual(['حديد', 'عمالة']);
    expect(items.every((i) => i.baseline_id === 'bl-new')).toBe(true);
  });

  /**
   * A recurring item is planned per month, so a 2,000/month line running months
   * 3 to 8 is 12,000 of plan, not 2,000. Totalling it as a single amount
   * understates the baseline and makes the project look over budget against a
   * line that was never the plan.
   */
  it('counts a recurring item across its months, not once', async () => {
    useStore.setState({
      budgetItems: [budgetItem({
        plannedAmount: 2000, costType: 'recurring', startMonth: 3, endMonth: 8,
      })],
    });

    await store().createBaseline(PROJECT, 'v1');

    expect(mock.find('cost_baselines', 'insert')?.payload)
      .toMatchObject({ total_planned: 12000 });
  });

  it('records the name and the total it was given', async () => {
    useStore.setState({
      budgetItems: [budgetItem({ plannedAmount: 10000 }), budgetItem({ id: 'b', plannedAmount: 4000 })],
    });

    await store().createBaseline(PROJECT, 'الأساس المعتمد');

    expect(mock.find('cost_baselines', 'insert')?.payload).toMatchObject({
      project_id: PROJECT, name: 'الأساس المعتمد', total_planned: 14000, is_active: true,
    });
  });
});

describe('versions count up per project', () => {
  it('starts at 1 when the project has none', async () => {
    useStore.setState({ budgetItems: [budgetItem()] });

    await store().createBaseline(PROJECT, 'v1');

    expect(mock.find('cost_baselines', 'insert')?.payload).toMatchObject({ version: 1 });
  });

  it('takes one past the highest this project holds, ignoring other projects', async () => {
    useStore.setState({
      budgetItems: [budgetItem()],
      baselines: [
        baseline({ id: 'a', version: 2 }),
        baseline({ id: 'b', version: 5 }),
        baseline({ id: 'x', projectId: OTHER, version: 40 }),
      ],
    });
    mock.on('cost_baselines', 'insert', () => ({ data: baselineRow({ version: 6 }) }));

    await store().createBaseline(PROJECT, 'v6');

    expect(mock.find('cost_baselines', 'insert')?.payload).toMatchObject({ version: 6 });
  });
});

describe('exactly one baseline is active per project', () => {
  /**
   * The deactivation has to reach the database before the new row claims
   * is_active, or the project briefly — and then permanently, if the second
   * write fails — has two active baselines and two different answers to how far
   * off plan it is.
   */
  it('stands the previous ones down before creating the new one', async () => {
    useStore.setState({
      budgetItems: [budgetItem()],
      baselines: [baseline({ id: 'old', version: 1, isActive: true })],
    });

    await store().createBaseline(PROJECT, 'v2');

    expect(mock.order()).toEqual([
      'cost_baselines:update', 'cost_baselines:insert', 'baseline_items:insert',
    ]);
    const deactivate = mock.find('cost_baselines', 'update');
    expect(deactivate?.payload).toMatchObject({ is_active: false });
    expect(deactivate?.filters).toContainEqual(['project_id', PROJECT]);
  });

  it('skips the stand-down when the project has no baseline yet', async () => {
    useStore.setState({ budgetItems: [budgetItem()] });

    await store().createBaseline(PROJECT, 'v1');

    expect(mock.order()).toEqual(['cost_baselines:insert', 'baseline_items:insert']);
  });

  it('leaves exactly one active in local state, and other projects alone', async () => {
    useStore.setState({
      budgetItems: [budgetItem()],
      baselines: [
        baseline({ id: 'old', version: 1, isActive: true }),
        baseline({ id: 'far', projectId: OTHER, isActive: true }),
      ],
    });

    await store().createBaseline(PROJECT, 'v2');

    const mine = store().baselines.filter((b) => b.projectId === PROJECT);
    expect(mine.filter((b) => b.isActive).map((b) => b.id)).toEqual(['bl-new']);
    expect(store().baselines.find((b) => b.id === 'far')?.isActive).toBe(true);
  });
});

describe('switching the active baseline', () => {
  beforeEach(() => {
    useStore.setState({
      baselines: [
        baseline({ id: 'bl-1', version: 1, isActive: true }),
        baseline({ id: 'bl-2', version: 2, isActive: false }),
        baseline({ id: 'far', projectId: OTHER, isActive: true }),
      ],
    });
  });

  it('stands the project down first, then raises the chosen one', async () => {
    await store().setActiveBaseline('bl-2', PROJECT);

    const [down, up] = mock.calls;
    expect(down.payload).toMatchObject({ is_active: false });
    expect(down.filters).toContainEqual(['project_id', PROJECT]);
    expect(up.payload).toMatchObject({ is_active: true });
    expect(up.filters).toContainEqual(['id', 'bl-2']);
  });

  it('moves the flag in local state without touching another project', async () => {
    await store().setActiveBaseline('bl-2', PROJECT);

    expect(store().baselines.find((b) => b.id === 'bl-1')?.isActive).toBe(false);
    expect(store().baselines.find((b) => b.id === 'bl-2')?.isActive).toBe(true);
    expect(store().baselines.find((b) => b.id === 'far')?.isActive).toBe(true);
  });
});

describe('deleting a baseline', () => {
  it('removes only the one asked for', async () => {
    useStore.setState({
      baselines: [baseline({ id: 'bl-1' }), baseline({ id: 'bl-2', isActive: false })],
    });

    await store().deleteBaseline('bl-2');

    expect(store().baselines.map((b) => b.id)).toEqual(['bl-1']);
  });

  /**
   * Deleting the active baseline leaves the project with none active — no
   * earlier version is promoted in its place. Recorded as the behaviour it is,
   * because a project with no active baseline reports no variance at all rather
   * than reporting it wrongly.
   */
  it('does not promote an older version when the active one goes', async () => {
    useStore.setState({
      baselines: [baseline({ id: 'bl-1', version: 1, isActive: false }), baseline({ id: 'bl-2', version: 2, isActive: true })],
    });

    await store().deleteBaseline('bl-2');

    expect(store().baselines.some((b) => b.isActive)).toBe(false);
  });
});

describe('loading replaces one project\'s baselines only', () => {
  it('keeps another project\'s, and drops this one\'s stale rows', async () => {
    useStore.setState({
      baselines: [baseline({ id: 'stale' }), baseline({ id: 'far', projectId: OTHER })],
    });
    mock.on('cost_baselines', 'select', () => ({ data: [baselineRow({ id: 'fresh' })] }));
    mock.on('baseline_items', 'select', () => ({ data: [] }));

    await store().loadBaselines(PROJECT);

    expect(store().baselines.map((b) => b.id).sort()).toEqual(['far', 'fresh']);
  });
});
