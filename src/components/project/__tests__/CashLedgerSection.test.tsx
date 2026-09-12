/**
 * Component tests for the cash ledger, the read-only reconciliation view.
 *
 * The ledger has no form and no action; everything on it is a figure. The
 * fixture is one fund, one custody drawn from it, three expenses (one of
 * them rejected), one paid request that produced its own expense, and two
 * pending payables. Every card, the flow bar and the timeline count are
 * pinned to what that ledger must say.
 *
 * One test was red when written: the expanded fund listed its custody with
 * a spend that counted a rejected expense, while every other figure on the
 * page (the custody's own row included) excluded it. The fix commit that
 * follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore, type AppState } from '@/store/useStore';
import type { Custody, Expense, PaymentRequest, ProjectFund, ResourceReimbursement } from '@/types/project';
import { CashLedgerSection } from '../CashLedgerSection';

const PROJECT_ID = 'project-under-test';
const FUND_ID = 'fund-1';
const CUSTODY_ID = 'custody-1';

const fund: ProjectFund = {
  id: FUND_ID, projectId: PROJECT_ID, fundNumber: 1, amount: 50000, transferDate: '2026-02-01',
  status: 'acknowledged', acknowledgedAt: '2026-02-02T00:00:00Z', createdBy: 'user-1',
  createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-02T00:00:00Z',
};

const custody: Custody = {
  id: CUSTODY_ID, projectId: PROJECT_ID, resourceName: 'عمر', amount: 5000, spent: 0, remaining: 5000,
  status: 'active', receivedDate: '2026-02-05', createdAt: '2026-02-05T00:00:00Z', sourceFundId: FUND_ID,
};

function expense(over: Partial<Expense>): Expense {
  return {
    id: 'exp', projectId: PROJECT_ID, category: 'consulting', description: 'بند', amount: 0,
    date: '2026-02-10', month: 2, approvalStatus: 'approved', isVatExempt: false, ...over,
  };
}

const expenses: Expense[] = [
  expense({ id: 'exp-direct', amount: 7000, description: 'مصروف مباشر', fundId: FUND_ID }),
  expense({ id: 'exp-custody', amount: 1000, description: 'مصروف من العهدة', custodyId: CUSTODY_ID }),
  expense({ id: 'exp-custody-rejected', amount: 300, description: 'مصروف مرفوض من العهدة', custodyId: CUSTODY_ID, approvalStatus: 'rejected' }),
  expense({ id: 'exp-from-request', amount: 2000, description: 'استرداد: مستحقات سالم', fundId: FUND_ID }),
];

/** Paid, and it produced exp-from-request: counted once, as the expense. */
const paidRequest: PaymentRequest = {
  id: 'req-paid', projectId: PROJECT_ID, resourceId: 'res-1', requestType: 'reimbursement', amount: 2000,
  currency: 'SAR', description: 'مستحقات سالم', linkedReimbursementIds: [], priority: 'normal', status: 'paid',
  requestedBy: 'user-1', paymentAttachments: [], autoCreatedExpenseId: 'exp-from-request', paidFromFundId: FUND_ID,
  paidDate: '2026-02-15', createdAt: '2026-02-14T00:00:00Z', updatedAt: '2026-02-15T00:00:00Z',
};

const inFlightRequest: PaymentRequest = {
  ...paidRequest, id: 'req-open', amount: 600, status: 'submitted', description: 'طلب قيد المعالجة',
  autoCreatedExpenseId: undefined, paidFromFundId: undefined, paidDate: undefined,
};

const approvedReimbursement: ResourceReimbursement = {
  id: 'r-approved', projectId: PROJECT_ID, resourceId: 'res-1', sourceKind: 'resource', category: 'other',
  description: 'سفر', amount: 1500, expenseDate: '2026-02-08', receiptAttachments: [], status: 'approved',
  createdAt: '2026-02-08T00:00:00Z', updatedAt: '2026-02-08T00:00:00Z',
};

function seedStore(over: Partial<AppState> = {}) {
  useStore.setState({
    reimbursements: [approvedReimbursement],
    paymentRequests: [paidRequest, inFlightRequest],
    resourceSettlements: [],
    resources: [{ id: 'res-1', projectId: PROJECT_ID, name: 'سالم', monthlyCost: 0, createdAt: '2026-01-01T00:00:00Z' }],
    cashTransfers: [],
    ...over,
  } satisfies Partial<AppState>);
}

function renderLedger(rows: Expense[] = expenses, custodies: Custody[] = [custody]) {
  render(<CashLedgerSection projectId={PROJECT_ID} funds={[fund]} settlements={[]} expenses={rows} custodies={custodies} />);
}

/** The figure on a summary card, found by the card's label. */
function card(label: string): HTMLElement {
  const el = screen.getByText(label).closest('div.rounded-xl');
  if (!el) throw new Error(`no card labelled "${label}"`);
  return el as HTMLElement;
}

beforeEach(() => seedStore());

describe('the five cards agree on one ledger', () => {
  it('reports what was transferred and how many funds are open', () => {
    renderLedger();
    expect(card('إجمالي ما تحوّل')).toHaveTextContent('50,000.00 ر.س');
    expect(card('إجمالي ما تحوّل')).toHaveTextContent('1 دفعة · 1 مفتوحة');
  });

  it('reports what is still in the manager\'s hand', () => {
    renderLedger();
    // 50,000 − 9,000 direct (7,000 + the 2,000 the request produced) − 5,000
    // drawn by the custody. The custody's own spend does not come off again.
    expect(card('بيد مدير المشروع')).toHaveTextContent('36,000.00 ر.س');
  });

  it('reports what custody holders still have, rejected spend excluded', () => {
    renderLedger();
    // 5,000 − 1,000; the rejected 300 never left the custody.
    expect(card('بيد حاملي العُهد')).toHaveTextContent('4,000.00 ر.س');
    expect(card('بيد حاملي العُهد')).toHaveTextContent('1/1 عهدة نشطة');
  });

  it('leaves a closed custody out of what holders still have', () => {
    // Closed means handed back; whatever arithmetic says is left in it is
    // not cash in anyone's hand. Breaking the status filter put 2,000 here.
    renderLedger(expenses, [custody, { ...custody, id: 'custody-closed', resourceName: 'هند', amount: 2000, status: 'closed', closedDate: '2026-03-01' }]);
    expect(card('بيد حاملي العُهد')).toHaveTextContent('4,000.00 ر.س');
    expect(card('بيد حاملي العُهد')).toHaveTextContent('1/2 عهدة نشطة');
  });

  it('splits documented spend into direct and through custodies', () => {
    renderLedger();
    expect(card('مصروف موثّق')).toHaveTextContent('10,000.00 ر.س');
    expect(card('مصروف موثّق')).toHaveTextContent('مباشر 9,000.00 ر.س · عُهد 1,000.00 ر.س');
  });

  it('counts what was paid to resources once, as the expense it produced', () => {
    renderLedger();
    expect(card('مدفوع لمستحقات موارد')).toHaveTextContent('2,000.00 ر.س');
  });

  it('adds up: manager + holders + documented = transferred', () => {
    renderLedger();
    // 36,000 + 4,000 + 10,000 = 50,000. If any card double-counted the
    // custody's spend or the request's expense, this would not close.
    const figure = (label: string) => Number(card(label).querySelector('p.font-mono')?.textContent?.replace(/[^\d.]/g, ''));
    expect(figure('بيد مدير المشروع') + figure('بيد حاملي العُهد') + figure('مصروف موثّق')).toBe(figure('إجمالي ما تحوّل'));
  });
});

describe('what is owed but not yet paid', () => {
  it('lists approved reimbursements and in-flight requests, and keeps them out of the cash figures', () => {
    renderLedger();
    const note = screen.getByText(/مستحقات موارد معلّقة/).closest('div.rounded-xl') as HTMLElement;
    expect(note).toHaveTextContent('استردادات معتمدة بانتظار الدفع: 1,500.00 ر.س');
    expect(note).toHaveTextContent('طلبات صرف قيد المعالجة: 600.00 ر.س');
    expect(note).toHaveTextContent('الإجمالي: 2,100.00 ر.س');
    // Still 36,000 in hand: nothing pending has been paid.
    expect(card('بيد مدير المشروع')).toHaveTextContent('36,000.00 ر.س');
  });

  it('says nothing when nothing is pending', () => {
    seedStore({ reimbursements: [], paymentRequests: [paidRequest] });
    renderLedger();
    expect(screen.queryByText(/مستحقات موارد معلّقة/)).not.toBeInTheDocument();
  });
});

describe('the funds column', () => {
  /** The fund's header button, inside the funds column: the custody column also names the fund. */
  function fundRow(): HTMLElement {
    const column = screen.getByText('الدفعات', { selector: 'h3' }).closest('div.stat-card') as HTMLElement;
    return within(column).getByRole('button', { name: /دفعة #1/ });
  }
  function expandFund() {
    fireEvent.click(fundRow());
  }

  it('shows the fund\'s spend against its amount and what is left with the manager', () => {
    renderLedger();
    const row = fundRow();
    expect(row).toHaveTextContent('14,000.00 ر.س / 50,000.00 ر.س');
    expect(row).toHaveTextContent('مباشر: 9,000.00 ر.س');
    expect(row).toHaveTextContent('عُهد: 5,000.00 ر.س');
    expect(row).toHaveTextContent('متبقي بيد المدير: 36,000.00 ر.س');
  });

  it('lists the custody drawn from the fund with its spend, rejected rows excluded', () => {
    renderLedger();
    expandFund();
    const drawn = screen.getByText(/عُهد مسحوبة من هذه الدفعة/).parentElement as HTMLElement;
    expect(within(drawn).getByText('عمر')).toBeInTheDocument();
    // The custody's own row says 1,000 spent; this line must say the same.
    expect(drawn).toHaveTextContent('1,000.00 ر.س / 5,000.00 ر.س');
  });

  it('lists direct expenses only, tagging the one a request produced', () => {
    renderLedger();
    expandFund();
    expect(screen.getByText('مصروف مباشر')).toBeInTheDocument();
    expect(screen.getByText('استرداد: مستحقات سالم')).toBeInTheDocument();
    expect(screen.queryByText('مصروف من العهدة')).not.toBeInTheDocument();
  });
});

describe('warnings', () => {
  it('flags spend that belongs to no fund and no custody', () => {
    renderLedger([...expenses, expense({ id: 'exp-loose', amount: 250, description: 'بلا مصدر' })]);
    expect(screen.getByText(/1 مصروف غير مرتبط بأي دفعة أو عهدة \(إجمالي 250\.00 ر\.س\)/)).toBeInTheDocument();
  });

  it('flags a custody with no fund behind it', () => {
    renderLedger(expenses, [{ ...custody, sourceFundId: undefined }]);
    expect(screen.getByText(/1 عُهدة غير مربوطة بدفعة \(إجمالي 5,000\.00 ر\.س\)/)).toBeInTheDocument();
  });
});

describe('the timeline', () => {
  it('counts every money event once', () => {
    renderLedger();
    // 1 fund + 1 custody + 4 expenses. The paid request is represented by
    // the expense it produced and must not appear a second time.
    expect(screen.getByRole('tab', { name: /العمليات \(6\)/ })).toBeInTheDocument();
  });
});
