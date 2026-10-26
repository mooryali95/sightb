/**
 * Component tests for the resources section, written before it is split.
 *
 * What costs money here: what each resource is shown to have spent against
 * its plan (the variance and the spend ratio follow from it), the plan
 * estimated for a resource with no budget item yet, and the budget item the
 * section offers to create when a resource is added.
 *
 * Two tests were red when written, one per view. The spend against a resource summed every
 * expense linked to it, rejected ones and outstanding advances included,
 * while the expenses section and every summary count neither, so the same
 * resource read as over budget here and within it there. The fix commit
 * that follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetItem, Expense, Resource } from '@/types/project';
import { ResourcesSection } from '../ResourcesSection';

// The registry is empty here, so the name fields stay plain inputs.
vi.mock('@/hooks/useParties', () => ({ useParties: () => ({ data: [], isSuccess: true }) }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PROJECT_ID = 'p-1';

const resources: Resource[] = [
  { id: 'res-planned', projectId: PROJECT_ID, name: 'سالم', role: 'مهندس', monthlyCost: 10000, createdAt: '' },
  { id: 'res-estimated', projectId: PROJECT_ID, name: 'ليلى', role: 'مصمّمة', monthlyCost: 5000, createdAt: '' },
];

const budgetItems: BudgetItem[] = [
  { id: 'b-salem', projectId: PROJECT_ID, category: 'salary', description: 'سالم — مهندس', plannedAmount: 30000, costType: 'fixed', costClass: 'direct', resourceId: 'res-planned' } as BudgetItem,
];

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'e', projectId: PROJECT_ID, category: 'salary', description: 'راتب', amount: 0, date: '2026-02-01', month: 2,
    approvalStatus: 'approved', isVatExempt: false, resourceId: 'res-planned', ...over,
  };
}

const expenses: Expense[] = [
  expense({ id: 'ok', amount: 7000, description: 'راتب فبراير' }),
  expense({ id: 'rejected', amount: 3000, description: 'مكافأة مرفوضة', approvalStatus: 'rejected' }),
  expense({ id: 'advance', amount: 2000, description: 'سلفة قائمة', isOutstandingAdvance: true }),
  expense({ id: 'leila', amount: 1500, description: 'تصميم', resourceId: 'res-estimated' }),
];

const actions = {
  addResource: vi.fn().mockResolvedValue('res-new'),
  updateResource: vi.fn().mockResolvedValue(undefined),
  deleteResource: vi.fn().mockResolvedValue(undefined),
  addBudgetItem: vi.fn().mockResolvedValue('b-new'),
};

function renderSection(over: { readOnly?: boolean; durationMonths?: number; items?: BudgetItem[]; people?: Resource[] } = {}) {
  return render(
    <ResourcesSection
      projectId={PROJECT_ID} resources={over.people ?? resources} budgetItems={over.items ?? budgetItems} expenses={expenses}
      readOnly={over.readOnly ?? false} durationMonths={over.durationMonths ?? 6}
    />,
  );
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name, { selector: 'td' }).closest('tr');
  if (!row) throw new Error(`"${name}" is not in the table`);
  return row;
}

function openAddForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /إضافة مورد/ }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  useStore.setState({ expenses: [], ...actions } satisfies Partial<AppState>);
});

describe('the figures', () => {
  it('totals the monthly cost in the header', () => {
    renderSection();
    expect(screen.getByText(/2 مورد · التكلفة الشهرية: 15,000\.00 ر\.س/)).toBeInTheDocument();
  });

  it('charges a resource only with the spend the summaries count', () => {
    renderSection();
    const row = rowFor('سالم');
    // 7,000 approved; the rejected 3,000 and the outstanding 2,000 advance are not spend.
    expect(within(row).getByText('7,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('23,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('23%')).toBeInTheDocument();
  });

  it('estimates the plan of a resource with no budget item from its monthly cost, and says so', () => {
    renderSection();
    const row = rowFor('ليلى');
    // 5,000 × 6 months, marked as an estimate.
    expect(within(row).getByText('30,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('*')).toBeInTheDocument();
    expect(screen.getByText(/تقديري = التكلفة الشهرية × مدة المشروع/)).toBeInTheDocument();
  });

  it('flags spend with no plan behind it', () => {
    // A volunteer: no monthly cost, no budget item, yet an expense charged to them.
    const volunteer: Resource = { id: 'res-estimated', projectId: PROJECT_ID, name: 'ليلى', role: 'متطوعة', monthlyCost: 0, createdAt: '' };
    renderSection({ people: [volunteer], items: [] });
    expect(within(rowFor('ليلى')).getByText('صرف بدون خطة')).toBeInTheDocument();
  });
});

describe('adding and editing a resource', () => {
  it('adds the resource, then offers a recurring salary item over the project and creates it on yes', async () => {
    renderSection();
    const dialog = openAddForm();
    fireEvent.change(within(dialog).getByPlaceholderText(/أحمد محمد/), { target: { value: 'نورة' } });
    fireEvent.change(within(dialog).getByPlaceholderText(/مدير مشروع/), { target: { value: 'محاسبة' } });
    fireEvent.change(within(dialog).getByPlaceholderText('0'), { target: { value: '8000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addResource).toHaveBeenCalledWith({ projectId: PROJECT_ID, name: 'نورة', role: 'محاسبة', monthlyCost: 8000 }));
    const prompt = await screen.findByText('إنشاء بند موازنة؟');
    expect(prompt.closest('[role="dialog"]')).toHaveTextContent('8,000.00 ر.س × 6 شهر = 48,000.00 ر.س');
    fireEvent.click(screen.getByRole('button', { name: /نعم — أنشئ البند/ }));

    await waitFor(() => expect(actions.addBudgetItem).toHaveBeenCalledWith({
      projectId: PROJECT_ID, category: 'salary', description: 'نورة — محاسبة', plannedAmount: 8000,
      costType: 'recurring', costClass: 'direct', startMonth: 1, endMonth: 6, resourceId: 'res-new',
    }));
  });

  it('does not offer a budget item for a resource with no cost, and none on an edit', async () => {
    renderSection();
    const dialog = openAddForm();
    fireEvent.change(within(dialog).getByPlaceholderText(/أحمد محمد/), { target: { value: 'متطوّع' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(actions.addResource).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('إنشاء بند موازنة؟')).not.toBeInTheDocument();

    const [edit] = within(rowFor('سالم')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
    fireEvent.click(edit);
    const editDialog = screen.getByRole('dialog');
    expect((within(editDialog).getByPlaceholderText('0') as HTMLInputElement).value).toBe('10000');
    fireEvent.change(within(editDialog).getByPlaceholderText('0'), { target: { value: '12000' } });
    fireEvent.click(within(editDialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateResource).toHaveBeenCalledWith('res-planned', { name: 'سالم', role: 'مهندس', monthlyCost: 12000 }));
    expect(screen.queryByText('إنشاء بند موازنة؟')).not.toBeInTheDocument();
  });

  it('refuses a resource with no name', async () => {
    renderSection();
    const dialog = openAddForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(actions.addResource).not.toHaveBeenCalled();
  });
});

describe('row actions and the inspector', () => {
  it('deletes a resource after confirmation', async () => {
    renderSection();
    const [deleteTrigger] = within(rowFor('ليلى')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteTrigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(actions.deleteResource).toHaveBeenCalledWith('res-estimated'));
  });

  it('opens the inspector with the counted spend and the linked expenses', () => {
    renderSection();
    fireEvent.click(within(rowFor('سالم')).getByTitle('عرض التفاصيل'));
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getByText('مصروف').nextElementSibling).toHaveTextContent('7,000.00 ر.س');
    expect(within(inspector).getByText('راتب فبراير')).toBeInTheDocument();
    expect(within(inspector).getByText(/بنود الموازنة المرتبطة/).nextElementSibling).toHaveTextContent('1');
  });

  it('shows a viewer the details control and nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /إضافة مورد/ })).not.toBeInTheDocument();
    expect(within(rowFor('سالم')).getAllByRole('button')).toHaveLength(1);
  });
});
