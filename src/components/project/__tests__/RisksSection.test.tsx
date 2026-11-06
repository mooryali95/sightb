/**
 * Component tests for the risks section, written before it is split.
 *
 * What costs money here is the exposure line: which risks count as open
 * (open and mitigating, not closed or occurred) and what a risk carries
 * when it is saved, including a cleared field on an edit.
 *
 * One test was red when written: cancelling an edit closed the form
 * without resetting it, so the next "new risk" opened in edit mode and
 * would have saved over the row that was being edited. The fix commit that
 * follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Risk } from '@/types/project';
import { RisksSection } from '../RisksSection';
import { flushPendingDeletes } from '@/lib/undo-delete';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PROJECT_ID = 'p-1';

function risk(over: Partial<Risk>): Risk {
  return {
    id: 'r', projectId: PROJECT_ID, title: 'خطر', probability: 'medium', impact: 'medium', financialImpact: 0,
    category: 'financial', status: 'open', createdAt: '2026-03-01T00:00:00Z', ...over,
  };
}

const risks: Risk[] = [
  risk({ id: 'r-open', title: 'تأخر التوريد', description: 'المورد الرئيسي', probability: 'high', impact: 'high', financialImpact: 50000, owner: 'سارة', mitigationPlan: 'مورد بديل' }),
  risk({ id: 'r-mitigating', title: 'نقص الكوادر', category: 'resource', status: 'mitigating', financialImpact: 20000 }),
  risk({ id: 'r-closed', title: 'تقلب العملة', status: 'closed', financialImpact: 30000 }),
  risk({ id: 'r-occurred', title: 'انقطاع الخدمة', category: 'external', status: 'occurred', financialImpact: 10000 }),
];

const actions = {
  addRisk: vi.fn().mockResolvedValue('r-new'),
  updateRisk: vi.fn().mockResolvedValue(undefined),
  deleteRisk: vi.fn().mockResolvedValue(undefined),
};

function renderSection(over: { readOnly?: boolean; portfolioId?: string } = {}) {
  return render(
    over.portfolioId
      ? <RisksSection portfolioId={over.portfolioId} risks={risks} />
      : <RisksSection projectId={PROJECT_ID} risks={risks} readOnly={over.readOnly ?? false} />,
  );
}

function rowFor(title: string): HTMLElement {
  const row = screen.getByText(title, { selector: 'td' }).closest('tr');
  if (!row) throw new Error(`"${title}" is not in the table`);
  return row;
}

function openNewForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /إضافة خطر/ }));
  return screen.getByRole('dialog');
}

function openEditForm(title: string): HTMLElement {
  fireEvent.click(within(rowFor(title)).getByRole('button', { name: 'تعديل' }));
  return screen.getByRole('dialog');
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(dialog: HTMLElement, shown: string, option: RegExp) {
  const trigger = within(dialog).getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

const titleInput = (dialog: HTMLElement) => within(dialog).getByPlaceholderText('وصف مختصر للخطر');

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  vi.mocked(toast.error).mockClear();
  useStore.setState({ ...actions } satisfies Partial<AppState>);
});

describe('the figures', () => {
  it('counts open and mitigating risks and sums their exposure', () => {
    renderSection();
    expect(screen.getByText('مخاطر مفتوحة').nextElementSibling).toHaveTextContent('2');
    // 50,000 + 20,000; the closed 30,000 and the occurred 10,000 do not count.
    expect(screen.getByText('إجمالي التعرض المالي').nextElementSibling).toHaveTextContent('70,000.00 ر.س');
  });

  it('lists every risk with its labels', () => {
    renderSection();
    const open = rowFor('تأخر التوريد');
    expect(within(open).getAllByText('مرتفع')).toHaveLength(2);
    expect(within(open).getByText('50,000.00 ر.س')).toBeInTheDocument();
    expect(within(open).getByText('مالي')).toBeInTheDocument();
    expect(within(open).getByText('مفتوح')).toBeInTheDocument();
    expect(within(open).getByText('سارة')).toBeInTheDocument();
    expect(within(rowFor('نقص الكوادر')).getByText('قيد المعالجة')).toBeInTheDocument();
    expect(within(rowFor('تقلب العملة')).getByText('مغلق')).toBeInTheDocument();
    expect(within(rowFor('انقطاع الخدمة')).getByText('وقع')).toBeInTheDocument();
  });
});

describe('adding a risk', () => {
  it('adds it to the project with its category and the defaults, and no empty text', async () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.change(titleInput(dialog), { target: { value: 'تغيّر اللوائح' } });
    pick(dialog, 'مالي', /زمني/);
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '15000' } });
    fireEvent.change(within(dialog).getByPlaceholderText('اسم المسؤول'), { target: { value: '  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addRisk).toHaveBeenCalledTimes(1));
    expect(actions.addRisk).toHaveBeenCalledWith({
      projectId: PROJECT_ID, portfolioId: undefined, title: 'تغيّر اللوائح', description: undefined,
      probability: 'medium', impact: 'medium', financialImpact: 15000, category: 'schedule', status: 'open',
      mitigationPlan: undefined, owner: undefined,
    });
  });

  it('adds a portfolio risk to the portfolio, not to a project', async () => {
    renderSection({ portfolioId: 'pf-1' });
    const dialog = openNewForm();
    fireEvent.change(titleInput(dialog), { target: { value: 'خطر محفظة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(actions.addRisk).toHaveBeenCalledWith(expect.objectContaining({ projectId: undefined, portfolioId: 'pf-1' })));
  });

  it('refuses a risk with no title and says so', () => {
    renderSection();
    const dialog = openNewForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    expect(actions.addRisk).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('العنوان مطلوب');
  });
});

describe('editing a risk', () => {
  it('starts from the row and saves the cleared fields as cleared', async () => {
    renderSection();
    const dialog = openEditForm('تأخر التوريد');
    expect(titleInput(dialog)).toHaveValue('تأخر التوريد');
    expect(within(dialog).getByRole('spinbutton')).toHaveValue(50000);
    fireEvent.change(within(dialog).getByDisplayValue('المورد الرئيسي'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByDisplayValue('سارة'), { target: { value: '' } });
    pick(dialog, 'مفتوح', /قيد المعالجة/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'تحديث' }));

    await waitFor(() => expect(actions.updateRisk).toHaveBeenCalledTimes(1));
    expect(actions.updateRisk).toHaveBeenCalledWith('r-open', {
      title: 'تأخر التوريد', description: null, probability: 'high', impact: 'high', financialImpact: 50000,
      category: 'financial', status: 'mitigating', mitigationPlan: 'مورد بديل', owner: null,
    });
  });

  it('opens a blank "new risk" after an edit is cancelled', () => {
    renderSection();
    const editing = openEditForm('تأخر التوريد');
    fireEvent.click(within(editing).getByRole('button', { name: 'إلغاء' }));
    const dialog = openNewForm();
    expect(within(dialog).getByText('إضافة خطر جديد')).toBeInTheDocument();
    expect(titleInput(dialog)).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'إضافة' })).toBeInTheDocument();
  });
});

describe('deleting and the read-only view', () => {
  it('deletes a risk without a dialog, once the undo window passes', async () => {
    renderSection();
    const [del] = within(rowFor('تقلب العملة')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(del);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(actions.deleteRisk).not.toHaveBeenCalled();
    await act(async () => { await flushPendingDeletes(); });
    await waitFor(() => expect(actions.deleteRisk).toHaveBeenCalledWith('r-closed', expect.objectContaining({ id: 'r-closed' })));
  });

  it('shows a viewer the table with nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /إضافة خطر/ })).not.toBeInTheDocument();
    expect(within(rowFor('تأخر التوريد')).queryAllByRole('button')).toHaveLength(0);
  });
});
