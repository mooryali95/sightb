/**
 * Component tests for the monthly budget plan, written before it is split.
 * The rows come from getMonthlyBudgetPlan (unit-tested in
 * lib/__tests__/monthly-plan.test.ts); what is tested here is the summary
 * strip, the two views, and that each shows the row it should.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { BudgetItem, Expense, Revenue } from '@/types/project';
import { MonthlyBudgetPlan } from '../MonthlyBudgetPlan';

const budgetItems: BudgetItem[] = [
  { id: 'b1', projectId: 'p', category: 'salary', description: 'رواتب', plannedAmount: 1000, costType: 'recurring', costClass: 'direct', startMonth: 1, endMonth: 4 } as BudgetItem,
  { id: 'b2', projectId: 'p', category: 'equipment', description: 'أجهزة', plannedAmount: 500, costType: 'one_time', costClass: 'direct', month: 2 } as BudgetItem,
];
const expense = (over: Partial<Expense>): Expense =>
  ({ id: 'e', projectId: 'p', category: 'salary', description: 'مصروف', amount: 0, date: '2020-01-05', month: 1, approvalStatus: 'approved', isVatExempt: false, ...over });
// Month 1 on plan, month 2 over, month 3 near the limit, month 4 untouched.
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 600, month: 1 }),
  expense({ id: 'e2', amount: 1800, month: 2 }),
  expense({ id: 'e3', amount: 900, month: 3 }),
  expense({ id: 'x', amount: 5000, month: 1, approvalStatus: 'rejected' }),
];
const revenues: Revenue[] = [
  { id: 'r1', projectId: 'p', description: 'دفعة', amount: 2000, date: '2020-02-01', month: 2, revenueType: 'milestone', status: 'collected' },
];

function renderPlan() {
  // Started long ago, so every month has elapsed and none is "future".
  return render(<MonthlyBudgetPlan budgetItems={budgetItems} expenses={expenses} revenues={revenues} durationMonths={4} startDate="2020-01-01" currency="SAR" />);
}

const tile = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling as HTMLElement;

describe('the summary strip', () => {
  it('totals the plan and the counted spend, and counts the months on plan and over', () => {
    renderPlan();
    expect(tile('إجمالي مخطط')).toHaveTextContent('4,500.00 ر.س');
    expect(tile('إجمالي فعلي')).toHaveTextContent('3,300.00 ر.س');
    expect(tile('ضمن الخطة')).toHaveTextContent('2 شهر');
    expect(tile('تجاوزت')).toHaveTextContent('1 شهر');
  });

  it('renders nothing for a project with no duration', () => {
    const { container } = render(<MonthlyBudgetPlan budgetItems={[]} expenses={[]} revenues={[]} durationMonths={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the cards', () => {
  it('shows each month with its plan, spend, variance and utilisation', () => {
    renderPlan();
    const card = (n: number) => screen.getByText(`شهر ${n}`, { selector: 'span' }).closest('.rounded-lg') as HTMLElement;
    expect(card(2)).toHaveTextContent('1,500.00 ر.س');
    expect(card(2)).toHaveTextContent('1,800.00 ر.س');
    expect(card(2)).toHaveTextContent('-300.00 ر.س');
    expect(card(2)).toHaveTextContent('120%');
    expect(card(4)).toHaveTextContent('+1,000.00 ر.س');
    expect(card(4)).toHaveTextContent('0%');
    expect(card(4)).toHaveTextContent('●');
  });
});

describe('the table', () => {
  it('lists every month with its status and cash flow, and totals the columns', () => {
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: /جدول/ }));
    const rows = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent?.trim()));
    expect(rows).toHaveLength(5);
    expect(rows[0].slice(0, 5)).toEqual(['شهر 1', 'ضمن الخطة', '1,000.00 ر.س', '600.00 ر.س', '+400.00 ر.س']);
    expect(rows[1][1]).toBe('تجاوز');
    expect(rows[1][6]).toBe('2,000.00 ر.س');
    expect(rows[1][7]).toBe('200.00 ر.س');
    expect(rows[2][1]).toBe('قرب الحد');
    expect(rows[2][8]).toBe('3,300.00 ر.س');
    expect(rows[4].slice(0, 6)).toEqual(['الإجمالي', '—', '4,500.00 ر.س', '3,300.00 ر.س', '1,200.00 ر.س', '73.3%']);
    expect(rows[4][7]).toBe('-1,300.00 ر.س');
  });
});
