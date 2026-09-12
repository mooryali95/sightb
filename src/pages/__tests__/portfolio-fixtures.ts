/**
 * Fixtures for the portfolio page's component tests.
 *
 * One portfolio with two projects: 100,000 active and 40% complete, and
 * 50,000 on hold and 20% complete (which makes it critical). The active
 * project has 10,000 approved in month 2, 3,000 rejected in month 2 and a
 * 2,000 advance still outstanding; the on-hold one has 5,000 approved in
 * month 1. One 30,000 collected revenue against a 100,000 target. Two
 * risks in scope (one on a project, one on the portfolio) and one on a
 * project outside it.
 */
import type { Company, Expense, Portfolio, Project, Revenue, Risk } from '@/types/project';

export const COMPANY_ID = 'co-1';
export const PORTFOLIO_ID = 'pf-1';

export const company: Company = {
  id: COMPANY_ID, name: 'شركة الاختبار', status: 'active', createdAt: '2026-01-01T00:00:00Z',
};

export const portfolio: Portfolio = {
  id: PORTFOLIO_ID, companyId: COMPANY_ID, name: 'محفظة الحكومة', description: 'عقود حكومية',
  targetRevenue: 100000, targetMargin: 20, fiscalYear: '2026', createdAt: '2026-01-01T00:00:00Z',
};

export function project(over: Partial<Project>): Project {
  return {
    id: 'p', companyId: COMPANY_ID, portfolioId: PORTFOLIO_ID, name: 'مشروع', contractValue: 0, currency: 'SAR',
    startDate: '2026-01-01', endDate: '2026-06-30', durationMonths: 6, resourceCount: 1,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', percentComplete: 0,
    contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false,
    ...over,
  };
}

export const projects: Project[] = [
  project({ id: 'p-active', name: 'مشروع الوزارة', contractValue: 100000, percentComplete: 40 }),
  project({ id: 'p-held', name: 'مشروع البلدية', contractValue: 50000, percentComplete: 20, status: 'on-hold' }),
  project({ id: 'p-elsewhere', portfolioId: undefined, name: 'مشروع خارج المحفظة', contractValue: 10000 }),
];

export function expense(over: Partial<Expense>): Expense {
  return {
    id: 'exp', projectId: 'p-active', category: 'consulting', description: 'بند', amount: 0,
    date: '2026-02-10', month: 2, approvalStatus: 'approved', isVatExempt: false, responsible: 'أحمد',
    ...over,
  };
}

export const expenses: Expense[] = [
  expense({ id: 'e-1', amount: 10000, description: 'استشارة' }),
  expense({ id: 'e-rejected', amount: 3000, description: 'مرفوض', approvalStatus: 'rejected' }),
  expense({ id: 'e-advance', amount: 2000, description: 'سلفة قائمة', isOutstandingAdvance: true }),
  expense({ id: 'e-2', projectId: 'p-held', amount: 5000, description: 'تصميم', month: 1, date: '2026-01-15' }),
];

export const revenues: Revenue[] = [
  { id: 'r-1', projectId: 'p-active', description: 'دفعة أولى', amount: 30000, date: '2026-02-01', month: 2, revenueType: 'advance', status: 'collected' },
];

export const risks: Risk[] = [
  { id: 'risk-project', projectId: 'p-active', title: 'تأخر التوريد', probability: 'high', impact: 'medium', financialImpact: 8000, category: 'schedule', status: 'open', createdAt: '2026-02-01T00:00:00Z' } as Risk,
  { id: 'risk-portfolio', portfolioId: PORTFOLIO_ID, title: 'تغير التشريعات', probability: 'low', impact: 'high', financialImpact: 20000, category: 'external', status: 'mitigating', createdAt: '2026-02-01T00:00:00Z' } as Risk,
  { id: 'risk-elsewhere', projectId: 'p-elsewhere', title: 'خطر خارج المحفظة', probability: 'low', impact: 'low', financialImpact: 100, category: 'financial', status: 'open', createdAt: '2026-02-01T00:00:00Z' } as Risk,
];
