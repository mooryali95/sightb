/**
 * Component tests for the source-of-truth panel, written before it is
 * split. The panel explains every headline figure with its formula and
 * its source; what costs money here is a figure or a formula that
 * contradicts the code it claims to explain. The audit lib and the funds
 * lib are unit-tested; the three server-facing children (the server truth
 * card, the explain button, the export button) are stood in.
 *
 * One test was red when written: the revenue rows named a status
 * 'received' that does not exist; the code sums 'collected'. The fix
 * commit that follows turns it green without editing a test.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  BudgetItem, CashTransfer, ChangeOrder, Custody, EVMMetrics, Expense, FundSettlement, PaymentRequest,
  Project, ProjectFund, ProjectSummary, Revenue,
} from '@/types/project';
import type { SsotFigure, SsotKey } from '@/lib/ssot-report';
import { SourceOfTruthSection } from '../SourceOfTruthSection';

vi.mock('../ServerTruthCard', () => ({
  ServerTruthCard: ({ audit }: { audit: Record<SsotKey, SsotFigure> }) => (
    <div data-testid="server-truth">{`actual ${audit.totalActualExpenses.value} · remaining ${audit.remainingFunds.value}`}</div>
  ),
}));
vi.mock('../SsotExplainButton', () => ({
  SsotExplainButton: ({ ssotKey }: { ssotKey: string }) => <button type="button" data-testid="explain">{ssotKey}</button>,
}));
vi.mock('../SsotReportExportButton', () => ({
  SsotReportExportButton: () => <button type="button">تصدير</button>,
}));

const PROJECT_ID = 'p-1';

const project: Project = {
  id: PROJECT_ID, companyId: 'c-1', name: 'مشروع الوزارة', contractValue: 100000, currency: 'SAR',
  startDate: '2026-01-01', endDate: '2026-06-30', durationMonths: 6, resourceCount: 1,
  status: 'active', createdAt: '', percentComplete: 40,
  contractType: 'lump_sum', retentionPercent: 0, managementReserve: 5000, taxPercent: 15, vatInclusive: false,
};

const summary: ProjectSummary = {
  contractValue: 100000, effectiveContractValue: 120000, contractRemaining: 108000,
  totalPlanned: 60000, totalActual: 12000, budgetRemaining: 48000, budgetVariance: 80,
  plannedProfit: 60000, plannedProfitMargin: 50, collectedRevenue: 40000, invoicedRevenue: 20000,
  totalPlannedRevenue: 10000, realizedProfit: 28000, realizedProfitMargin: 70, accountsReceivable: 20000,
  spendRate: 20, contractSpendRate: 10, burnRate: 4000, percentComplete: 40, managementReserve: 5000,
  bac: 55000, vatRate: 15, contractValueInclVAT: 138000, totalActualInclVAT: 13800,
  totalVATOnExpenses: 1800, totalVATOnRevenues: 6000, netVATPayable: 4200,
};

const evm: EVMMetrics = {
  pv: 30000, ev: 22000, ac: 12000, bac: 55000, cv: 10000, sv: -8000, cpi: 1.8333, spi: 0.7333,
  eac: 30000, etc: 18000, vac: 25000, tcpiBAC: 0.77, tcpiEAC: 1.83, eacAtypical: 45000, eacCombined: 41000,
};

function fund(over: Partial<ProjectFund>): ProjectFund {
  return { id: 'f', projectId: PROJECT_ID, fundNumber: 1, amount: 0, transferDate: '2026-02-01', status: 'acknowledged', createdBy: 'u', createdAt: '', updatedAt: '', ...over };
}
// One live fund and one already settled (not active, so not drawn down here).
const funds: ProjectFund[] = [
  fund({ id: 'f1', fundNumber: 1, amount: 50000 }),
  fund({ id: 'f2', fundNumber: 2, amount: 20000, status: 'settled' }),
];

function expense(over: Partial<Expense>): Expense {
  return { id: 'e', projectId: PROJECT_ID, category: 'consulting', description: 'مصروف', amount: 0, date: '2026-02-10', month: 2, approvalStatus: 'approved', isVatExempt: false, fundId: 'f1', ...over };
}
const expenses: Expense[] = [
  expense({ id: 'e1', amount: 12000 }),
  expense({ id: 'e2', amount: 3000, approvalStatus: 'rejected' }),
];

const custodies: Custody[] = [
  { id: 'c1', projectId: PROJECT_ID, resourceName: 'سالم', amount: 5000, spent: 0, remaining: 5000, status: 'active', sourceFundId: 'f1', createdAt: '' },
];

const paymentRequests: PaymentRequest[] = [
  {
    id: 'pr1', projectId: PROJECT_ID, resourceId: 'r1', requestType: 'advance', amount: 4000, currency: 'SAR', description: 'سلفة سالم',
    linkedReimbursementIds: [], paidFromFundId: 'f1', priority: 'normal', status: 'paid', requestedBy: 'u',
    isAdvanceOutstanding: true, refundedAmount: 1000,
  } as unknown as PaymentRequest,
];

const cashTransfers: CashTransfer[] = [
  { id: 't1', projectId: PROJECT_ID, fromFundId: 'f1', toCustodyId: 'c1', amount: 2500, transferDate: '2026-02-15', createdAt: '' },
];

function settlement(over: Partial<FundSettlement>): FundSettlement {
  return { id: 's', fundId: 'f1', projectId: PROJECT_ID, totalReceived: 0, totalSpent: 0, remainingCash: 0, difference: 0, status: 'draft', attachments: [], createdAt: '', updatedAt: '', ...over } as FundSettlement;
}
const settlements: FundSettlement[] = [
  settlement({ id: 's1', fundId: 'f1', totalReceived: 50000, totalSpent: 12000, status: 'draft' }),
  settlement({ id: 's2', fundId: 'f2', totalReceived: 20000, totalSpent: 20000, status: 'approved' }),
];

function revenue(over: Partial<Revenue>): Revenue {
  return { id: 'r', projectId: PROJECT_ID, description: 'دفعة', amount: 0, date: '2026-03-01', month: 3, revenueType: 'milestone', status: 'planned', ...over };
}
const revenues: Revenue[] = [
  revenue({ id: 'r1', amount: 40000, status: 'collected' }),
  revenue({ id: 'r2', amount: 20000, status: 'invoiced' }),
  revenue({ id: 'r3', amount: 10000, status: 'planned' }),
];

const changeOrders: ChangeOrder[] = [
  { id: 'co1', projectId: PROJECT_ID, description: 'توسعة', changeType: 'scope_addition', amountImpact: 20000, durationImpact: 0, status: 'approved', createdAt: '' },
  { id: 'co2', projectId: PROJECT_ID, description: 'مقترح', changeType: 'other', amountImpact: 5000, durationImpact: 0, status: 'proposed', createdAt: '' },
];

const budgetItems: BudgetItem[] = [];

function renderSection(over: { evm?: EVMMetrics | null } = {}) {
  return render(
    <SourceOfTruthSection
      project={project} summary={summary} evm={over.evm === undefined ? null : over.evm}
      budgetItems={budgetItems} expenses={expenses} revenues={revenues} changeOrders={changeOrders}
      funds={funds} settlements={settlements} custodies={custodies} paymentRequests={paymentRequests} cashTransfers={cashTransfers}
    />,
  );
}

/** A figure row: the label's grid row, which also carries the value and the formula. */
function row(label: string | RegExp): HTMLElement {
  const el = screen.getByText(label, { selector: 'span' });
  return el.closest('.grid') as HTMLElement;
}

describe('the contract and revenue block', () => {
  it('lists the contract, the approved orders, the effective value and the revenues', () => {
    renderSection();
    expect(row('قيمة العقد الأصلية')).toHaveTextContent('100,000.00 ر.س');
    expect(row('أثر أوامر التغيير المعتمدة (1)')).toHaveTextContent('20,000.00 ر.س');
    expect(row('قيمة العقد الفعلية')).toHaveTextContent('120,000.00 ر.س');
    expect(row('الإيرادات المُحصَّلة')).toHaveTextContent('40,000.00 ر.س');
    expect(row('الإيرادات المُفوترة (شاملة المحصَّل)')).toHaveTextContent('60,000.00 ر.س');
  });

  it("explains the revenue rows with the status the code sums, 'collected'", () => {
    renderSection();
    expect(row('الإيرادات المُحصَّلة')).toHaveTextContent("Σ revenues.amount WHERE status = 'collected'");
    expect(row('الإيرادات المُفوترة (شاملة المحصَّل)')).toHaveTextContent("status IN ('invoiced','collected')");
    expect(screen.queryByText(/received/)).not.toBeInTheDocument();
  });
});

describe('the spend and profit block', () => {
  it('shows the planned and actual totals, what was excluded, the advances net of refunds, and both profits', () => {
    renderSection();
    // This block starts folded.
    fireEvent.click(screen.getByRole('button', { name: 'المصروفات والربحية' }));
    expect(row('إجمالي المُخطَّط (Budget)')).toHaveTextContent('60,000.00 ر.س');
    expect(row('المصروفات الفعلية (AC)')).toHaveTextContent('12,000.00 ر.س');
    expect(row('المصروفات المرفوضة (مستبعدة)')).toHaveTextContent('3,000.00 ر.س');
    // 4,000 paid, 1,000 refunded.
    expect(row('سلف قائمة (Outstanding Advances)')).toHaveTextContent('3,000.00 ر.س');
    expect(row('الربح المُخطَّط')).toHaveTextContent('60,000.00 ر.س');
    expect(row('الربح المحقق (Realized)')).toHaveTextContent('28,000.00 ر.س');
  });
});

describe('the funds block', () => {
  it('totals every fund, draws down each live one, and sums what is in hand and what was settled', () => {
    renderSection();
    expect(row('إجمالي المُحوَّل (2 دفعة)')).toHaveTextContent('70,000.00 ر.س');
    expect(screen.getByText('تفصيل الاستنزاف للدفعات النشطة (1):')).toBeInTheDocument();
    const live = screen.getByText(/دفعة #1/).closest('.rounded') as HTMLElement;
    expect(within(live).getByText('مصروف مباشر').closest('.grid')).toHaveTextContent('12,000.00 ر.س');
    expect(within(live).getByText('عهد مسحوبة').closest('.grid')).toHaveTextContent('5,000.00 ر.س');
    expect(within(live).getByText('سلف قائمة').closest('.grid')).toHaveTextContent('3,000.00 ر.س');
    expect(within(live).getByText('تحويلات نقدية صادرة → عهدة').closest('.grid')).toHaveTextContent('2,500.00 ر.س');
    // 50,000 − 12,000 − 5,000 − 3,000 − 2,500.
    expect(within(live).getByText('المتبقي بيد المدير لهذه الدفعة').closest('.grid')).toHaveTextContent('27,500.00 ر.س');
    expect(row('إجمالي النقد بيد المدير (كل الدفعات النشطة)')).toHaveTextContent('27,500.00 ر.س');
    // Only the approved settlement (the settled fund's); the live fund's draft does not count.
    expect(row('إجمالي التسويات المعتمدة')).toHaveTextContent('20,000.00 ر.س');
  });

  it('hands the same audit to the server card', () => {
    renderSection();
    expect(screen.getByTestId('server-truth')).toHaveTextContent('actual 12000 · remaining 27500');
  });
});

describe('the EVM block and the guards', () => {
  it('asks for a baseline when there is no EVM', () => {
    renderSection();
    expect(screen.getByText(/لا يوجد خط أساس معتمد/)).toBeInTheDocument();
  });

  it('shows the four EVM figures and the four indices', () => {
    renderSection({ evm });
    expect(row('BAC — الميزانية الإجمالية')).toHaveTextContent('55,000.00 ر.س');
    expect(row('PV — القيمة المخططة حتى تاريخه')).toHaveTextContent('30,000.00 ر.س');
    expect(row('EV — القيمة المكتسبة')).toHaveTextContent('22,000.00 ر.س');
    expect(row('AC — التكلفة الفعلية')).toHaveTextContent('12,000.00 ر.س');
    expect(screen.getByText('CPI').nextElementSibling).toHaveTextContent('1.83');
    expect(screen.getByText('SPI').nextElementSibling).toHaveTextContent('0.73');
    expect(screen.getByText('EAC').nextElementSibling).toHaveTextContent('30,000.00 ر.س');
    expect(screen.getByText('VAC').nextElementSibling).toHaveTextContent('25,000.00 ر.س');
  });

  it('names the ten database guards', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /حراس السلامة/ }));
    for (const guard of ['check_fund_balance', 'validate_cash_transfer', 'auto_close_custody_on_exhaustion', 'protect_last_owner']) {
      expect(screen.getByText(guard)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('code.font-mono')).toHaveLength(10);
  });
});
