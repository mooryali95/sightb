/**
 * Component tests for the app sidebar, written before it is split. What is
 * pinned: the links each role gets; the tree of active companies, their
 * portfolios and projects with the finished ones behind a toggle; the
 * add buttons for an editor; the inline search that opens the matching
 * branches and hides the rest; the collapsed rail; and signing out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Company, Portfolio, Project } from '@/types/project';
import { useStore, type AppState } from '@/store/useStore';
import { AppSidebar } from '../AppSidebar';

const roleState = { isAdmin: false, isOwner: false, canEdit: false };
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isAdmin: roleState.isAdmin, isOwner: roleState.isOwner, canEdit: () => roleState.canEdit }),
}));
const signOut = vi.fn(async () => {});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', email: 'pm@example.com' }, signOut }) }));
vi.mock('@/assets/basserh-logo.jpg', () => ({ default: 'logo.jpg' }));

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const companies = fixture<Company>([
  { id: 'c1', name: 'شركة الأفق', status: 'active' },
  { id: 'c2', name: 'شركة قديمة', status: 'archived' },
]);
const portfolios = fixture<Portfolio>([{ id: 'pf1', companyId: 'c1', name: 'محفظة الرياض' }]);
const projects = fixture<Project>([
  { id: 'p1', companyId: 'c1', name: 'مشروع الجسر', status: 'active' },
  { id: 'p2', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع النفق', status: 'planning' },
  { id: 'p3', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع الميناء', status: 'completed' },
  { id: 'p4', companyId: 'c1', name: 'مشروع قديم', status: 'archived' },
  { id: 'p5', companyId: 'c2', name: 'مشروع مؤرشف', status: 'active' },
]);

function Probe() {
  return <p data-testid="path">{useLocation().pathname + useLocation().search}</p>;
}
function renderSidebar(collapsed = false) {
  useStore.setState({ companies, portfolios, projects } satisfies Partial<AppState>);
  const onToggle = vi.fn();
  render(
    <MemoryRouter initialEntries={['/']}>
      <TooltipProvider>
        <AppSidebar collapsed={collapsed} onToggle={onToggle} />
      </TooltipProvider>
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </MemoryRouter>,
  );
  return { onToggle };
}
const path = () => screen.getByTestId('path').textContent;
const nav = () => screen.getByRole('navigation');
const expandButtons = () => within(nav()).getAllByRole('button', { name: 'توسيع' });
const has = (text: string) => within(nav()).queryByText(text) !== null;
const addCompanyButton = () => within(nav()).getByText('الشركات').parentElement!.querySelector('button');

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleState.isAdmin = false;
    roleState.isOwner = false;
    roleState.canEdit = false;
  });

  it('shows the user links an admin gets and the audit link an owner gets, and navigates on a click', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'لوحة التحكم' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مركز التنبيهات' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إدارة المستخدمين' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'السجل الرئيسي' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'مركز التنبيهات' }));
    expect(path()).toBe('/alerts');

    roleState.isAdmin = true;
    roleState.isOwner = true;
    fireEvent.click(screen.getByRole('button', { name: 'لوحة التحكم' }));
    expect(screen.getByRole('button', { name: 'إدارة المستخدمين' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السجل الرئيسي' })).toBeInTheDocument();
    fireEvent.click(addCompanyButton() as HTMLElement);
    expect(path()).toBe('/companies/new');
  });

  it('lists the active companies, opens a company to its live projects and portfolios, keeps the finished ones behind a toggle, and offers the add buttons to an editor', () => {
    roleState.canEdit = true;
    renderSidebar();
    expect(has('شركة الأفق')).toBe(true);
    expect(has('شركة قديمة')).toBe(false);
    expect(has('مشروع الجسر')).toBe(false);

    fireEvent.click(expandButtons()[0]);
    expect(has('مشروع الجسر')).toBe(true);
    expect(has('محفظة الرياض')).toBe(true);
    expect(has('مشروع النفق')).toBe(false);
    expect(has('مشروع قديم')).toBe(false);
    expect(has('مشروع مؤرشف')).toBe(false);
    expect(has('مشروع مستقل')).toBe(true);
    expect(has('محفظة جديدة')).toBe(true);

    fireEvent.click(within(nav()).getByText('عرض المنتهية (2)'));
    expect(has('مشروع قديم')).toBe(true);
    expect(within(nav()).getByText('مشروع قديم').closest('button')).toHaveTextContent('مؤرشف');
    expect(has('إخفاء المنتهية')).toBe(true);

    fireEvent.click(expandButtons()[0]);
    expect(has('مشروع النفق')).toBe(true);
    expect(has('مشروع الميناء')).toBe(true);
    expect(has('مشروع جديد')).toBe(true);
    fireEvent.click(within(nav()).getByText('مشروع جديد'));
    expect(path()).toBe('/project/new?portfolio=pf1&company=c1');
    fireEvent.click(within(nav()).getByText('مشروع النفق'));
    expect(path()).toBe('/project/p2');
  });

  it('hides the add buttons from a viewer', () => {
    renderSidebar();
    fireEvent.click(expandButtons()[0]);
    expect(has('مشروع مستقل')).toBe(false);
    expect(has('محفظة جديدة')).toBe(false);
    expect(addCompanyButton()).toBeNull();
  });

  it('opens the branches a search matches, hides the rest and the add buttons, clears, and says when nothing matches', () => {
    roleState.canEdit = true;
    renderSidebar();
    const input = screen.getByLabelText('بحث في القائمة الجانبية');
    fireEvent.change(input, { target: { value: ' النفق ' } });
    expect(has('شركة الأفق')).toBe(true);
    expect(has('محفظة الرياض')).toBe(true);
    expect(has('مشروع النفق')).toBe(true);
    expect(has('مشروع الجسر')).toBe(false);
    expect(has('مشروع مستقل')).toBe(false);
    expect(has('مشروع جديد')).toBe(false);
    expect(has('عرض المنتهية (2)')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }));
    expect(input).toHaveValue('');
    expect(has('مشروع النفق')).toBe(false);

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(within(nav()).getByText('لا توجد نتائج مطابقة لـ "zzz"')).toBeInTheDocument();
    expect(has('شركة الأفق')).toBe(false);
  });

  it('shows a finished project the search names, under its portfolio or its company', () => {
    renderSidebar();
    const input = screen.getByLabelText('بحث في القائمة الجانبية');
    fireEvent.change(input, { target: { value: 'الميناء' } });
    expect(has('محفظة الرياض')).toBe(true);
    expect(has('مشروع الميناء')).toBe(true);
    fireEvent.change(input, { target: { value: 'قديم' } });
    expect(has('شركة الأفق')).toBe(true);
    expect(has('مشروع قديم')).toBe(true);
  });

  it('collapses to a rail that keeps the links by their labels, drops the tree and the search, and still signs out', async () => {
    const { onToggle } = renderSidebar(true);
    expect(screen.getByRole('button', { name: 'لوحة التحكم' })).toBeInTheDocument();
    expect(screen.queryByLabelText('بحث في القائمة الجانبية')).not.toBeInTheDocument();
    expect(has('شركة الأفق')).toBe(false);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await screen.findByText('/login');
  });
});
