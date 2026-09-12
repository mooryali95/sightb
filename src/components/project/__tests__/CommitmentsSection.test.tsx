/**
 * Component tests for the commitments section, written before it is split.
 *
 * What costs money here: the committed, spent and available figures (active
 * commitments only), the overrun check before a new commitment is taken on,
 * the auto-completion of a fully spent one, and what an edit saves,
 * including a cleared field.
 *
 * Two tests were red when written: an edit sent `undefined` for a cleared
 * vendor, contract reference or note, which the store reads as "unchanged",
 * so a clear never reached the database; and cancelling an edit left the
 * next "new commitment" in edit mode, saving over the row being edited.
 * The fix commits that follow turn them green without editing a test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { Commitment } from '@/types/project';
import { CommitmentsSection } from '../CommitmentsSection';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PROJECT_ID = 'p-1';

function commitment(over: Partial<Commitment>): Commitment {
  return { id: 'c', projectId: PROJECT_ID, description: 'عقد', totalAmount: 0, spentAmount: 0, status: 'active', createdAt: '', ...over };
}

const commitments: Commitment[] = [
  commitment({ id: 'c-active', description: 'عقد توريد معدات', vendorName: 'شركة الأجهزة', contractRef: 'CT-1', totalAmount: 40000, spentAmount: 15000, notes: 'دفعة أولى مدفوعة' }),
  commitment({ id: 'c-done', description: 'عقد تصميم', totalAmount: 10000, spentAmount: 10000, status: 'completed' }),
  commitment({ id: 'c-cancelled', description: 'عقد ملغي', totalAmount: 50000, status: 'cancelled' }),
  commitment({ id: 'c-draft', description: 'عقد مسودة', totalAmount: 5000, status: 'draft' }),
];

const actions = {
  addCommitment: vi.fn().mockResolvedValue('c-new'),
  updateCommitment: vi.fn().mockResolvedValue(undefined),
  deleteCommitment: vi.fn().mockResolvedValue(undefined),
};

function renderSection(over: { readOnly?: boolean } = {}) {
  return render(<CommitmentsSection projectId={PROJECT_ID} commitments={commitments} totalPlanned={100000} readOnly={over.readOnly ?? false} />);
}

function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description, { selector: 'td' }).closest('tr');
  if (!row) throw new Error(`"${description}" is not in the table`);
  return row;
}

function openNewForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /التزام جديد/ }));
  return screen.getByRole('dialog');
}

function openEditForm(description: string): HTMLElement {
  fireEvent.click(within(rowFor(description)).getByRole('button', { name: 'تعديل' }));
  return screen.getByRole('dialog');
}

const descriptionInput = (dialog: HTMLElement) => within(dialog).getByPlaceholderText('مثال: عقد توريد معدات');
const amountInputs = (dialog: HTMLElement) => within(dialog).getAllByRole('spinbutton');

const confirmSpy = vi.spyOn(window, 'confirm');

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  confirmSpy.mockReset();
  useStore.setState({ ...actions } satisfies Partial<AppState>);
});
afterEach(() => confirmSpy.mockReset());

describe('the figures', () => {
  it('counts only active commitments in the committed, spent and available figures', () => {
    renderSection();
    expect(screen.getByText(/4 التزام · نشط: 40,000\.00 ر\.س · مصروف: 15,000\.00 ر\.س/)).toBeInTheDocument();
    expect(screen.getByText('إجمالي الالتزامات').nextElementSibling).toHaveTextContent('40,000.00 ر.س');
    expect(screen.getByText('المصروف', { selector: 'p' }).nextElementSibling).toHaveTextContent('15,000.00 ر.س');
    expect(screen.getByText('متبقي من الالتزامات').nextElementSibling).toHaveTextContent('25,000.00 ر.س');
    // 100,000 planned − 40,000 active; the completed, cancelled and draft ones do not bind the budget.
    expect(screen.getByText('المتاح من الموازنة').nextElementSibling).toHaveTextContent('60,000.00 ر.س');
  });

  it('lists every commitment with its remaining amount and status', () => {
    renderSection();
    const active = rowFor('عقد توريد معدات');
    expect(within(active).getByText('شركة الأجهزة')).toBeInTheDocument();
    expect(within(active).getByText('CT-1')).toBeInTheDocument();
    expect(within(active).getByText('25,000.00 ر.س')).toBeInTheDocument();
    expect(within(active).getByText('نشط')).toBeInTheDocument();
    expect(within(rowFor('عقد تصميم')).getByText('0.00 ر.س')).toBeInTheDocument();
    expect(within(rowFor('عقد ملغي')).getByText('ملغي')).toBeInTheDocument();
    expect(within(rowFor('عقد مسودة')).getByText('مسودة')).toBeInTheDocument();
  });
});

describe('adding a commitment', () => {
  it('asks before a commitment that overruns the budget, and stops on no', () => {
    confirmSpy.mockReturnValue(false);
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(descriptionInput(dialog), { target: { value: 'عقد كبير' } });
    fireEvent.change(amountInputs(dialog)[0], { target: { value: '70000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    // 40,000 active + 70,000 = 110,000 against 100,000 planned.
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('يتجاوز الميزانية بمقدار 10,000.00 ر.س'));
    expect(actions.addCommitment).not.toHaveBeenCalled();
  });

  it('adds it on yes, completed when already fully spent, with no empty text', async () => {
    confirmSpy.mockReturnValue(true);
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(descriptionInput(dialog), { target: { value: 'عقد كبير' } });
    fireEvent.change(within(dialog).getAllByPlaceholderText('اختياري')[0], { target: { value: ' ' } });
    fireEvent.change(amountInputs(dialog)[0], { target: { value: '70000' } });
    fireEvent.change(amountInputs(dialog)[1], { target: { value: '70000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addCommitment).toHaveBeenCalledTimes(1));
    expect(actions.addCommitment).toHaveBeenCalledWith({
      projectId: PROJECT_ID, description: 'عقد كبير', vendorName: undefined, contractRef: undefined,
      totalAmount: 70000, spentAmount: 70000, status: 'completed', notes: undefined,
    });
  });

  it('does not ask when the commitment fits, and refuses one with no amount', () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(descriptionInput(dialog), { target: { value: 'عقد صغير' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(actions.addCommitment).not.toHaveBeenCalled();
    fireEvent.change(amountInputs(dialog)[0], { target: { value: '60000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(actions.addCommitment).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 60000, status: 'active' }));
  });
});

describe('editing a commitment', () => {
  it('starts from the row and saves the cleared fields as cleared', async () => {
    renderSection();
    const dialog = openEditForm('عقد توريد معدات');
    expect(descriptionInput(dialog)).toHaveValue('عقد توريد معدات');
    expect(amountInputs(dialog)[0]).toHaveValue(40000);
    fireEvent.change(within(dialog).getByDisplayValue('شركة الأجهزة'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByDisplayValue('دفعة أولى مدفوعة'), { target: { value: '' } });
    fireEvent.change(amountInputs(dialog)[1], { target: { value: '20000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateCommitment).toHaveBeenCalledTimes(1));
    expect(actions.updateCommitment).toHaveBeenCalledWith('c-active', {
      description: 'عقد توريد معدات', vendorName: null, contractRef: 'CT-1',
      totalAmount: 40000, spentAmount: 20000, status: 'active', notes: null,
    });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('opens a blank "new commitment" after an edit is cancelled', () => {
    renderSection();
    const editing = openEditForm('عقد توريد معدات');
    fireEvent.click(within(editing).getByRole('button', { name: 'إلغاء' }));
    const dialog = openNewForm();
    expect(within(dialog).getByText('إضافة التزام')).toBeInTheDocument();
    expect(descriptionInput(dialog)).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'إضافة' })).toBeInTheDocument();
  });
});

describe('the inspector, deleting, and the read-only view', () => {
  it('opens the inspector with the remaining amount and the spend ratio', () => {
    renderSection();
    fireEvent.click(within(rowFor('عقد توريد معدات')).getByRole('button', { name: 'عرض التفاصيل' }));
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getByText('متبقي').nextElementSibling).toHaveTextContent('25,000.00 ر.س');
    expect(within(inspector).getByText('نسبة الصرف').nextElementSibling).toHaveTextContent('37.5%');
    expect(within(inspector).getByText('دفعة أولى مدفوعة')).toBeInTheDocument();
  });

  it('deletes a commitment after confirmation', async () => {
    renderSection();
    const [del] = within(rowFor('عقد مسودة')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(del);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(actions.deleteCommitment).toHaveBeenCalledWith('c-draft'));
  });

  it('shows a viewer the details control and nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /التزام جديد/ })).not.toBeInTheDocument();
    expect(within(rowFor('عقد توريد معدات')).getAllByRole('button')).toHaveLength(1);
  });
});
