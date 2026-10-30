import { describe, it, expect } from 'vitest';
import type { IntercompanyEntry, LedgerNode } from '../company-ledger';
import { arabicDays, dueLoans, fundingByProject, lenderRepaymentDue, loansByLender, plainSummary, recoveryAlerts } from '../loans';

const C: LedgerNode = { kind: 'company', id: null };
const party = (id: string): LedgerNode => ({ kind: 'party', id });
const project = (id: string): LedgerNode => ({ kind: 'project', id });
let n = 0;
const e = (from: LedgerNode, to: LedgerNode, amount: number, date: string, type: IntercompanyEntry['type'] = 'advance', dueDate: string | null = null): IntercompanyEntry =>
  ({ id: `e${++n}`, companyId: 'c', date, amount, type, from, to, note: '', dueDate, salaryExpenseId: null });

describe('loans through the company', () => {
  const entries = [
    e(party('owner'), C, 100000, '2026-01-01', 'advance', '2026-06-30'),
    e(C, project('albania'), 100000, '2026-01-02'),
    e(party('friend'), C, 20000, '2026-02-01', 'advance', '2026-03-01'),
    e(project('albania'), C, 30000, '2026-04-01', 'repayment'),
    e(C, party('owner'), 10000, '2026-04-02', 'repayment'),
    // A salary advance to a person is not a loan to the company.
    e(C, party('staff'), 500, '2026-04-03'),
  ];

  it('adds up each lender, with the open due date and whether it passed', () => {
    const loans = loansByLender(entries, '2026-05-01');
    expect(loans.map((l) => [l.partyId, l.lent, l.repaid, l.outstanding, l.overdue])).toEqual([
      ['owner', 100000, 10000, 90000, false],
      ['friend', 20000, 0, 20000, true],
    ]);
    expect(loans.find((l) => l.partyId === 'staff')).toBeUndefined();
  });

  it('asks only for the dated loan when an undated one is also open, settling oldest first', () => {
    const [l] = loansByLender([
      e(party('m'), C, 100000, '2026-01-01'),
      e(party('m'), C, 25000, '2026-10-01', 'advance', '2026-10-31'),
    ], '2026-10-26');
    expect(l).toMatchObject({ outstanding: 125000, dueDate: '2026-10-31', dueAmount: 25000 });
    const [after] = loansByLender([
      e(party('m'), C, 100, '2026-01-01', 'advance', '2026-02-01'),
      e(party('m'), C, 50, '2026-01-05', 'advance', '2026-03-01'),
      e(C, party('m'), 120, '2026-01-10', 'repayment'),
    ], '2026-01-20');
    expect(after).toMatchObject({ outstanding: 30, dueDate: '2026-03-01', dueAmount: 30 });
  });

  it('drops the due date once a loan is repaid', () => {
    const [l] = loansByLender([e(party('x'), C, 100, '2026-01-01', 'advance', '2026-01-10'), e(C, party('x'), 100, '2026-01-05', 'repayment')], '2026-05-01');
    expect(l).toMatchObject({ outstanding: 0, dueDate: null, overdue: false });
  });

  it('follows the funding a project still owes', () => {
    expect(fundingByProject(entries)).toEqual([{ projectId: 'albania', funded: 100000, returned: 30000, outstanding: 70000, firstDate: '2026-01-02' }]);
  });

  it('alerts when the project collected since its funding, up to what it owes and what it has', () => {
    const funding = fundingByProject(entries);
    const collected = [
      { projectId: 'albania', amount: 5000, date: '2025-12-01' }, // before the funding: not counted
      { projectId: 'albania', amount: 50000, date: '2026-03-01' },
    ];
    expect(recoveryAlerts(funding, collected)).toEqual([{ projectId: 'albania', available: 20000, suggested: 20000 }]);
    expect(recoveryAlerts(funding, [{ projectId: 'albania', amount: 500000, date: '2026-03-01' }])[0].suggested).toBe(70000);
    expect(recoveryAlerts(funding, [{ projectId: 'albania', amount: 30000, date: '2026-03-01' }])).toEqual([]);
  });

  it('offers the recovered money to the lender owed most, net of what was passed on', () => {
    const loans = loansByLender(entries, '2026-05-01');
    expect(lenderRepaymentDue(loans, entries)).toEqual({ partyId: 'owner', suggested: 20000 });
    expect(lenderRepaymentDue(loans, [...entries, e(C, party('owner'), 20000, '2026-04-05', 'repayment')])).toBeNull();
  });
});

describe('plain words', () => {
  it('flags loans late or due within two weeks, the most urgent first', () => {
    const base = { lent: 1, repaid: 0, outstanding: 1, dueAmount: 1, firstDate: '2026-01-01', overdue: false };
    const due = dueLoans([
      { ...base, partyId: 'later', dueDate: '2026-12-01' },
      { ...base, partyId: 'soon', dueDate: '2026-05-10' },
      { ...base, partyId: 'late', dueDate: '2026-04-20' },
      { ...base, partyId: 'paid', dueDate: '2026-04-20', outstanding: 0, dueAmount: 0 },
    ], '2026-05-01');
    expect(due.map((l) => [l.partyId, l.days])).toEqual([['late', -11], ['soon', 9]]);
  });

  it('says who owes whom, largest first, and counts the rest', () => {
    const fmt = (n: number) => String(n);
    const s = plainSummary([
      { name: 'محمود', owesCompany: -80000 }, { name: 'مشروع ألبانيا', owesCompany: 70000 },
      { name: 'عمر', owesCompany: 500 }, { name: 'صالح', owesCompany: 0 }, { name: 'سعيد', owesCompany: 100 },
    ], fmt);
    expect(s.lines).toEqual(['المنظومة عليها لـمحمود 80000', 'مشروع ألبانيا عليه للمنظومة 70000', 'عمر عليه للمنظومة 500']);
    expect(s.more).toBe(1);
  });
});

it('counts days the way they are said', () => {
  expect([1, 2, 5, 10, 11, 30].map(arabicDays)).toEqual(['يوم واحد', 'يومين', '5 أيام', '10 أيام', '11 يوماً', '30 يوماً']);
});
