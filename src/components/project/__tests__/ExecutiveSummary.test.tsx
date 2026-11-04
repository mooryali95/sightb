/**
 * Component tests for the executive summary, written before it is split.
 *
 * Every figure here is read by the owner first. What costs money: the
 * month's planned against spent, the budget split (spent, committed but
 * unspent, available, over), the collection line, the risk exposure
 * against the reserve, and the list of what needs attention.
 *
 * Two tests were red when written: the budget split added the approved
 * change orders' contract impact on top of a planned total that already
 * carries the budget items those orders created on approval, so the
 * "available" slice was inflated by the whole impact and an overrun hid
 * behind it. The fix commit that follows turns them green without editing
 * a test.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  BudgetItem, ChangeOrder, Expense, Milestone, Project, ProjectSummary, Risk,
} from '@/types/project';
import { ExecutiveSummary } from '../ExecutiveSummary';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ data }: { data: { name: string; value: number }[] }) => (
    <ul data-testid="pie">{data.map((d) => <li key={d.name}>{`${d.name}: ${d.value}`}</li>)}</ul>
  ),
  Cell: () => null, Tooltip: () => null, Legend: () => null,
}));

const PROJECT_ID = 'p-1';

const project: Project = {
  id: PROJECT_ID, companyId: 'c-1', name: 'مشروع الوزارة', contractValue: 100000, currency: 'SAR',
  startDate: '2026-01-01', endDate: '2026-06-30', durationMonths: 6, resourceCount: 1,
  status: 'active', createdAt: '', percentComplete: 40,
  contractType: 'lump_sum', retentionPercent: 0, managementReserve: 5000, taxPercent: 15, vatInclusive: false,
};

/** The summary as the page's hook would compute it; only the fields the section reads matter. */
function summary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    contractValue: 100000, effectiveContractValue: 120000, contractRemaining: 90000,
    totalPlanned: 60000, totalActual: 30000, budgetRemaining: 30000, budgetVariance: 50,
    plannedProfit: 60000, plannedProfitMargin: 50, collectedRevenue: 40000, invoicedRevenue: 20000,
    totalPlannedRevenue: 60000, realizedProfit: 10000, realizedProfitMargin: 25, accountsReceivable: 20000,
    spendRate: 50, contractSpendRate: 25, burnRate: 10000, percentComplete: 40, managementReserve: 5000,
    bac: 55000, vatRate: 15, contractValueInclVAT: 138000, totalActualInclVAT: 34500,
    totalVATOnExpenses: 4500, totalVATOnRevenues: 6000, netVATPayable: 1500, ...over,
  };
}

const budgetItems: BudgetItem[] = [
  { id: 'b1', projectId: PROJECT_ID, category: 'salary', description: 'رواتب', plannedAmount: 5000, costType: 'recurring', costClass: 'direct', startMonth: 1, endMonth: 6 } as BudgetItem,
  { id: 'b2', projectId: PROJECT_ID, category: 'equipment', description: 'معدات', plannedAmount: 12000, costType: 'fixed', costClass: 'direct' } as BudgetItem,
];

function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: PROJECT_ID, category: 'salary', description: 'مصروف', amount: 0, date: '2026-01-15', month: 1, approvalStatus: 'approved', isVatExempt: false, ...over };
}

// Planned 7,000 a month (5,000 recurring + 12,000 / 6). Spent: 6,000 in month 1;
// 9,000 plus a 4,000 still pending in month 2 (both count); 8,000 in month 3.
// The rejected 3,000 and the outstanding advance 2,000 count nowhere.
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 6000 }),
  expense({ id: 'e2', amount: 9000, month: 2, date: '2026-02-10' }),
  expense({ id: 'e3', amount: 4000, month: 2, date: '2026-02-20', approvalStatus: 'pending', description: 'فاتورة معلّقة' }),
  expense({ id: 'e4', amount: 3000, month: 2, date: '2026-02-21', approvalStatus: 'rejected' }),
  expense({ id: 'e5', amount: 2000, month: 3, date: '2026-03-02', isOutstandingAdvance: true }),
  expense({ id: 'e6', amount: 8000, month: 3, date: '2026-03-10' }),
];

function milestone(over: Partial<Milestone>): Milestone {
  return { id: 'm', projectId: PROJECT_ID, name: 'مرحلة', sortOrder: 0, percentComplete: 0, weight: 0, status: 'planned', createdAt: '', ...over };
}
const milestones: Milestone[] = [
  milestone({ id: 'm1', name: 'التصميم', status: 'completed', percentComplete: 100 }),
  milestone({ id: 'm2', name: 'التنفيذ', status: 'in_progress', percentComplete: 50, plannedEnd: '2026-12-31' }),
  milestone({ id: 'm3', name: 'التسليم', status: 'delayed' }),
];

function risk(over: Partial<Risk>): Risk {
  return { id: 'r', projectId: PROJECT_ID, title: 'خطر', probability: 'medium', impact: 'medium', financialImpact: 0, category: 'financial', status: 'open', createdAt: '', ...over };
}
const risks: Risk[] = [
  risk({ id: 'r1', title: 'تأخر التوريد', impact: 'high', financialImpact: 12000 }),
  risk({ id: 'r2', title: 'نقص الكوادر', status: 'mitigating', financialImpact: 3000 }),
  risk({ id: 'r3', title: 'تقلب العملة', status: 'closed', financialImpact: 30000 }),
];

function order(over: Partial<ChangeOrder>): ChangeOrder {
  return { id: 'co', projectId: PROJECT_ID, description: 'أمر', changeType: 'scope_addition', amountImpact: 0, durationImpact: 0, status: 'proposed', createdAt: '', ...over };
}
// The approved order's budget items are already in the budget (totalPlanned carries them).
const changeOrders: ChangeOrder[] = [
  order({ id: 'co-approved', description: 'توسعة', amountImpact: 20000, status: 'approved', budgetItems: [{ category: 'consulting', description: 'استشارات', plannedAmount: 10000, costType: 'fixed' }] }),
  order({ id: 'co-proposed', description: 'تعديل مقترح', amountImpact: 5000 }),
];

function renderSummary(over: {
  summary?: ProjectSummary; expenses?: Expense[]; milestones?: Milestone[]; changeOrders?: ChangeOrder[]; risks?: Risk[];
} = {}) {
  return render(
    <ExecutiveSummary
      project={project} summary={over.summary ?? summary()} milestones={over.milestones ?? milestones} risks={over.risks ?? risks}
      changeOrders={over.changeOrders ?? changeOrders} expenses={over.expenses ?? expenses} budgetItems={budgetItems}
      currentMonth={3} totalCommitted={35000}
    />,
  );
}

function card(label: string): HTMLElement {
  return screen.getByText(label).nextElementSibling as HTMLElement;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(shown: string, option: RegExp) {
  const trigger = screen.getByText(shown).closest('button') as HTMLElement;
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

describe('the month', () => {
  it('opens on the current month with its planned, spent, difference and verdict', () => {
    renderSummary();
    expect(screen.getByText('الأداء المالي — شهر 3')).toBeInTheDocument();
    expect(card('المخطط')).toHaveTextContent('7,000.00 ر.س');
    expect(card('المصروف')).toHaveTextContent('8,000.00 ر.س');
    expect(card('تجاوز')).toHaveTextContent('1,000.00 ر.س');
    expect(card('الحكم')).toHaveTextContent('تجاوز ⚠️');
    expect(screen.getByText('نسبة الصرف').nextElementSibling).toHaveTextContent('114%');
  });

  it('switches to one earlier month, and to the elapsed months together', () => {
    renderSummary();
    pick('الشهر الحالي (3)', /^شهر 1$/);
    expect(screen.getByText('الأداء المالي — شهر 1')).toBeInTheDocument();
    expect(card('المصروف')).toHaveTextContent('6,000.00 ر.س');
    expect(card('وفر')).toHaveTextContent('1,000.00 ر.س');
    expect(card('الحكم')).toHaveTextContent('وفر 👍');

    pick('شهر 1', /إجمالي الأشهر/);
    // 3 × 7,000 planned against 6,000 + 13,000 + 8,000 spent.
    expect(screen.getByText('الأداء المالي — إجمالي 3 شهر')).toBeInTheDocument();
    expect(card('المخطط')).toHaveTextContent('21,000.00 ر.س');
    expect(card('المصروف')).toHaveTextContent('27,000.00 ر.س');
    expect(card('تجاوز')).toHaveTextContent('6,000.00 ر.س');
  });
});

describe('the budget split', () => {
  it('splits the planned total into spent, committed but unspent, and available', () => {
    renderSummary();
    const [budgetPie] = screen.getAllByTestId('pie');
    // Planned 60,000 (the approved order's items already in it). Spent 30,000; committed 35,000
    // leaves 5,000 committed but unspent; available is 60,000 − 35,000, not a contract impact more.
    expect(within(budgetPie).getByText('مصروف: 30000')).toBeInTheDocument();
    expect(within(budgetPie).getByText('ملتزم غير مصروف: 5000')).toBeInTheDocument();
    expect(within(budgetPie).getByText('متاح: 25000')).toBeInTheDocument();
    expect(within(budgetPie).queryByText(/تجاوز/)).not.toBeInTheDocument();
  });

  it('shows the overrun when spend or commitments pass the planned total', () => {
    renderSummary({ summary: summary({ totalPlanned: 32000, totalActual: 30000, budgetRemaining: 2000 }) });
    const [budgetPie] = screen.getAllByTestId('pie');
    expect(within(budgetPie).getByText('تجاوز: 3000')).toBeInTheDocument();
    expect(within(budgetPie).queryByText(/متاح/)).not.toBeInTheDocument();
  });
});

describe('milestones, collection and risks', () => {
  it('counts the milestones by status and names the next one', () => {
    renderSummary();
    expect(screen.getByText('المراحل (1/3 مكتمل)')).toBeInTheDocument();
    const [, milestonePie] = screen.getAllByTestId('pie');
    expect(within(milestonePie).getByText('مكتمل: 1')).toBeInTheDocument();
    expect(within(milestonePie).getByText('جاري: 1')).toBeInTheDocument();
    expect(within(milestonePie).getByText('متأخر: 1')).toBeInTheDocument();
    expect(screen.getByText('القادم: التنفيذ')).toBeInTheDocument();
  });

  it('shows the contract, what was collected, what was invoiced, and what was not', () => {
    renderSummary();
    expect(card('العقد')).toHaveTextContent('120,000.00 ر.س');
    expect(card('محصّل')).toHaveTextContent('40,000.00 ر.س');
    expect(screen.getByText('مفوتر', { selector: 'p' }).nextElementSibling).toHaveTextContent('20,000.00 ر.س');
    expect(screen.getByText('لم يُفوتر', { selector: 'p' }).nextElementSibling).toHaveTextContent('60,000.00 ر.س');
    expect(screen.getByText(/محصّل 33%/)).toBeInTheDocument();
  });

  it('counts the open risks, the high ones, their exposure, and judges it against the reserve', () => {
    renderSummary();
    expect(screen.getByText('مفتوحة').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('عالية').previousElementSibling).toHaveTextContent('1');
    // 12,000 + 3,000; the closed 30,000 does not count.
    expect(screen.getByText('التعرض').previousElementSibling).toHaveTextContent('15,000.00 ر.س');
    expect(screen.getByText('⚠️ التعرض يتجاوز الاحتياطي')).toBeInTheDocument();
    expect(screen.getByText('تأخر التوريد')).toBeInTheDocument();
    expect(screen.queryByText('نقص الكوادر')).not.toBeInTheDocument();
  });
});

describe('what needs attention', () => {
  it('lists the pending expenses with their sum, the proposed orders and the delayed milestones', () => {
    renderSummary();
    expect(screen.getByText('1 مصروف بانتظار الاعتماد (4,000.00 ر.س)')).toBeInTheDocument();
    expect(screen.getByText('1 أمر تغيير مقترح')).toBeInTheDocument();
    expect(screen.getByText('1 مرحلة متأخرة')).toBeInTheDocument();
    expect(screen.queryByText(/تجاوز الموازنة بـ/)).not.toBeInTheDocument();
  });

  it('names the overrun, and disappears when nothing is pending', () => {
    const { unmount } = renderSummary({ summary: summary({ budgetRemaining: -2500 }) });
    expect(screen.getByText('تجاوز الموازنة بـ 2,500.00 ر.س')).toBeInTheDocument();
    unmount();
    renderSummary({
      expenses: expenses.filter((e) => e.approvalStatus !== 'pending'),
      changeOrders: changeOrders.filter((co) => co.status !== 'proposed'),
      milestones: milestones.filter((m) => m.status !== 'delayed'),
    });
    expect(screen.queryByText('يحتاج تدخل')).not.toBeInTheDocument();
  });
});
