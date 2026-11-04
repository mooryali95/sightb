/**
 * The central financial screen counts "active" and "needs attention" by the
 * dashboard's rules, and its search ignores Arabic spelling variants.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useStore, type AppState } from '@/store/useStore';
import type { BudgetItem, Company, Expense, Project } from '@/types/project';
import FinancialOverview from '../FinancialOverview';

vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined, useDetailsData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const project = (over: Partial<Project>): Project => ({
  id: 'p', companyId: 'c1', name: 'مشروع', contractValue: 100000, currency: 'SAR', startDate: '2026-01-01', endDate: '2026-12-31',
  durationMonths: 12, resourceCount: 1, status: 'active', createdAt: '', percentComplete: 0, contractType: 'lump_sum',
  retentionPercent: 0, managementReserve: 0, taxPercent: 15, vatInclusive: false, ...over,
});
const budget = (projectId: string, plannedAmount: number) => ({ id: `b-${projectId}`, projectId, category: 'salary', description: '', plannedAmount, costType: 'fixed', costClass: 'direct' }) as BudgetItem;
const spent = (projectId: string, amount: number) => ({ id: `e-${projectId}`, projectId, amount, date: '2026-03-01', approvalStatus: 'approved', category: 'salary', description: '' }) as Expense;

beforeEach(() => {
  useStore.setState({
    companies: [{ id: 'c1', name: 'الأفق', status: 'active', createdAt: '' } as Company],
    portfolios: [],
    projects: [
      project({ id: 'ok', name: 'برج سليم' }),
      project({ id: 'hot', name: 'مستودع الإنارة' }),            // 95% spent
      project({ id: 'loss', name: 'مجمع الخسارة' }),              // budget above contract
      project({ id: 'hold', name: 'فيلا معلّقة', status: 'on-hold' }),
      project({ id: 'done', name: 'مدرسة منتهية', status: 'completed' }),
    ],
    budgetItems: [budget('ok', 50000), budget('hot', 50000), budget('loss', 120000), budget('hold', 10000), budget('done', 10000)],
    expenses: [spent('ok', 1000), spent('hot', 47500)],
    revenues: [], changeOrders: [], milestones: [], risks: [], indirectCosts: [],
  } as Partial<AppState>);
});

const renderPage = () => render(<MemoryRouter><TooltipProvider><FinancialOverview /></TooltipProvider></MemoryRouter>);
const kpi = (label: string) => screen.getByText(label, { exact: true }).nextElementSibling;

describe('FinancialOverview', () => {
  it('counts active projects without the finished ones, and attention by the dashboard\'s rule', () => {
    renderPage();
    expect(kpi('المشاريع النشطة')).toHaveTextContent('4');
    // Spend past 90%, a planned loss, a project on hold.
    expect(kpi('مشاريع تحتاج انتباه')).toHaveTextContent('3');
  });

  it('searches projects ignoring Arabic spelling variants', () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /المشاريع/ }));
    fireEvent.click(screen.getByRole('tab', { name: /المشاريع/ }));
    fireEvent.change(screen.getByPlaceholderText('بحث بالاسم…'), { target: { value: 'الانارة' } });
    // The name shows in the table and again in the budget bars above it.
    expect(screen.getAllByText('مستودع الإنارة').length).toBeGreaterThan(0);
    expect(screen.queryByText('برج سليم')).not.toBeInTheDocument();
  });
});
