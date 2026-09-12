/**
 * Component tests for the budget amendment manager, written before it is
 * split. What costs money: opening a locked budget takes a snapshot,
 * approving takes another, and the comparison between the two is how the
 * owner sees what an amendment changed.
 *
 * One test was red when written: the comparison flagged an item as
 * modified only when its amount or description changed, so an item moved
 * to another category read as unchanged, with the new category shown as
 * if it had always been there. The fix commit that follows turns it green
 * without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetAmendment } from '@/types/project';
import { BudgetAmendmentManager } from '../BudgetAmendmentManager';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PROJECT_ID = 'p-1';

function amendment(over: Partial<BudgetAmendment>): BudgetAmendment {
  return {
    id: 'a', projectId: PROJECT_ID, reason: 'سبب', snapshotBefore: [], totalBefore: 0, status: 'approved',
    createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z', ...over,
  };
}

const draft = amendment({
  id: 'a-draft', reason: 'تصحيح تقدير الرواتب', status: 'draft', totalBefore: 60000,
  snapshotBefore: [
    { id: 'b1', category: 'salary', description: 'رواتب', plannedAmount: 50000 },
    { id: 'b2', category: 'equipment', description: 'معدات', plannedAmount: 10000 },
  ],
});

const approved = amendment({
  id: 'a-approved', reason: 'إعادة توزيع', totalBefore: 60000, totalAfter: 66000, approvedAt: '2026-03-02T09:00:00Z',
  snapshotBefore: [
    { id: 'b1', category: 'salary', description: 'رواتب', plannedAmount: 50000 },
    { id: 'b2', category: 'equipment', description: 'معدات', plannedAmount: 10000 },
    { id: 'b3', category: 'travel', description: 'سفر', plannedAmount: 4000 },
    { id: 'b4', category: 'printing', description: 'مطبوعات', plannedAmount: 1000 },
  ],
  snapshotAfter: [
    { id: 'b1', category: 'salary', description: 'رواتب', plannedAmount: 55000 },
    { id: 'b2', category: 'equipment', description: 'معدات', plannedAmount: 10000 },
    { id: 'b4', category: 'media', description: 'مطبوعات', plannedAmount: 1000 },
    { id: 'b5', category: 'consulting', description: 'استشارات', plannedAmount: 4000 },
  ],
});

const cancelled = amendment({ id: 'a-cancelled', reason: 'تراجع', status: 'cancelled', totalBefore: 60000, createdAt: '2026-02-20T10:00:00Z' });
const elsewhere = amendment({ id: 'a-other', projectId: 'p-2', reason: 'مشروع آخر', totalBefore: 1, totalAfter: 2 });

const actions = {
  openBudgetAmendment: vi.fn().mockResolvedValue('a-new'),
  cancelBudgetAmendment: vi.fn().mockResolvedValue(undefined),
  approveBudgetAmendment: vi.fn().mockResolvedValue(undefined),
  loadBudgetAmendments: vi.fn().mockResolvedValue([]),
};

function seed(amendments: BudgetAmendment[]) {
  useStore.setState({ budgetAmendments: amendments, ...actions } satisfies Partial<AppState>);
}

function renderManager(over: { locked?: boolean; readOnly?: boolean; onChange?: (a: BudgetAmendment | null) => void } = {}) {
  return render(
    <BudgetAmendmentManager projectId={PROJECT_ID} baselineLocked={over.locked ?? true} readOnly={over.readOnly ?? false} onAmendmentChange={over.onChange} />,
  );
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.success).mockClear();
});

describe('when it shows', () => {
  it('shows nothing for a viewer, or for an unlocked budget with no history', () => {
    seed([approved]);
    const { unmount } = renderManager({ readOnly: true });
    expect(screen.queryByText('تعديل الموازنة المقفلة')).not.toBeInTheDocument();
    unmount();
    seed([elsewhere]);
    renderManager({ locked: false });
    expect(screen.queryByText('تعديل الموازنة المقفلة')).not.toBeInTheDocument();
  });

  it('loads the project amendments and tells the parent about the draft', async () => {
    seed([draft]);
    const onChange = vi.fn();
    renderManager({ onChange });
    await waitFor(() => expect(actions.loadBudgetAmendments).toHaveBeenCalledWith(PROJECT_ID));
    expect(onChange).toHaveBeenCalledWith(draft);
  });
});

describe('opening a locked budget', () => {
  it('needs a reason, then opens with it and takes the snapshot', async () => {
    seed([]);
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: /فتح الموازنة للتعديل/ }));
    const dialog = screen.getByRole('dialog');
    const open = within(dialog).getByRole('button', { name: 'فتح الموازنة' });
    expect(open).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText(/تصحيح خطأ في تقدير/), { target: { value: '  تحديث الأسعار  ' } });
    fireEvent.click(open);
    await waitFor(() => expect(actions.openBudgetAmendment).toHaveBeenCalledWith(PROJECT_ID, '  تحديث الأسعار  '));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });
});

describe('an open draft', () => {
  it('shows its reason and the snapshot taken, and approves on request', async () => {
    seed([draft]);
    renderManager();
    expect(screen.getByText('الموازنة مفتوحة للتعديل الآن')).toBeInTheDocument();
    expect(screen.getByText('تصحيح تقدير الرواتب')).toBeInTheDocument();
    expect(screen.getByText(/لقطة قبل:/)).toHaveTextContent('60,000.00 ر.س · 2 بند');
    expect(screen.queryByRole('button', { name: /فتح الموازنة للتعديل/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /اعتماد التعديل/ }));
    await waitFor(() => expect(actions.approveBudgetAmendment).toHaveBeenCalledWith('a-draft'));
  });

  it('cancels only after confirmation', async () => {
    seed([draft]);
    renderManager();
    fireEvent.click(screen.getByRole('button', { name: /إلغاء التعديل/ }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText(/لن تُسترجع تلقائياً/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'تأكيد الإلغاء' }));
    await waitFor(() => expect(actions.cancelBudgetAmendment).toHaveBeenCalledWith('a-draft'));
  });
});

describe('the history and the comparison', () => {
  it('lists this project\'s past amendments with each approved delta, comparison only where there is an after', () => {
    seed([approved, cancelled, elsewhere]);
    renderManager({ locked: false });
    expect(screen.getByText('سجل التعديلات (2)')).toBeInTheDocument();
    expect(screen.getByText('+6,000.00 ر.س')).toBeInTheDocument();
    expect(screen.getByText('ملغي')).toBeInTheDocument();
    expect(screen.queryByText('مشروع آخر')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /مقارنة/ })).toHaveLength(1);
  });

  it('compares the two snapshots item by item, changes first', () => {
    seed([approved]);
    renderManager({ locked: false });
    fireEvent.click(screen.getByRole('button', { name: /مقارنة/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('قبل التعديل').nextElementSibling).toHaveTextContent('60,000.00 ر.س');
    expect(within(dialog).getByText('بعد التعديل').nextElementSibling).toHaveTextContent('66,000.00 ر.س');
    expect(within(dialog).getByText('الفرق', { selector: 'p' }).nextElementSibling).toHaveTextContent('+6,000.00 ر.س');

    const rows = within(dialog).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows.map((r) => r[2])).toEqual(['استشارات', 'رواتب', 'مطبوعات', 'سفر', 'معدات']);
    expect(rows.map((r) => r[0])).toEqual(['مُضاف', 'مُعدّل', 'مُعدّل', 'محذوف', '—']);
    // The item moved from printing to media keeps its amount; the comparison must still flag it.
    expect(rows[2].slice(1)).toEqual(['تغطية إعلامية', 'مطبوعات', '1,000.00 ر.س', '1,000.00 ر.س', '—']);
    expect(rows[1].slice(3)).toEqual(['50,000.00 ر.س', '55,000.00 ر.س', '+5,000.00 ر.س']);
    expect(rows[3].slice(3)).toEqual(['4,000.00 ر.س', '—', '-4,000.00 ر.س']);
  });
});
