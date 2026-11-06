/**
 * Component tests for the notification bell, written before its
 * derivation is taken out. What is pinned: which findings become
 * notifications and at what severity, how they group and order, the
 * badge, dismissing one or all (remembered in local storage), and the
 * navigation a click performs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetItem, ChangeOrder, Expense, Milestone, PaymentRequest, Project, Risk } from '@/types/project';
import { SmartNotifications } from '../SmartNotifications';

// The popover and the scroll area measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: 'c', name: 'مشروع', contractValue: 100000, currency: 'SAR', startDate: '2026-01-01', endDate: '2099-12-31',
    durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 40, contractType: 'lump_sum',
    retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false, ...over,
  };
}
const projects: Project[] = [
  project({ id: 'p-over', name: 'مشروع متجاوز' }),
  project({ id: 'p-late', name: 'مشروع متأخر', endDate: '2020-01-01' }),
  project({ id: 'p-quiet', name: 'مشروع هادئ' }),
  project({ id: 'p-done', name: 'مشروع منتهي', status: 'completed', endDate: '2020-01-01' }),
];
const budgetItems: BudgetItem[] = [
  { id: 'b1', projectId: 'p-over', category: 'salary', description: 'رواتب', plannedAmount: 10000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
  { id: 'b2', projectId: 'p-late', category: 'salary', description: 'رواتب', plannedAmount: 10000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
];
function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: 'p-over', category: 'salary', description: 'مصروف', amount: 0, date: '2026-02-01', month: 2, approvalStatus: 'approved', isVatExempt: false, ...over };
}
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 11000 }),
  expense({ id: 'e2', amount: 8600, projectId: 'p-late' }),
  expense({ id: 'e3', amount: 500, projectId: 'p-late', approvalStatus: 'pending' }),
  expense({ id: 'e4', amount: 400, projectId: 'p-late', approvalStatus: 'pending' }),
  expense({ id: 'e5', amount: 8000, projectId: 'p-done' }),
];
const changeOrders: ChangeOrder[] = [
  { id: 'co1', projectId: 'p-over', description: 'مقترح', changeType: 'other', amountImpact: 1000, durationImpact: 0, status: 'proposed', createdAt: '' },
];
const milestones: Milestone[] = [
  { id: 'm1', projectId: 'p-over', name: 'متأخرة', sortOrder: 0, percentComplete: 20, weight: 1, status: 'delayed', createdAt: '' },
];
const risks: Risk[] = [
  { id: 'r1', projectId: 'p-late', title: 'خطر عالٍ', probability: 'high', impact: 'high', financialImpact: 0, category: 'financial', status: 'open', createdAt: '' },
  { id: 'r2', projectId: 'p-late', title: 'خطر قيد المعالجة', probability: 'high', impact: 'high', financialImpact: 0, category: 'financial', status: 'mitigating', createdAt: '' },
];
const paymentRequests = [
  { id: 'pr1', projectId: 'p-over', resourceId: 'r', requestType: 'advance', amount: 1000, currency: 'SAR', description: 'سلفة', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u', isAdvanceOutstanding: true, paidDate: format(subDays(new Date(), 70), 'yyyy-MM-dd'), createdAt: '', updatedAt: '' },
  { id: 'pr2', projectId: 'p-quiet', resourceId: 'r', requestType: 'advance', amount: 500, currency: 'SAR', description: 'سلفة', linkedReimbursementIds: [], priority: 'normal', status: 'paid', requestedBy: 'u', isAdvanceOutstanding: true, paidDate: format(subDays(new Date(), 40), 'yyyy-MM-dd'), createdAt: '', updatedAt: '' },
] as unknown as PaymentRequest[];

function renderBell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SmartNotifications />} />
        <Route path="/project/:id" element={<div>صفحة المشروع</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
function openBell() {
  fireEvent.click(screen.getByRole('button', { name: 'الإشعارات' }));
  return screen.getByRole('dialog');
}
const badge = () => screen.getByRole('button', { name: 'الإشعارات' }).querySelector('span');
const groupHeader = (text: RegExp) => screen.getByRole('button', { name: text });

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ projects, budgetItems, expenses, revenues: [], changeOrders, milestones, risks, paymentRequests } satisfies Partial<AppState>);
});

describe('what becomes a notification', () => {
  it('counts every finding on the live projects in the badge, red when any is critical', () => {
    renderBell();
    // p-over: over budget, proposed order, delayed milestone, 70-day advance.
    // p-late: near budget (8,600 + 900 pending = 95%), 2 pending expenses, overdue, 1 high open risk.
    // p-quiet: 40-day advance. p-done: nothing, it is finished.
    expect(badge()).toHaveTextContent('9');
    expect(badge()).toHaveClass('bg-destructive');
  });

  it('groups them by kind in a fixed order, the most urgent group open, each sorted by severity', () => {
    renderBell();
    const panel = openBell();
    const headers = within(panel).getAllByRole('button').filter((b) => /\(\d+\)$/.test(b.textContent || '')).map((b) => b.textContent);
    expect(headers).toEqual([
      'تجاوز المواعيد (1)', 'تحذيرات الميزانية (2)', 'سلف متقادمة (2)', 'مخاطر مفتوحة (1)', 'مراحل متأخرة (1)', 'بانتظار الاعتماد (2)',
    ]);
    // The deadline group opens by default; the budget group does not until clicked.
    expect(within(panel).getByText('تجاوز الموعد: مشروع متأخر')).toBeInTheDocument();
    expect(within(panel).queryByText('تجاوز الميزانية: مشروع متجاوز')).not.toBeInTheDocument();
    fireEvent.click(groupHeader(/تحذيرات الميزانية/));
    expect(within(panel).getByText('تجاوز الميزانية: مشروع متجاوز').closest('.rounded-md')).toHaveTextContent('110% من الموازنة');
    expect(within(panel).getByText('قارب الميزانية: مشروع متأخر').closest('.rounded-md')).toHaveTextContent('95%');
    fireEvent.click(groupHeader(/سلف متقادمة/));
    const advances = within(panel).getAllByText(/سلفة قائمة عمرها/);
    expect(advances.map((el) => el.textContent)).toEqual(['سلفة قائمة عمرها 70 يوم', 'سلفة قائمة عمرها 40 يوم']);
    // Past 60 days is critical; between 30 and 60 a warning.
    expect(advances[0].closest('.rounded-md')).toHaveClass('text-destructive');
    expect(advances[1].closest('.rounded-md')).toHaveClass('text-warning');
    fireEvent.click(groupHeader(/مخاطر مفتوحة/));
    expect(within(panel).getByText('مخاطر عالية: 1')).toBeInTheDocument();
    fireEvent.click(groupHeader(/بانتظار الاعتماد/));
    expect(within(panel).getByText('مصروفان بانتظار الاعتماد')).toBeInTheDocument();
    expect(within(panel).getByText('1 أمر تغيير مقترح')).toBeInTheDocument();
  });
});

describe('reading and following', () => {
  it('dismisses one, remembers it across a remount, and clears all', () => {
    const { unmount } = renderBell();
    let panel = openBell();
    const first = within(panel).getByText('تجاوز الموعد: مشروع متأخر').closest('.rounded-md') as HTMLElement;
    fireEvent.click(within(first).getByRole('button', { name: 'تجاهل' }));
    expect(within(panel).queryByText('تجاوز الموعد: مشروع متأخر')).not.toBeInTheDocument();
    expect(badge()).toHaveTextContent('8');
    unmount();

    renderBell();
    expect(badge()).toHaveTextContent('8');
    panel = openBell();
    fireEvent.click(within(panel).getByRole('button', { name: 'قراءة الكل' }));
    expect(within(panel).getByText('لا توجد إشعارات جديدة ✓')).toBeInTheDocument();
    expect(badge()).toBeNull();
  });

  it('goes to the project when a notification is clicked', async () => {
    renderBell();
    const panel = openBell();
    fireEvent.click(within(panel).getByText('تجاوز الموعد: مشروع متأخر'));
    expect(await screen.findByText('صفحة المشروع')).toBeInTheDocument();
  });
});
