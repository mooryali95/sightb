/**
 * Fixtures for the company page's component tests.
 *
 * One company with one portfolio and three projects: one inside the
 * portfolio (100,000), one standalone and active (50,000), one standalone
 * and completed (20,000). Expenses are chosen so that every sum tells what
 * it counted: the portfolio project has 10,000 approved and 3,000 rejected,
 * the standalone one 5,000 approved and a 2,000 advance still outstanding.
 * Two indirect costs, 4,000 rent and 1,000 marketing.
 */
import type { Company, Expense, IndirectCost, Portfolio, Project } from '@/types/project';

export const COMPANY_ID = 'co-1';
export const PORTFOLIO_ID = 'pf-1';

export const company: Company = {
  id: COMPANY_ID, name: 'شركة الاختبار', description: 'شركة استشارية', status: 'active', createdAt: '2026-01-01T00:00:00Z',
};

export const portfolio: Portfolio = {
  id: PORTFOLIO_ID, companyId: COMPANY_ID, name: 'محفظة الحكومة', targetRevenue: 0, targetMargin: 0,
} as Portfolio;

export function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: COMPANY_ID, name: 'مشروع', contractValue: 0, currency: 'SAR',
    startDate: '2026-01-01', endDate: '2026-12-31', durationMonths: 12, resourceCount: 1,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', percentComplete: 0,
    contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
    ...over,
  };
}

export const projects: Project[] = [
  project({ id: 'p-portfolio', portfolioId: PORTFOLIO_ID, name: 'مشروع الوزارة', contractValue: 100000, percentComplete: 40 }),
  project({ id: 'p-standalone', name: 'مشروع مستقل', contractValue: 50000, percentComplete: 10 }),
  project({ id: 'p-done', name: 'مشروع منتهي', contractValue: 20000, status: 'completed', percentComplete: 100 }),
];

export function expense(over: Partial<Expense>): Expense {
  return {
    id: 'exp', projectId: 'p-portfolio', category: 'consulting', description: 'بند', amount: 0,
    date: '2026-02-10', month: 2, approvalStatus: 'approved', isVatExempt: false, responsible: 'أحمد',
    ...over,
  };
}

export const expenses: Expense[] = [
  expense({ id: 'e-1', amount: 10000, description: 'استشارة' }),
  expense({ id: 'e-rejected', amount: 3000, description: 'مرفوض', approvalStatus: 'rejected' }),
  expense({ id: 'e-2', projectId: 'p-standalone', amount: 5000, description: 'تصميم' }),
  expense({ id: 'e-advance', projectId: 'p-standalone', amount: 2000, description: 'سلفة قائمة', isOutstandingAdvance: true }),
];

export const indirectCosts: IndirectCost[] = [
  { id: 'ic-rent', companyId: COMPANY_ID, category: 'rent', description: 'إيجار المكتب', amount: 4000, month: 1, date: '2026-01-05', allocationMethod: 'equal', createdAt: '2026-01-05T00:00:00Z' },
  { id: 'ic-marketing', companyId: COMPANY_ID, category: 'marketing', description: 'حملة إعلانية', amount: 1000, month: 2, date: '2026-02-05', allocationMethod: 'equal', createdAt: '2026-02-05T00:00:00Z' },
];
