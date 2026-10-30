import { describe, it, expect } from 'vitest';
import { checkIntegrity, type IntegrityInput } from '../integrity';
import type { Custody, Expense, FundSettlement, Project, ProjectFund, ResourceReimbursement, Revenue } from '@/types/project';

const P = 'p1';
const project = (status = 'active') => ({ id: P, name: 'ألبانيا', status } as Project);
const exp = (over: Partial<Expense>): Expense => ({ id: Math.random().toString(), projectId: P, category: 'other', description: 'x', amount: 100, date: '2026-05-01', month: 1, approvalStatus: 'approved', isVatExempt: true, ...over } as Expense);
const fund = (over: Partial<ProjectFund> = {}): ProjectFund => ({ id: 'f1', projectId: P, fundNumber: 1, amount: 1000, transferDate: '2026-04-01', status: 'acknowledged', createdBy: 'u', createdAt: 'c', updatedAt: 'u', ...over });
const base = (over: Partial<IntegrityInput> = {}): IntegrityInput => ({
  projects: [project()], expenses: [], custodies: [], funds: [fund()], settlements: [], revenues: [], reimbursements: [],
  contractOf: () => 10000, ...over,
});
const rules = (i: IntegrityInput) => checkIntegrity(i).map((x) => x.rule);

describe('checkIntegrity', () => {
  it('is clean when every amount has a source and every balance closes', () => {
    expect(checkIntegrity(base({ expenses: [exp({ fundId: 'f1' })] }))).toEqual([]);
  });

  it('flags an amount with no source once the project works with funds, but not one from before them', () => {
    expect(rules(base({ expenses: [exp({ description: 'حفل' })] }))).toEqual(['no_source']);
    expect(rules(base({ expenses: [exp({ date: '2026-01-01' })] }))).toEqual([]);
    expect(rules(base({ funds: [], expenses: [exp({})] }))).toEqual([]);
  });

  it('flags the same amount, day and description twice, but not a rejected copy', () => {
    const twice = [exp({ fundId: 'f1' }), exp({ fundId: 'f1' })];
    expect(checkIntegrity(base({ expenses: twice }))).toEqual([expect.objectContaining({ rule: 'duplicate', amount: 100 })]);
    expect(rules(base({ expenses: [twice[0], { ...twice[1], approvalStatus: 'rejected' }] }))).toEqual([]);
  });

  it('flags a fund or custody spent past what it holds', () => {
    expect(rules(base({ expenses: [exp({ fundId: 'f1', amount: 1200 })] }))).toEqual(['fund_over']);
    const c = { id: 'c1', projectId: P, resourceName: 'عمر', amount: 50, status: 'active' } as Custody;
    expect(rules(base({ custodies: [c], expenses: [exp({ custodyId: 'c1', amount: 80 })] }))).toContain('custody_over');
  });

  it('flags cash still held once the project has finished', () => {
    const c = { id: 'c1', projectId: P, resourceName: 'عمر', amount: 50, status: 'active' } as Custody;
    const found = checkIntegrity(base({ projects: [project('completed')], funds: [fund({ status: 'settled' })], custodies: [c] }));
    expect(found).toEqual([expect.objectContaining({ rule: 'cash_left_finished', amount: 50 })]);
  });

  it('keeps a finished project\'s books open until its settlements are approved', () => {
    const s = { id: 's', fundId: 'f1', projectId: P, status: 'draft', difference: 0, remainingCash: 0 } as FundSettlement;
    expect(rules(base({ projects: [project('completed')], settlements: [s] }))).toContain('settlement_pending_finished');
    expect(rules(base({ projects: [project('completed')], settlements: [{ ...s, status: 'approved' }] }))).not.toContain('settlement_pending_finished');
    expect(rules(base({ settlements: [s] }))).not.toContain('settlement_pending_finished');
  });

  it('names a collected revenue that has no collection date', () => {
    const rev = { id: 'r', projectId: P, amount: 6000, status: 'collected', description: 'دفعة أخيرة' } as Revenue;
    expect(checkIntegrity(base({ revenues: [rev] }))).toEqual([expect.objectContaining({ rule: 'collected_no_date', amount: 6000, severity: 'warning' })]);
    expect(rules(base({ revenues: [{ ...rev, collectionDate: '2026-07-02' }] }))).toEqual([]);
  });

  it('flags a settlement gap with no reason, and more collected than the contract', () => {
    const s = { id: 's', fundId: 'f1', projectId: P, status: 'approved', difference: 3211, remainingCash: 0 } as FundSettlement;
    expect(rules(base({ settlements: [s] }))).toEqual(['gap_no_reason']);
    expect(rules(base({ settlements: [{ ...s, differenceReason: 'غير موثّقة' }] }))).toEqual([]);
    const rev = { id: 'r', projectId: P, amount: 10500, status: 'collected', collectionDate: '2026-05-01' } as Revenue;
    expect(checkIntegrity(base({ revenues: [rev] }))).toEqual([expect.objectContaining({ rule: 'revenue_over_contract', amount: 500 })]);
    expect(checkIntegrity(base({ projects: [project('archived')], funds: [], revenues: [rev] }))[0].severity).toBe('info');
  });

  it('keeps what is owed to people in view, errors first', () => {
    const owed = { id: 'rb', projectId: P, status: 'approved', amount: 1059.16, description: 'سكن' } as ResourceReimbursement;
    expect(rules(base({ reimbursements: [owed], expenses: [exp({})] }))).toEqual(['no_source', 'owed']);
  });
});
