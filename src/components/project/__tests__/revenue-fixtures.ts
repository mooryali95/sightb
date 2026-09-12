/**
 * Fixtures for the revenue section's component tests.
 *
 * Four revenues on one project, one per state the section reports on:
 * 10,000 still planned, 20,000 invoiced and not yet collected, 30,000
 * collected, and 5,000 collected against a milestone. The collected figure
 * is deliberately larger than the invoiced one, because the card that
 * reports what is still uncollected once subtracted one from the other.
 */
import type { Milestone, Revenue } from '@/types/project';

export const PROJECT_ID = 'project-under-test';
export const MILESTONE_ID = 'ms-design';

export const milestone: Milestone = {
  id: MILESTONE_ID,
  projectId: PROJECT_ID,
  name: 'تسليم التصميم',
  sortOrder: 1,
  percentComplete: 50,
  weight: 0.3,
  status: 'in_progress',
  createdAt: '2026-01-01T00:00:00Z',
};

export function revenue(over: Partial<Revenue> = {}): Revenue {
  return {
    id: 'rev',
    projectId: PROJECT_ID,
    description: 'إيراد',
    amount: 0,
    date: '2026-02-10',
    month: 2,
    revenueType: 'milestone',
    status: 'collected',
    ...over,
  };
}

export const revenues: Revenue[] = [
  revenue({
    id: 'rev-planned', amount: 10000, description: 'دفعة ختامية مخططة',
    status: 'planned', revenueType: 'final', month: 6, date: '2026-06-01',
  }),
  revenue({
    id: 'rev-invoiced', amount: 20000, description: 'فاتورة المرحلة الأولى',
    status: 'invoiced', month: 3, date: '2026-03-01', invoiceNumber: 'INV-1', invoiceDate: '2026-03-01',
  }),
  revenue({
    id: 'rev-collected', amount: 30000, description: 'الدفعة المقدمة',
    status: 'collected', revenueType: 'advance', month: 1, date: '2026-01-05',
    invoiceNumber: 'INV-0', invoiceDate: '2026-01-05', collectionDate: '2026-01-20',
  }),
  revenue({
    id: 'rev-linked', amount: 5000, description: 'دفعة تسليم التصميم',
    status: 'collected', milestoneId: MILESTONE_ID,
  }),
];
