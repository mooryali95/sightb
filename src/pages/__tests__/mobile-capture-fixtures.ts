/**
 * Fixtures for the mobile expense capture page's component tests.
 *
 * Two active projects. The first starts in March, runs six months, carries
 * 5% VAT and has a 3,000 fund with 2,500 already spent, so 500 is left. The
 * second carries 15% VAT and has no fund at all. An archived third project
 * must not be offered.
 */
import type { Expense, Project, ProjectFund } from '@/types/project';

export const PROJECT_ID = 'p-1';
export const NO_FUND_PROJECT_ID = 'p-2';
export const FUND_ID = 'fund-1';

export function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: 'co-1', name: 'مشروع', contractValue: 100000, currency: 'SAR',
    startDate: '2026-03-01', endDate: '2026-08-31', durationMonths: 6, resourceCount: 1,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', percentComplete: 0,
    contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
    ...over,
  };
}

export const projects: Project[] = [
  project({ id: PROJECT_ID, name: 'مشروع الوزارة', taxPercent: 5 }),
  project({ id: NO_FUND_PROJECT_ID, name: 'مشروع بلا دفعة' }),
  project({ id: 'p-archived', name: 'مشروع مؤرشف', status: 'archived' }),
];

export const fund: ProjectFund = {
  id: FUND_ID, projectId: PROJECT_ID, fundNumber: 1, amount: 3000, transferDate: '2026-03-01',
  status: 'acknowledged', acknowledgedAt: '2026-03-02T00:00:00Z', createdBy: 'user-1',
  createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-02T00:00:00Z',
};

export const expenses: Expense[] = [
  {
    id: 'e-1', projectId: PROJECT_ID, category: 'other', description: 'سابق', amount: 2500, date: '2026-03-10', month: 1,
    approvalStatus: 'approved', isVatExempt: false, fundId: FUND_ID,
  },
];
