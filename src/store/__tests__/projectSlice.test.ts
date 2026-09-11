/**
 * The fourteenth layer: the project lifecycle, and the delete that ends it.
 *
 * Deleting a project is the most destructive action in the app and the only one
 * that is not undoable, so most of this file is about the two things standing
 * between a user and it: the archive-first rule, and the order the rows come
 * down in.
 *
 * The rest — add, update, archive — is smaller, but `updateProject` patches
 * eighteen optional fields by hand, which is exactly the shape where a field
 * silently stops being saved and nobody notices until someone asks why the
 * contract value never changed.
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

function project(over: Record<string, unknown> = {}) {
  return {
    id: PROJECT, companyId: 'co-1', name: 'مشروع', contractValue: 1_000_000,
    currency: 'SAR', durationMonths: 12, resourceCount: 0, status: 'active',
    ...over,
  } as never;
}

function projectRow(over: Record<string, unknown> = {}) {
  return {
    id: PROJECT, company_id: 'co-1', name: 'مشروع', contract_value: 1_000_000,
    currency: 'SAR', duration_months: 12, resource_count: 0, status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const store = () => useStore.getState();

beforeEach(() => {
  mock.reset();
  useStore.setState({
    projects: [], budgetItems: [], expenses: [], revenues: [], milestones: [],
    changeOrders: [], risks: [], resources: [], custodies: [],
    projectFunds: [], fundSettlements: [],
  } as never);
  mock.on('projects', 'insert', (c) => ({ data: { ...projectRow(), ...(c.payload as object) } }));
});

describe('a project must be archived before it can be deleted', () => {
  it('refuses an active project, before deleting anything', async () => {
    useStore.setState({ projects: [project({ status: 'active' })] });

    await expect(store().deleteProject(PROJECT))
      .rejects.toThrow('يجب أرشفة المشروع قبل حذفه نهائياً');
    expect(mock.calls).toHaveLength(0);
    expect(store().projects).toHaveLength(1);
  });

  it('allows an archived one', async () => {
    useStore.setState({ projects: [project({ status: 'archived' })] });

    await store().deleteProject(PROJECT);

    expect(store().projects).toHaveLength(0);
  });

  /**
   * The guard reads the project from local state, so a project the client has
   * not loaded falls through it. The database trigger named in the code is what
   * stops that case; recorded here so the client-side gap is visible rather
   * than assumed closed.
   */
  it('falls through to the database when the project is not in local state', async () => {
    await store().deleteProject('never-loaded');

    expect(mock.find('projects', 'delete')).toBeDefined();
  });
});

describe('the delete takes every table down, in an order the keys allow', () => {
  beforeEach(() => {
    useStore.setState({ projects: [project({ status: 'archived' })] });
  });

  /**
   * `project_funds` is the one that has to be listed explicitly. Every other
   * table here carries a foreign key to `projects`, so deleting the project
   * would take them anyway; `project_funds.project_id` carries none, and its
   * settlements cascade from it rather than from the project.
   *
   * It has to come after `custodies`, because deleting a custody is what
   * cascades its `cash_transfers` away.
   */
  it('deletes the funds, and does so after the custodies', async () => {
    await store().deleteProject(PROJECT);

    const order = mock.order();
    expect(order).toContain('project_funds:delete');
    expect(order.indexOf('project_funds:delete'))
      .toBeGreaterThan(order.indexOf('custodies:delete'));
  });

  it('takes the project row down last of all', async () => {
    await store().deleteProject(PROJECT);

    const order = mock.order();
    expect(order[order.length - 1]).toBe('projects:delete');
  });

  it('scopes every child delete to this project', async () => {
    await store().deleteProject(PROJECT);

    for (const call of mock.calls.filter((c) => c.table !== 'projects')) {
      expect(call.filters).toContainEqual(['project_id', PROJECT]);
    }
    expect(mock.find('projects', 'delete')?.filters).toContainEqual(['id', PROJECT]);
  });

  it('clears the baselines too', async () => {
    await store().deleteProject(PROJECT);

    expect(mock.order()).toContain('cost_baselines:delete');
  });

  /**
   * Local state has to lose exactly this project's rows. Clearing more takes
   * another project's data off the screen; clearing less leaves rows pointing
   * at a project that no longer exists, and every total built from them counts
   * money for a project that is gone.
   */
  it('drops this project\'s rows from local state and keeps another\'s', async () => {
    useStore.setState({
      projects: [project({ status: 'archived' }), project({ id: OTHER, status: 'active' })],
      budgetItems: [{ id: 'a', projectId: PROJECT }, { id: 'b', projectId: OTHER }],
      expenses: [{ id: 'c', projectId: PROJECT }, { id: 'd', projectId: OTHER }],
      custodies: [{ id: 'e', projectId: PROJECT }, { id: 'f', projectId: OTHER }],
      projectFunds: [{ id: 'g', projectId: PROJECT }, { id: 'h', projectId: OTHER }],
      fundSettlements: [{ id: 'i', projectId: PROJECT }, { id: 'j', projectId: OTHER }],
    } as never);

    await store().deleteProject(PROJECT);

    const s = store();
    expect(s.projects.map((x) => x.id)).toEqual([OTHER]);
    expect(s.budgetItems.map((x) => x.id)).toEqual(['b']);
    expect(s.expenses.map((x) => x.id)).toEqual(['d']);
    expect(s.custodies.map((x) => x.id)).toEqual(['f']);
    expect(s.projectFunds.map((x) => x.id)).toEqual(['h']);
    expect(s.fundSettlements.map((x) => x.id)).toEqual(['j']);
  });
});

describe('creating a project', () => {
  /**
   * Tax and VAT decide what every figure on the project means, so they default
   * rather than arriving null.
   *
   * The `??` earns its keep on `taxPercent` alone: a project with no tax sets
   * it to zero, which `||` would read as absent and silently replace with 15.
   * On `vatInclusive` the two operators are equivalent — false, true and
   * undefined all give the same answer either way — so that one is style, not
   * behaviour. Stated precisely because a fault injection swapping it passed,
   * and an earlier draft of this comment claimed otherwise.
   */
  it('applies the standard tax and VAT treatment when none is given', async () => {
    await store().addProject({
      companyId: 'co-1', name: 'مشروع', contractValue: 1_000_000, currency: 'SAR',
      durationMonths: 12, resourceCount: 0, status: 'active',
    } as never);

    expect(mock.find('projects', 'insert')?.payload).toMatchObject({
      tax_percent: 15, vat_inclusive: false, contract_type: 'lump_sum', retention_percent: 0,
    });
  });

  it('keeps a deliberate zero tax rather than defaulting it to fifteen', async () => {
    await store().addProject({
      companyId: 'co-1', name: 'مشروع', contractValue: 1_000_000, currency: 'SAR',
      durationMonths: 12, resourceCount: 0, status: 'active',
      taxPercent: 0, vatInclusive: true,
    } as never);

    expect(mock.find('projects', 'insert')?.payload).toMatchObject({
      tax_percent: 0, vat_inclusive: true,
    });
  });

  it('stores no portfolio rather than the placeholder', async () => {
    await store().addProject({
      companyId: 'co-1', name: 'مشروع', contractValue: 1, currency: 'SAR',
      durationMonths: 1, resourceCount: 0, status: 'active', portfolioId: 'none',
    } as never);

    expect(mock.find('projects', 'insert')?.payload).toMatchObject({ portfolio_id: null });
  });
});

describe('updating a project sends what it was given, and nothing else', () => {
  beforeEach(() => {
    useStore.setState({ projects: [project({ contractValue: 1_000_000, taxPercent: 15 })] });
  });

  it('sends only the named field', async () => {
    await store().updateProject(PROJECT, { contractValue: 1_200_000 } as never);

    expect(mock.find('projects', 'update')?.payload).toEqual({ contract_value: 1_200_000 });
    expect(store().projects[0].contractValue).toBe(1_200_000);
  });

  /**
   * A zero here is a real value — a project with no tax, no retention, no
   * reserve — and the `!== undefined` checks are what keep it from being read
   * as "not provided" and dropped from the payload.
   */
  it('sends a zero rather than treating it as absence', async () => {
    await store().updateProject(PROJECT, {
      taxPercent: 0, retentionPercent: 0, managementReserve: 0, percentComplete: 0,
    } as never);

    expect(mock.find('projects', 'update')?.payload).toEqual({
      tax_percent: 0, retention_percent: 0, management_reserve: 0, percent_complete: 0,
    });
  });

  it('sends nothing at all for an empty patch', async () => {
    await store().updateProject(PROJECT, {} as never);

    expect(mock.find('projects', 'update')?.payload).toEqual({});
  });
});

describe('archiving and restoring', () => {
  beforeEach(() => {
    useStore.setState({
      projects: [project({ status: 'active' }), project({ id: OTHER, status: 'active' })],
    });
  });

  it('archives only the project named', async () => {
    await store().archiveProject(PROJECT);

    expect(mock.find('projects', 'update')?.payload).toEqual({ status: 'archived' });
    expect(store().projects.find((p) => p.id === PROJECT)?.status).toBe('archived');
    expect(store().projects.find((p) => p.id === OTHER)?.status).toBe('active');
  });

  it('restores an archived project to active', async () => {
    useStore.setState({ projects: [project({ status: 'archived' })] });

    await store().unarchiveProject(PROJECT);

    expect(mock.find('projects', 'update')?.payload).toEqual({ status: 'active' });
    expect(store().projects[0].status).toBe('active');
  });
});
