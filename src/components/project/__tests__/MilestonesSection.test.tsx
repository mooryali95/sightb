/**
 * Component tests for the milestones section, written before it is split.
 *
 * What costs money here is the project's percent complete: the weighted
 * figure that EVM, the dashboard and the health matrix read from the
 * project row. Every write that moves a milestone must leave that row
 * consistent with the milestones, and an edit must save what the form
 * shows, including a cleared field.
 *
 * Six tests were red when written: adding a milestone and deleting one
 * left the project's percent where it was; an edit sent `undefined` for a
 * cleared description or date, which the store reads as "unchanged", and
 * reset the row's sort order to the list length; completing a milestone
 * in the same edit that linked it to a revenue offered no invoice; a
 * planned milestone typed straight to 100 from its row was saved as "in
 * progress"; and cancelling an edit left the next "new milestone" in edit
 * mode. The fix commits that follow turn them green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { Milestone, Project, Revenue } from '@/types/project';
import { MilestonesSection } from '../MilestonesSection';
import { flushPendingDeletes } from '@/lib/undo-delete';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('../GanttChart', () => ({ GanttChart: () => null }));

const PROJECT_ID = 'p-1';

const project: Project = {
  id: PROJECT_ID, companyId: 'c-1', name: 'مشروع الوزارة', contractValue: 100000, currency: 'SAR',
  startDate: '2027-01-01', endDate: '2027-06-30', durationMonths: 6, resourceCount: 1,
  status: 'active', createdAt: '2026-01-01T00:00:00Z', percentComplete: 30,
  contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
};

function milestone(over: Partial<Milestone>): Milestone {
  return { id: 'm', projectId: PROJECT_ID, name: 'مرحلة', sortOrder: 0, percentComplete: 0, weight: 0, status: 'planned', createdAt: '', ...over };
}

// Dates in 2027 so the delayed-milestone sweep on mount has nothing to do.
const milestones: Milestone[] = [
  milestone({ id: 'm-design', name: 'التصميم', weight: 0.5, percentComplete: 100, status: 'completed', plannedStart: '2027-01-01', plannedEnd: '2027-02-01', linkedRevenueId: 'rev-invoiced', sortOrder: 0 }),
  milestone({ id: 'm-build', name: 'التنفيذ', description: 'بناء النظام', weight: 0.3, percentComplete: 50, status: 'in_progress', plannedStart: '2027-02-01', plannedEnd: '2027-04-01', linkedRevenueId: 'rev-planned', sortOrder: 1 }),
  milestone({ id: 'm-handover', name: 'التسليم', weight: 0.2, sortOrder: 2 }),
];

function revenue(over: Partial<Revenue>): Revenue {
  return { id: 'rev', projectId: PROJECT_ID, description: 'إيراد', amount: 0, date: '2027-03-01', month: 3, revenueType: 'milestone', status: 'planned', ...over };
}

const revenues: Revenue[] = [
  revenue({ id: 'rev-planned', description: 'دفعة التنفيذ', amount: 30000, status: 'planned' }),
  revenue({ id: 'rev-invoiced', description: 'دفعة التصميم', amount: 20000, status: 'invoiced' }),
];

const actions = {
  addMilestone: vi.fn().mockResolvedValue('m-new'),
  updateMilestone: vi.fn().mockResolvedValue(undefined),
  deleteMilestone: vi.fn().mockResolvedValue(undefined),
  updateProject: vi.fn().mockResolvedValue(undefined),
  updateRevenue: vi.fn().mockResolvedValue(undefined),
};

function renderSection(over: { readOnly?: boolean; rows?: Milestone[]; project?: Project } = {}) {
  return render(
    <MilestonesSection
      projectId={PROJECT_ID} milestones={over.rows ?? milestones} project={over.project ?? project}
      revenues={revenues} readOnly={over.readOnly ?? false}
    />,
  );
}

function cardFor(name: string): HTMLElement {
  const card = screen.getByText(name, { selector: 'h4' }).closest('.p-3');
  if (!card) throw new Error(`"${name}" is not listed`);
  return card as HTMLElement;
}

function openNewForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /مرحلة جديدة/ }));
  return screen.getByRole('dialog');
}

function openEditForm(name: string): HTMLElement {
  const [edit] = within(cardFor(name)).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
  fireEvent.click(edit);
  return screen.getByRole('dialog');
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(dialog: HTMLElement, shown: string, option: RegExp) {
  const trigger = within(dialog).getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

const nameInput = (dialog: HTMLElement) => within(dialog).getByPlaceholderText('مثال: مرحلة التصميم');
const percentInput = (dialog: HTMLElement) => within(dialog).getAllByRole('spinbutton')[1];

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  useStore.setState({ ...actions } satisfies Partial<AppState>);
});

describe('the figures', () => {
  it('shows the weighted percent complete and the count', () => {
    renderSection();
    // 0.5 × 100 + 0.3 × 50 + 0.2 × 0 over weights summing to 1.
    expect(screen.getByText(/الإنجاز المرجّح: 65% · 3 مرحلة/)).toBeInTheDocument();
    expect(screen.queryByText(/مجموع الأوزان/)).not.toBeInTheDocument();
  });

  it('warns when the weights do not sum to one', () => {
    renderSection({ rows: milestones.filter((m) => m.id !== 'm-handover') });
    expect(screen.getByText(/مجموع الأوزان \(0\.80\) أقل من 1/)).toBeInTheDocument();
  });

  it('lists milestones by planned start, undated last, with their badges', () => {
    renderSection();
    const names = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(names).toEqual(['التصميم', 'التنفيذ', 'التسليم']);
    expect(within(cardFor('التصميم')).getByText('مكتمل')).toBeInTheDocument();
    expect(within(cardFor('التنفيذ')).getByText('مربوط بإيراد')).toBeInTheDocument();
    expect(within(cardFor('التنفيذ')).getByText('بناء النظام')).toBeInTheDocument();
    expect(within(cardFor('التسليم')).queryByText('مربوط بإيراد')).not.toBeInTheDocument();
  });
});

describe('adding a milestone', () => {
  it('adds it in progress at the end of the order and moves the project percent with it', async () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(nameInput(dialog), { target: { value: 'الاختبار' } });
    fireEvent.change(within(dialog).getByPlaceholderText('0.25'), { target: { value: '0.2' } });
    fireEvent.change(percentInput(dialog), { target: { value: '40' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addMilestone).toHaveBeenCalledTimes(1));
    expect(actions.addMilestone).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, name: 'الاختبار', weight: 0.2, percentComplete: 40, status: 'in_progress', sortOrder: 3,
    }));
    // (50 + 15 + 0 + 8) / 1.2 = 60.8 → 61: the project row follows the new weight.
    await waitFor(() => expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { percentComplete: 61 }));
  });

  it('refuses a milestone with no name', () => {
    renderSection();
    const dialog = openNewForm();
    expect(within(dialog).getByText('إضافة مرحلة')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(actions.addMilestone).not.toHaveBeenCalled();
  });
});

describe('editing a milestone', () => {
  it('saves the cleared fields as cleared, keeps the row order, and moves the project percent', async () => {
    renderSection();
    const dialog = openEditForm('التنفيذ');
    expect(nameInput(dialog)).toHaveValue('التنفيذ');
    fireEvent.change(within(dialog).getByDisplayValue('بناء النظام'), { target: { value: '' } });
    const [, plannedEnd] = Array.from(dialog.querySelectorAll('input[type="date"]'));
    fireEvent.change(plannedEnd, { target: { value: '' } });
    fireEvent.change(percentInput(dialog), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateMilestone).toHaveBeenCalledTimes(1));
    expect(actions.updateMilestone).toHaveBeenCalledWith('m-build', expect.objectContaining({
      name: 'التنفيذ', description: null, plannedStart: '2027-02-01', plannedEnd: null,
      percentComplete: 100, status: 'completed', sortOrder: 1,
    }));
    // 0.5 × 100 + 0.3 × 100 + 0.2 × 0 = 80.
    expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { percentComplete: 80 });
  });

  it('offers to invoice the linked planned revenue when the milestone completes', async () => {
    renderSection();
    const dialog = openEditForm('التنفيذ');
    fireEvent.change(percentInput(dialog), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    const prompt = await screen.findByText('إصدار فاتورة؟');
    const promptDialog = prompt.closest('[role="dialog"]') as HTMLElement;
    expect(within(promptDialog).getByText('دفعة التنفيذ')).toBeInTheDocument();
    fireEvent.click(within(promptDialog).getByRole('button', { name: 'نعم — أصدر الفاتورة' }));
    await waitFor(() => expect(actions.updateRevenue).toHaveBeenCalledWith('rev-planned', { status: 'invoiced' }));
  });

  it('offers the invoice when the link and the completion arrive in the same edit', async () => {
    renderSection();
    const dialog = openEditForm('التسليم');
    pick(dialog, 'بدون ربط', /دفعة التنفيذ/);
    fireEvent.change(percentInput(dialog), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateMilestone).toHaveBeenCalledWith('m-handover', expect.objectContaining({ linkedRevenueId: 'rev-planned' })));
    expect(await screen.findByText('إصدار فاتورة؟')).toBeInTheDocument();
  });

  it('opens a blank "new milestone" after an edit is cancelled', () => {
    renderSection();
    const editing = openEditForm('التنفيذ');
    fireEvent.click(within(editing).getByRole('button', { name: 'إلغاء' }));
    const dialog = openNewForm();
    expect(within(dialog).getByText('إضافة مرحلة')).toBeInTheDocument();
    expect(nameInput(dialog)).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'إضافة' })).toBeInTheDocument();
  });
});

describe('the inline percent, deleting, and the read-only view', () => {
  it('moves a milestone into progress or completion from the row and resyncs the project', async () => {
    renderSection();
    fireEvent.change(within(cardFor('التسليم')).getByRole('spinbutton'), { target: { value: '100' } });
    await waitFor(() => expect(actions.updateMilestone).toHaveBeenCalledWith('m-handover', { percentComplete: 100, status: 'completed' }));
    // 50 + 15 + 20 = 85; the build milestone is still at 50, so the project stays active.
    expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { percentComplete: 85 });
    expect(actions.updateProject).not.toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ status: 'completed' }));
  });

  it('completes the project when the last milestone reaches 100', async () => {
    const rows = milestones.map((m) => (m.id === 'm-build' ? { ...m, percentComplete: 100, status: 'completed' as const } : m));
    renderSection({ rows });
    fireEvent.change(within(cardFor('التسليم')).getByRole('spinbutton'), { target: { value: '100' } });
    await waitFor(() => expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { status: 'completed', percentComplete: 100 }));
  });

  it('deletes without a dialog, once the undo window passes and resyncs the project percent', async () => {
    renderSection();
    const [del] = within(cardFor('التسليم')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(del);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(actions.deleteMilestone).not.toHaveBeenCalled();
    await act(async () => { await flushPendingDeletes(); });
    await waitFor(() => expect(actions.deleteMilestone).toHaveBeenCalledWith('m-handover', expect.objectContaining({ id: 'm-handover' })));
    // (50 + 15) / 0.8 = 81.25 → 81.
    await waitFor(() => expect(actions.updateProject).toHaveBeenCalledWith(PROJECT_ID, { percentComplete: 81 }));
  });

  it('shows a viewer the list with nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /مرحلة جديدة/ })).not.toBeInTheDocument();
    expect(within(cardFor('التنفيذ')).queryAllByRole('button')).toHaveLength(0);
    expect(within(cardFor('التنفيذ')).getByRole('spinbutton')).toBeDisabled();
  });
});
