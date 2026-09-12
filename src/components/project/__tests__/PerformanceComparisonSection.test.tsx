/**
 * Component tests for the performance comparison, written before it is
 * split. The comparison maths (planned by month, actual in a range,
 * severity) is unit-tested in budget-comparison.test.ts; these pin what
 * the section shows and does with it: the header figures, the groups and
 * their items, the search and the "deviated only" filter, the month range
 * and its reset, and the details dialog for a group and for an item.
 *
 * All green when written: the lib already counted neither rejected
 * expenses nor outstanding advances, and the section reads it faithfully.
 * The tests exist so the split that follows is proven, not assumed.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { BudgetItem, Expense } from '@/types/project';
import { PerformanceComparisonSection } from '../PerformanceComparisonSection';

const PROJECT_ID = 'p-1';

function item(over: Partial<BudgetItem>): BudgetItem {
  return { id: 'b', projectId: PROJECT_ID, category: 'salary', description: 'بند', plannedAmount: 0, costType: 'fixed', costClass: 'direct', ...over } as BudgetItem;
}

// A 12-month project that started long ago, so "the current month" is the
// last one whatever today's date is, and the default range covers it all.
const budgetItems: BudgetItem[] = [
  item({ id: 'b-salary', category: 'salary', description: 'رواتب الفريق', plannedAmount: 1000, costType: 'recurring', startMonth: 1, endMonth: 12 }),
  item({ id: 'b-travel', category: 'travel', description: 'تنقلات', plannedAmount: 6000, costType: 'fixed' }),
  item({ id: 'b-equipment', category: 'equipment', description: 'أجهزة', plannedAmount: 3000, costType: 'one_time', month: 3 }),
];

function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: PROJECT_ID, category: 'salary', description: 'مصروف', amount: 0, date: '2020-06-01', month: 6, approvalStatus: 'approved', isVatExempt: false, budgetItemId: 'b-salary', ...over };
}

const expenses: Expense[] = [
  expense({ id: 'e-salary', amount: 11000, description: 'رواتب حتى يونيو' }),
  expense({ id: 'e-rejected', amount: 2000, description: 'مكافأة مرفوضة', approvalStatus: 'rejected' }),
  expense({ id: 'e-advance', amount: 1000, description: 'سلفة قائمة', isOutstandingAdvance: true }),
  expense({ id: 'e-travel', amount: 5900, category: 'travel', description: 'تذاكر', budgetItemId: 'b-travel', date: '2020-02-10', month: 2 }),
  expense({ id: 'e-equipment', amount: 3600, category: 'equipment', description: 'حاسوب', budgetItemId: 'b-equipment', date: '2020-03-05', month: 3 }),
];

function renderSection(items = budgetItems) {
  return render(
    <TooltipProvider>
      <PerformanceComparisonSection budgetItems={items} expenses={expenses} durationMonths={12} startDate="2020-01-01" currency="SAR" />
    </TooltipProvider>,
  );
}

/** The header card with this title (the group rows carry the same labels as metrics). */
function statCard(title: string): HTMLElement {
  const card = screen.getAllByText(title).map((el) => el.closest('.stat-card')).find(Boolean);
  if (!card) throw new Error(`no stat card titled "${title}"`);
  return card as HTMLElement;
}

/** The group rows, in display order, by their label. */
function groupLabels(): string[] {
  return screen.getAllByText(/بند$/, { selector: '.text-\\[10px\\]' }).map((b) => b.previousElementSibling?.textContent ?? '');
}

function groupRow(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'span.font-semibold' }).closest('.rounded-lg') as HTMLElement;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(shown: string, option: RegExp) {
  const trigger = screen.getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

describe('the figures', () => {
  it('shows the budget, the planned and actual for the range, and the variance', () => {
    renderSection();
    // BAC: 12 × 1,000 + 6,000 + 3,000. Actual: 11,000 + 5,900 + 3,600; the rejected 2,000 and the outstanding 1,000 do not count.
    expect(statCard('إجمالي الموازنة (BAC)')).toHaveTextContent('21,000.00 ر.س');
    expect(statCard('المخطط للفترة')).toHaveTextContent('21,000.00 ر.س');
    expect(statCard('المخطط للفترة')).toHaveTextContent('الأشهر 1–12');
    expect(statCard('الفعلي للفترة')).toHaveTextContent('20,500.00 ر.س');
    expect(statCard('الانحراف للفترة')).toHaveTextContent('−500.00 ر.س');
    expect(statCard('الانحراف للفترة')).toHaveTextContent('2.4%');
  });

  it('groups by category, largest budget first, with each variance and severity', () => {
    renderSection();
    expect(groupLabels()).toEqual(['رواتب موظفين', 'سفر وتنقل', 'معدات وأجهزة']);
    // 11,000 against 12,000 planned: 8.3% under, a warning.
    expect(within(groupRow('رواتب موظفين')).getByText('−1,000.00 ر.س')).toHaveClass('health-warning');
    // 5,900 against 6,000: within 5%.
    expect(within(groupRow('سفر وتنقل')).getByText('−100.00 ر.س')).toHaveClass('health-good');
    // 3,600 against 3,000: 20% over, critical.
    expect(within(groupRow('معدات وأجهزة')).getByText('+600.00 ر.س')).toHaveClass('health-critical');
    expect(within(groupRow('رواتب موظفين')).getByText(/نسبة الاستهلاك من BAC 91\.7%/)).toBeInTheDocument();
  });

  it('shows nothing but a hint when there are no budget items', () => {
    renderSection([]);
    expect(screen.getByText(/لا توجد بنود موازنة لعرض المقارنة/)).toBeInTheDocument();
  });
});

describe('opening, searching and filtering', () => {
  it('expands a group to its items, and opens or folds them all', async () => {
    renderSection();
    expect(screen.queryByText('رواتب الفريق')).not.toBeInTheDocument();
    fireEvent.click(within(groupRow('رواتب موظفين')).getByRole('button', { name: /رواتب موظفين/ }));
    expect(screen.getByText('رواتب الفريق')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'فتح الكل' }));
    expect(screen.getByText('تنقلات')).toBeInTheDocument();
    expect(screen.getByText('أجهزة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'طي الكل' }));
    // The fold animates out before the rows leave the document.
    await waitFor(() => expect(screen.queryByText('تنقلات')).not.toBeInTheDocument());
  });

  it('narrows by text and says when nothing matches', () => {
    renderSection();
    fireEvent.change(screen.getByPlaceholderText('ابحث عن فئة أو بند…'), { target: { value: 'أجهزة' } });
    expect(groupLabels()).toEqual(['معدات وأجهزة']);
    fireEvent.change(screen.getByPlaceholderText('ابحث عن فئة أو بند…'), { target: { value: 'لا شيء' } });
    expect(screen.getByText(/لا نتائج مطابقة/)).toBeInTheDocument();
    // The header keeps the whole project's figures whatever the search.
    expect(statCard('الفعلي للفترة')).toHaveTextContent('20,500.00 ر.س');
  });

  it('shows only the deviated items on request', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /المنحرف فقط/ }));
    expect(groupLabels()).toEqual(['رواتب موظفين', 'معدات وأجهزة']);
    fireEvent.click(screen.getByRole('button', { name: /إظهار الكل/ }));
    expect(groupLabels()).toHaveLength(3);
  });

  it('recomputes the range when its end moves, and offers the default back', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: /استعادة الافتراضي/ })).not.toBeInTheDocument();
    pick('الشهر 12', /^الشهر 2$/);
    // Months 1–2: 2,000 of salary and 1,000 of travel planned; only the February 5,900 spent.
    expect(statCard('المخطط للفترة')).toHaveTextContent('3,000.00 ر.س');
    expect(statCard('المخطط للفترة')).toHaveTextContent('الأشهر 1–2');
    expect(statCard('الفعلي للفترة')).toHaveTextContent('5,900.00 ر.س');
    fireEvent.click(screen.getByRole('button', { name: 'استعادة الافتراضي (1 — 12)' }));
    expect(statCard('المخطط للفترة')).toHaveTextContent('21,000.00 ر.س');
  });
});

describe('the details dialog', () => {
  it('opens a group with its items and the counted expenses in the range', () => {
    renderSection();
    fireEvent.click(within(groupRow('رواتب موظفين')).getByRole('button', { name: /تفاصيل/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('الفئة • 1 بند فرعي • الفترة: الشهر 1 إلى 12')).toBeInTheDocument();
    expect(within(dialog).getByText('المصروفات الفعلية المربوطة (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('إجمالي: 11,000.00 ر.س')).toBeInTheDocument();
    expect(within(dialog).getByText('رواتب حتى يونيو')).toBeInTheDocument();
    expect(within(dialog).queryByText('مكافأة مرفوضة')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('سلفة قائمة')).not.toBeInTheDocument();
  });

  it('opens an item on its own', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'فتح الكل' }));
    fireEvent.click(screen.getByRole('button', { name: /تذاكر|تنقلات/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('بند ضمن سفر وتنقل • الفترة: الشهر 1 إلى 12')).toBeInTheDocument();
    expect(within(dialog).getByText('تذاكر')).toBeInTheDocument();
    expect(within(dialog).getByText('إجمالي: 5,900.00 ر.س')).toBeInTheDocument();
  });
});
