import { todayLocal } from '@/lib/utils';
/**
 * Component tests for the change-orders section, written before it is
 * split. A change order moves the contract value, so what costs money is
 * which orders count (approved only) and what an order carries when it is
 * saved: its impact, its status, and the budget items that will be added
 * to the budget on approval.
 *
 * One test was red when written: cancelling an edit closed the form
 * without resetting it, so the next "new order" opened in edit mode and
 * would have saved over the row that was being edited. The fix commit that
 * follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { ChangeOrder } from '@/types/project';
import { ChangeOrdersSection } from '../ChangeOrdersSection';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PROJECT_ID = 'p-1';

function order(over: Partial<ChangeOrder>): ChangeOrder {
  return {
    id: 'co', projectId: PROJECT_ID, description: 'أمر', changeType: 'scope_addition', amountImpact: 0,
    durationImpact: 0, status: 'proposed', createdAt: '2026-03-01T00:00:00Z', ...over,
  };
}

const changeOrders: ChangeOrder[] = [
  order({ id: 'co-approved', description: 'توسعة النطاق', amountImpact: 20000, durationImpact: 2, status: 'approved',
    budgetItems: [{ category: 'consulting', description: 'استشارات إضافية', plannedAmount: 15000, costType: 'fixed' }] }),
  order({ id: 'co-proposed', description: 'تعديل مقترح', amountImpact: 9000, status: 'proposed' }),
  order({ id: 'co-rejected', description: 'تقليص مرفوض', changeType: 'scope_reduction', amountImpact: -5000, status: 'rejected' }),
];

const actions = {
  addChangeOrder: vi.fn().mockResolvedValue('co-new'),
  updateChangeOrder: vi.fn().mockResolvedValue(undefined),
  deleteChangeOrder: vi.fn().mockResolvedValue(undefined),
};

function renderSection(readOnly = false, rows = changeOrders) {
  return render(<ChangeOrdersSection projectId={PROJECT_ID} changeOrders={rows} contractValue={100000} readOnly={readOnly} />);
}

function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description).closest('tr');
  if (!row) throw new Error(`"${description}" is not in the table`);
  return row;
}

function openNewForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /أمر تغيير$/ }));
  return screen.getByRole('dialog');
}

function openEditForm(description: string): HTMLElement {
  const [edit] = within(rowFor(description)).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
  fireEvent.click(edit);
  return screen.getByRole('dialog');
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(dialog: HTMLElement, shown: string, option: RegExp) {
  const trigger = within(dialog).getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  useStore.setState({ ...actions } satisfies Partial<AppState>);
});

describe('the contract line', () => {
  it('moves the contract by approved orders only', () => {
    renderSection();
    // 100,000 + 20,000 approved; the proposed 9,000 and the rejected −5,000 do not count.
    expect(screen.getByText(/الأصلية: 100,000\.00 ر\.س · المعدّلة: 120,000\.00 ر\.س · الأثر: \+20,000\.00 ر\.س/)).toBeInTheDocument();
  });

  it('lists every order with its sign, duration and linked items', () => {
    renderSection();
    expect(within(rowFor('توسعة النطاق')).getByText('+20,000.00 ر.س')).toBeInTheDocument();
    expect(within(rowFor('توسعة النطاق')).getByText('+2 شهر')).toBeInTheDocument();
    expect(within(rowFor('توسعة النطاق')).getByText('1 بند')).toBeInTheDocument();
    expect(within(rowFor('تقليص مرفوض')).getByText('-5,000.00 ر.س')).toBeInTheDocument();
    expect(within(rowFor('تعديل مقترح')).getByText('مقترح')).toBeInTheDocument();
  });
});

describe('adding an order', () => {
  it('adds a proposed order with its impact and the budget items it carries', async () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(within(dialog).getByPlaceholderText('وصف التغيير المطلوب'), { target: { value: 'أعمال إضافية' } });
    fireEvent.change(within(dialog).getByPlaceholderText('50000'), { target: { value: '30000' } });
    fireEvent.change(within(dialog).getByPlaceholderText('وصف البند'), { target: { value: 'مهندس إضافي' } });
    fireEvent.change(within(dialog).getByPlaceholderText('المبلغ'), { target: { value: '12000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '+ بند' }));
    expect(within(dialog).getByText(/إجمالي البنود: 12,000\.00 ر\.س/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة أمر التغيير' }));

    await waitFor(() => expect(actions.addChangeOrder).toHaveBeenCalledTimes(1));
    expect(actions.addChangeOrder).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID, description: 'أعمال إضافية', changeType: 'scope_addition', amountImpact: 30000,
      durationImpact: 0, status: 'proposed', approvedBy: undefined, approvedDate: undefined, autoRebaseline: true,
      budgetItems: [expect.objectContaining({ category: 'salary', description: 'مهندس إضافي', plannedAmount: 12000, costType: 'fixed' })],
    }));
  });

  it('stamps an order saved as approved with today\'s date', async () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(within(dialog).getByPlaceholderText('وصف التغيير المطلوب'), { target: { value: 'معتمد فوراً' } });
    pick(dialog, 'مقترح', /^معتمد$/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة أمر التغيير' }));

    await waitFor(() => expect(actions.addChangeOrder).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved', approvedDate: todayLocal(),
    })));
  });

  it('refuses an order with no description', async () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة أمر التغيير' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(actions.addChangeOrder).not.toHaveBeenCalled();
  });
});

describe('editing an order', () => {
  it('opens on the row\'s values, keeps its items, and saves the changed impact', async () => {
    renderSection();
    const dialog = openEditForm('توسعة النطاق');
    expect((within(dialog).getByPlaceholderText('50000') as HTMLInputElement).value).toBe('20000');
    expect(within(dialog).getByText(/استشارات إضافية/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('50000'), { target: { value: '25000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateChangeOrder).toHaveBeenCalledWith('co-approved', expect.objectContaining({
      amountImpact: 25000, status: 'approved',
      budgetItems: [expect.objectContaining({ description: 'استشارات إضافية', plannedAmount: 15000 })],
    })));
  });

  it('starts a new order blank after an edit was cancelled', () => {
    renderSection();
    const editDialog = openEditForm('توسعة النطاق');
    fireEvent.click(within(editDialog).getByRole('button', { name: 'إلغاء' }));

    const dialog = openNewForm();
    expect((within(dialog).getByPlaceholderText('وصف التغيير المطلوب') as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByRole('button', { name: 'إضافة أمر التغيير' })).toBeInTheDocument();
    expect(within(dialog).queryByText(/استشارات إضافية/)).not.toBeInTheDocument();
  });
});

describe('row actions', () => {
  it('deletes an order after confirmation', async () => {
    renderSection();
    const [deleteTrigger] = within(rowFor('تعديل مقترح')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteTrigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(actions.deleteChangeOrder).toHaveBeenCalledWith('co-proposed'));
  });

  it('shows a viewer the list and nothing that writes', () => {
    renderSection(true);
    expect(screen.queryByRole('button', { name: /أمر تغيير$/ })).not.toBeInTheDocument();
    expect(within(rowFor('تعديل مقترح')).queryAllByRole('button')).toHaveLength(0);
  });
});
