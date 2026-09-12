/**
 * Component tests for the revenue section, written before it is split.
 *
 * What costs money here: the four cards at the top (planned, invoiced,
 * collected, and what is still uncollected), the VAT arithmetic on the way
 * in and on every row, and what an edit sends to the store.
 *
 * Three tests were red when written. The uncollected card subtracted the
 * collected total from the invoiced one, although the two statuses never
 * overlap, so once more had been collected than was outstanding the card
 * read zero while the summary library reported the invoiced amount as the
 * receivable. And an edit sent `undefined` for a milestone link removed or
 * an invoice field the new status hides, which the store reads as "leave it
 * alone", so a revenue put back to planned kept its collection date. The
 * fix commit that follows turns them green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { Revenue } from '@/types/project';
import { RevenueSection } from '../RevenueSection';
import { MILESTONE_ID, PROJECT_ID, milestone, revenues } from './revenue-fixtures';

const actions = {
  addRevenue: vi.fn().mockResolvedValue('new-revenue-id'),
  updateRevenue: vi.fn().mockResolvedValue(undefined),
  deleteRevenue: vi.fn().mockResolvedValue(undefined),
};

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}));

interface RenderOptions {
  rows?: Revenue[];
  readOnly?: boolean;
  taxPercent?: number;
  withMilestones?: boolean;
}

function renderSection({ rows = revenues, readOnly = false, taxPercent = 15, withMilestones = true }: RenderOptions = {}) {
  const { container } = render(
    <RevenueSection
      projectId={PROJECT_ID}
      revenues={rows}
      durationMonths={6}
      readOnly={readOnly}
      taxPercent={taxPercent}
      milestones={withMilestones ? [milestone] : undefined}
    />,
  );
  return container;
}

/** The table row a revenue's description sits in. */
function rowFor(description: string): HTMLElement {
  const row = screen.getByText(description).closest('tr');
  if (!row) throw new Error(`"${description}" is not in the table`);
  return row;
}

/** The figure under a summary card's label. The labels also appear as status badges in the table. */
function cardFigure(label: string): string | undefined {
  const cardLabel = screen.getAllByText(label).find((el) => el.parentElement?.classList.contains('text-center'));
  return cardLabel?.nextElementSibling?.textContent ?? undefined;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(scope: HTMLElement, shown: string | RegExp, option: RegExp) {
  const trigger = within(scope).getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

function openAddForm(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /إضافة إيراد/ }));
  return screen.getByRole('dialog');
}

function openEditForm(description: string): HTMLElement {
  const [edit] = within(rowFor(description)).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-pencil'));
  fireEvent.click(edit);
  return screen.getByRole('dialog');
}

function fillDescriptionAndAmount(dialog: HTMLElement, description: string, amount: string) {
  fireEvent.change(within(dialog).getByPlaceholderText(/دفعة أولى من العميل/), { target: { value: description } });
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: amount } });
}

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockClear());
  useStore.setState({ ...actions } satisfies Partial<AppState>);
});

describe('the figures at the top', () => {
  it('totals every revenue and adds the project VAT to it', () => {
    renderSection();
    // 10,000 + 20,000 + 30,000 + 5,000 = 65,000; at 15% that is 74,750 inclusive.
    expect(screen.getByText(/الإجمالي: 65,000\.00 ر\.س · شامل الضريبة \(15%\): 74,750\.00 ر\.س/)).toBeInTheDocument();
  });

  it('splits the total by status on the cards', () => {
    renderSection();
    expect(cardFigure('مخطط')).toBe('10,000.00 ر.س');
    expect(cardFigure('مُفوتر')).toBe('20,000.00 ر.س');
    expect(cardFigure('محصّل')).toBe('35,000.00 ر.س');
  });

  it('reports what was invoiced and not yet collected as uncollected', () => {
    renderSection();
    // The 20,000 invoice is the receivable, as the summary library says.
    // Subtracting the 35,000 collected from it would read zero.
    expect(cardFigure('غير محصّل')).toBe('20,000.00 ر.س');
  });

  it('shows the VAT and the inclusive amount on every row when the project has VAT', () => {
    renderSection();
    const row = rowFor('فاتورة المرحلة الأولى');
    expect(within(row).getByText('3,000.00 ر.س')).toBeInTheDocument();
    expect(within(row).getByText('23,000.00 ر.س')).toBeInTheDocument();
  });

  it('hides the VAT columns and the inclusive total when the project has none', () => {
    renderSection({ taxPercent: 0 });
    expect(screen.queryByText(/شامل الضريبة/)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'الضريبة' })).not.toBeInTheDocument();
  });

  it('names the milestone a revenue is linked to', () => {
    renderSection();
    expect(within(rowFor('دفعة تسليم التصميم')).getByText('تسليم التصميم')).toBeInTheDocument();
    expect(within(rowFor('الدفعة المقدمة')).getByText('—')).toBeInTheDocument();
  });
});

describe('finding a revenue', () => {
  it('narrows the table by description and says how many matched', () => {
    renderSection();
    fireEvent.change(screen.getByPlaceholderText('بحث بالوصف...'), { target: { value: 'المرحلة' } });
    expect(screen.getByText('فاتورة المرحلة الأولى')).toBeInTheDocument();
    expect(screen.queryByText('الدفعة المقدمة')).not.toBeInTheDocument();
    expect(screen.getByText('(1 نتيجة)')).toBeInTheDocument();
  });

  it('narrows the table by status', () => {
    const container = renderSection();
    pick(container, 'كل الحالات', /^محصّل$/);
    expect(screen.getByText('الدفعة المقدمة')).toBeInTheDocument();
    expect(screen.getByText('دفعة تسليم التصميم')).toBeInTheDocument();
    expect(screen.queryByText('دفعة ختامية مخططة')).not.toBeInTheDocument();
    expect(screen.getByText('(2 نتيجة)')).toBeInTheDocument();
  });
});

describe('adding a revenue', () => {
  it('records it as collected in the first month with the net amount', async () => {
    renderSection();
    const dialog = openAddForm();
    fillDescriptionAndAmount(dialog, 'دفعة جديدة', '1000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addRevenue).toHaveBeenCalledTimes(1));
    expect(actions.addRevenue).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      description: 'دفعة جديدة',
      amount: 1000,
      month: 1,
      revenueType: 'milestone',
      status: 'collected',
    }));
  });

  it('strips VAT when the amount typed includes it', async () => {
    renderSection();
    const dialog = openAddForm();
    fillDescriptionAndAmount(dialog, 'دفعة شاملة', '1150');
    fireEvent.click(within(dialog).getByLabelText(/المبلغ شامل الضريبة/));

    // The preview and the wire must agree: 1,150 inclusive is 1,000 net.
    expect(within(dialog).getByText(/بدون ضريبة: 1,000\.00 ر\.س/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addRevenue).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000 })));
  });

  it('links it to the chosen milestone', async () => {
    renderSection();
    const dialog = openAddForm();
    fillDescriptionAndAmount(dialog, 'دفعة مرحلة', '2000');
    pick(dialog, 'بدون ربط', /تسليم التصميم/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await waitFor(() => expect(actions.addRevenue).toHaveBeenCalledWith(expect.objectContaining({ milestoneId: MILESTONE_ID })));
  });

  it('refuses a revenue with no description', async () => {
    renderSection();
    const dialog = openAddForm();
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '1000' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'إضافة' }));

    await new Promise((r) => setTimeout(r, 0));
    expect(actions.addRevenue).not.toHaveBeenCalled();
  });
});

describe('editing a revenue', () => {
  it('opens on the row\'s values and saves the changed amount with the invoice kept', async () => {
    renderSection();
    const dialog = openEditForm('فاتورة المرحلة الأولى');

    expect((within(dialog).getByPlaceholderText(/دفعة أولى من العميل/) as HTMLInputElement).value).toBe('فاتورة المرحلة الأولى');
    expect((within(dialog).getByRole('spinbutton') as HTMLInputElement).value).toBe('20000');
    expect((within(dialog).getByPlaceholderText('INV-001') as HTMLInputElement).value).toBe('INV-1');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '21000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateRevenue).toHaveBeenCalledTimes(1));
    expect(actions.updateRevenue).toHaveBeenCalledWith('rev-invoiced', expect.objectContaining({
      amount: 21000,
      status: 'invoiced',
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-03-01',
    }));
  });

  it('clears the invoice and collection fields when the revenue goes back to planned', async () => {
    renderSection();
    const dialog = openEditForm('الدفعة المقدمة');
    pick(dialog, 'محصّل', /^مخطط$/);
    expect(within(dialog).queryByPlaceholderText('INV-001')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    // The form hides these fields for a planned revenue, so the row must not
    // keep a collection date the user can no longer see or remove.
    await waitFor(() => expect(actions.updateRevenue).toHaveBeenCalledWith('rev-collected', expect.objectContaining({
      status: 'planned',
      invoiceNumber: null,
      invoiceDate: null,
      collectionDate: null,
    })));
  });

  it('removes the milestone link when "بدون ربط" is chosen', async () => {
    renderSection();
    const dialog = openEditForm('دفعة تسليم التصميم');
    pick(dialog, /تسليم التصميم/, /^بدون ربط$/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }));

    await waitFor(() => expect(actions.updateRevenue).toHaveBeenCalledWith('rev-linked', expect.objectContaining({ milestoneId: null })));
  });

  it('starts blank when adding right after editing', () => {
    renderSection();
    const editDialog = openEditForm('الدفعة المقدمة');
    fireEvent.click(within(editDialog).getByRole('button', { name: 'إلغاء' }));

    const addDialog = openAddForm();
    expect((within(addDialog).getByPlaceholderText(/دفعة أولى من العميل/) as HTMLInputElement).value).toBe('');
    expect(within(addDialog).getByRole('button', { name: 'إضافة' })).toBeInTheDocument();
  });
});

describe('row actions and the inspector', () => {
  it('deletes a row after confirmation', async () => {
    renderSection();
    const [deleteTrigger] = within(rowFor('دفعة ختامية مخططة')).getAllByRole('button').filter((b) => b.querySelector('svg.lucide-trash2'));
    fireEvent.click(deleteTrigger);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'حذف' }));

    await waitFor(() => expect(actions.deleteRevenue).toHaveBeenCalledWith('rev-planned'));
  });

  it('opens the inspector on a row and hands over to the edit form from it', () => {
    renderSection();
    fireEvent.click(within(rowFor('فاتورة المرحلة الأولى')).getByTitle('عرض التفاصيل'));
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getByText('INV-1')).toBeInTheDocument();
    expect(within(inspector).getByText(/ضريبة 15%/)).toBeInTheDocument();

    fireEvent.click(within(inspector).getByRole('button', { name: /تعديل/ }));

    const form = screen.getByRole('dialog');
    expect((within(form).getByPlaceholderText(/دفعة أولى من العميل/) as HTMLInputElement).value).toBe('فاتورة المرحلة الأولى');
  });

  it('shows the linked milestone and its weight in the inspector', () => {
    renderSection();
    fireEvent.click(within(rowFor('دفعة تسليم التصميم')).getByTitle('عرض التفاصيل'));
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getByText('التسليمة المرتبطة')).toBeInTheDocument();
    expect(within(inspector).getByText('30%')).toBeInTheDocument();
  });

  it('shows a read-only viewer the details control and nothing that writes', () => {
    renderSection({ readOnly: true });
    expect(screen.queryByRole('button', { name: /إضافة إيراد/ })).not.toBeInTheDocument();
    expect(within(rowFor('دفعة ختامية مخططة')).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getAllByTitle('عرض التفاصيل')[0]);
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument();
  });
});
