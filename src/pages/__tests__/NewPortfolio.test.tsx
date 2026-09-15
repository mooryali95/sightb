/**
 * Component tests for the new-portfolio page. What must hold: the company
 * list offers only the companies the user may edit, a company in the URL
 * is preselected, bad input never reaches the store, and a good form adds
 * the portfolio with zeroed targets and goes home.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Company } from '@/types/project';
import NewPortfolio from '../NewPortfolio';

const roles = vi.hoisted(() => ({ isAdmin: false, canEdit: (_t: string, id: string) => id === 'c-editable' }));
vi.mock('@/hooks/useRole', () => ({ useRole: () => roles }));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const UUID = '3f2c9a1e-1b2d-4c3e-8f4a-5b6c7d8e9f00';
const companies = [
  { id: 'c-editable', name: 'شركة أحرّرها', status: 'active', createdAt: '' } as Company,
  { id: 'c-readonly', name: 'شركة أقرؤها', status: 'active', createdAt: '' } as Company,
];
const addPortfolio = vi.fn(async () => 'pf-new');

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
const renderPage = (search = '') => render(
  <MemoryRouter initialEntries={[`/portfolio/new${search}`]}>
    <Routes>
      <Route path="/portfolio/new" element={<NewPortfolio />} />
      <Route path="/" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
);
const openCompanies = () => fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
const submit = () => fireEvent.submit(screen.getByPlaceholderText('مثال: مشاريع التطوير التربوي').closest('form') as HTMLFormElement);

beforeEach(() => {
  vi.clearAllMocks();
  roles.isAdmin = false;
  useStore.setState({ companies, addPortfolio } as Partial<AppState>);
});

describe('NewPortfolio', () => {
  it('offers only the companies the user may edit, and every company to an admin', () => {
    renderPage();
    openCompanies();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['شركة أحرّرها']);

    roles.isAdmin = true;
    const admin = render(<MemoryRouter><NewPortfolio /></MemoryRouter>);
    fireEvent.keyDown(admin.getAllByRole('combobox').at(-1) as HTMLElement, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['شركة أحرّرها', 'شركة أقرؤها']);
  });

  it('preselects the company named in the URL', () => {
    renderPage('?company=c-editable');
    expect(screen.getByRole('combobox')).toHaveTextContent('شركة أحرّرها');
  });

  it('refuses a form without a chosen company or a name before reaching the store', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('مثال: مشاريع التطوير التربوي'), { target: { value: 'محفظة' } });
    submit();
    expect(toast.error).toHaveBeenCalledWith('يرجى اختيار الشركة');
    expect(addPortfolio).not.toHaveBeenCalled();
  });

  it('adds the portfolio with zeroed targets and the description only when given, then goes home', async () => {
    useStore.setState({ companies: [{ id: UUID, name: 'الشركة', status: 'active', createdAt: '' } as Company] });
    roles.isAdmin = true;
    renderPage(`?company=${UUID}`);
    fireEvent.change(screen.getByPlaceholderText('مثال: مشاريع التطوير التربوي'), { target: { value: '  محفظة التعليم ' } });
    submit();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
    expect(addPortfolio).toHaveBeenCalledWith({ name: 'محفظة التعليم', companyId: UUID, description: undefined, targetRevenue: 0, targetMargin: 0 });
  });

  it('stays on the page with an error when the store refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    addPortfolio.mockRejectedValueOnce(new Error('RLS'));
    useStore.setState({ companies: [{ id: UUID, name: 'الشركة', status: 'active', createdAt: '' } as Company] });
    roles.isAdmin = true;
    renderPage(`?company=${UUID}`);
    fireEvent.change(screen.getByPlaceholderText('مثال: مشاريع التطوير التربوي'), { target: { value: 'محفظة' } });
    fireEvent.change(screen.getByPlaceholderText('وصف المحفظة'), { target: { value: 'وصف' } });
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('حدث خطأ، يرجى المحاولة مرة أخرى'));
    expect(addPortfolio).toHaveBeenCalledWith(expect.objectContaining({ description: 'وصف' }));
    expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة المحفظة' })).toBeEnabled();
  });
});
