import { describe, it, expect } from 'vitest';
import { summarizeParty } from '../party-summary';
import type { CompanyExpense } from '@/lib/finance/company-ledger';

/**
 * Dr Saleh's page, from the live figures of 26 October: what Albania paid him
 * (the 10,000 of which 7,900 settled Manzouma's bills he paid, and 2,100 his
 * incentive) plus his tickets, and the company's side: 7,900 he paid for it.
 */
const SALEH = 'saleh';
const exp = (id: string, projectId: string, amount: number, category: string, date: string, over: Record<string, unknown> = {}) =>
  ({ id, projectId, amount, category, date, description: id, approvalStatus: 'approved', partyId: SALEH, month: 1, ...over });
const projects = [{ id: 'alb', name: 'تبوك' }, { id: 'hack', name: 'الملتقى' }];
const companyExpenses: CompanyExpense[] = [
  { id: 'c1', companyId: 'co', date: '2026-08-06', amount: 4611, description: 'مصروفات منظومة', kind: 'government', partyId: null, paidByPartyId: SALEH },
  { id: 'c2', companyId: 'co', date: '2026-10-07', amount: 3289, description: 'التزام سابق', kind: 'other', partyId: null, paidByPartyId: SALEH },
];

describe('summarizeParty', () => {
  const s = summarizeParty(SALEH, {
    expenses: [
      exp('repay', 'alb', 7900, 'other', '2026-10-07'),
      exp('incentive', 'alb', 2100, 'salary', '2026-10-07'),
      exp('ticket', 'alb', 516.24, 'travel', '2026-07-02'),
      exp('rejected', 'alb', 999, 'other', '2026-07-02', { approvalStatus: 'rejected' }),
      exp('someone-else', 'hack', 5000, 'salary', '2026-01-01', { partyId: 'anwar' }),
    ],
    projects, companyExpenses, entries: [],
  });

  it('adds up what every project paid them, leaving out rejected rows and other people', () => {
    expect(s.paidByProjects).toBe(10516.24);
    expect(s.byProject).toEqual([{ projectId: 'alb', name: 'تبوك', total: 10516.24, count: 3 }]);
  });

  it('splits it by kind of spend, biggest first', () => {
    expect(s.byCategory.map((c) => [c.category, c.total])).toEqual([['other', 7900], ['salary', 2100], ['travel', 516.24]]);
  });

  it('shows what they paid for the company from their own pocket, and what the company owes them for it', () => {
    expect(s.paidForCompany).toBe(7900);
    // Out of pocket counts as money from them to the company: the company owes them 7,900 until a repayment is entered.
    expect(s.companyOwesThem).toBe(7900);
  });

  it('lists every row newest first (the larger first on the same day), with the project it came from', () => {
    expect(s.rows.map((r) => r.id)).toEqual(['repay', 'c2', 'incentive', 'c1', 'ticket']);
    expect(s.rows[0]).toMatchObject({ source: 'project', projectName: 'تبوك', amount: 7900 });
    expect(s.rows[1]).toMatchObject({ source: 'company', amount: 3289, paidByThem: true });
  });
});
