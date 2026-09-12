/**
 * Page tests for creating a project, written before the page is split.
 *
 * What costs money here is what the project row is created with: the
 * contract value (net of VAT when the entered figure included it), the
 * VAT rate, and the defaults. Every later figure in the app derives from
 * these.
 *
 * One test was red when written: a VAT rate of 0 was read as "missing"
 * and replaced by 15, so a VAT-free project was created at 15% (the same
 * `|| 15` family fixed in the export library in #41). The fix commit that
 * follows turns it green without editing a test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore, type AppState } from '@/store/useStore';
import type { Company, Portfolio } from '@/types/project';
import NewProject from '../NewProject';

const roleState = { isAdmin: false, editable: new Set<string>() };
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    roles: [], isAdmin: roleState.isAdmin, isOwner: false, isScopedAdmin: roleState.isAdmin,
    isAdminFor: () => roleState.isAdmin, canEdit: (_scope: string, id: string) => roleState.editable.has(id),
    hasAccess: () => true, loading: false,
  }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// The schema wants real UUIDs for the company.
const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';

const companies: Company[] = [
  { id: MINE, name: 'شركتي', status: 'active', createdAt: '' },
  { id: THEIRS, name: 'شركة غيري', status: 'active', createdAt: '' },
];
const portfolios: Portfolio[] = [
  { id: 'pf-mine', companyId: MINE, name: 'محفظة الحكومة', createdAt: '' } as Portfolio,
  { id: 'pf-theirs', companyId: THEIRS, name: 'محفظة أخرى', createdAt: '' } as Portfolio,
];

const addProject = vi.fn().mockResolvedValue('p-new');

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/projects/new${search}`]}>
      <Routes>
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/" element={<div>لوحة التحكم</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The Radix Select trigger showing this text (the hidden native select repeats it). */
function triggerShowing(shown: string): HTMLElement {
  const trigger = screen.getAllByText(shown).map((el) => el.closest('button')).find(Boolean);
  if (!trigger) throw new Error(`no select shows "${shown}"`);
  return trigger as HTMLElement;
}

/** Drives a Radix Select by the text its trigger currently shows. */
function pick(shown: string, option: RegExp) {
  fireEvent.keyDown(triggerShowing(shown), { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
}

const nameInput = () => screen.getByPlaceholderText(/مشروع الرواد/);
const contractInput = () => screen.getByPlaceholderText('230,000');
/** The VAT rate field: the third number input, after the contract value and the retention. */
const vatInput = () => screen.getAllByRole('spinbutton')[2];
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'إنشاء المشروع' }));
const today = () => new Date().toISOString().split('T')[0];

beforeEach(() => {
  addProject.mockClear();
  vi.mocked(toast.error).mockClear();
  roleState.isAdmin = false;
  roleState.editable = new Set([MINE]);
  useStore.setState({ companies, portfolios, addProject } satisfies Partial<AppState>);
});

describe('who and where', () => {
  it('offers only the companies the user can edit, and that company\'s portfolios', () => {
    renderPage();
    fireEvent.keyDown(triggerShowing('اختر الشركة'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'شركتي' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'شركة غيري' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('option', { name: 'شركتي' }), { key: 'Enter' });

    pick('بدون محفظة (مشروع مستقل)', /محفظة الحكومة/);
    expect(screen.queryByRole('option', { name: 'محفظة أخرى' })).not.toBeInTheDocument();
  });

  it('preselects the company from the address and refuses a contract of nothing', async () => {
    renderPage(`?company=${MINE}`);
    expect(triggerShowing('شركتي')).toHaveTextContent('شركتي');
    fireEvent.change(nameInput(), { target: { value: 'مشروع' } });
    fireEvent.change(contractInput(), { target: { value: '0' } });
    submit();
    expect(addProject).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('قيمة العقد يجب أن تكون أكبر من صفر');

    fireEvent.change(contractInput(), { target: { value: '1000' } });
    submit();
    await waitFor(() => expect(addProject).toHaveBeenCalledTimes(1));
  });
});

describe('what the project is created with', () => {
  it('creates a planning project with the entered contract, the VAT rate, and the defaults, then goes home', async () => {
    renderPage(`?company=${MINE}`);
    fireEvent.change(nameInput(), { target: { value: '  مشروع الوزارة  ' } });
    fireEvent.change(contractInput(), { target: { value: '200000' } });
    submit();

    await waitFor(() => expect(addProject).toHaveBeenCalledTimes(1));
    expect(addProject).toHaveBeenCalledWith({
      name: 'مشروع الوزارة', description: undefined, companyId: MINE, portfolioId: undefined,
      contractValue: 200000, currency: 'SAR', startDate: today(), endDate: '', durationMonths: 4, resourceCount: 1,
      status: 'planning', percentComplete: 0, contractType: 'lump_sum', retentionPercent: 0, managementReserve: 0,
      taxPercent: 15, vatInclusive: false,
    });
    expect(await screen.findByText('لوحة التحكم')).toBeInTheDocument();
  });

  it('strips the VAT from a figure entered inclusive, and previews the split', async () => {
    renderPage(`?company=${MINE}`);
    fireEvent.change(nameInput(), { target: { value: 'مشروع' } });
    fireEvent.change(contractInput(), { target: { value: '230000' } });
    fireEvent.click(screen.getByRole('button', { name: 'شاملة الضريبة' }));
    expect(screen.getByText(/قيمة العقد \(شاملة الضريبة\)/)).toBeInTheDocument();
    expect(screen.getByText('بدون ضريبة:').nextElementSibling).toHaveTextContent('200,000.00 ر.س');
    expect(screen.getByText('الضريبة (15%):').nextElementSibling).toHaveTextContent('30,000.00 ر.س');
    expect(screen.getByText('شامل الضريبة:').nextElementSibling).toHaveTextContent('230,000.00 ر.س');
    submit();
    await waitFor(() => expect(addProject).toHaveBeenCalledWith(expect.objectContaining({ contractValue: 200000, taxPercent: 15 })));
  });

  it('keeps a VAT-free project at 0%, with no VAT toggle to show', async () => {
    renderPage(`?company=${MINE}`);
    fireEvent.change(nameInput(), { target: { value: 'مشروع معفى' } });
    fireEvent.change(contractInput(), { target: { value: '100000' } });
    fireEvent.change(vatInput(), { target: { value: '0' } });
    expect(screen.queryByRole('button', { name: 'شاملة الضريبة' })).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(addProject).toHaveBeenCalledTimes(1));
    expect(addProject).toHaveBeenCalledWith(expect.objectContaining({ contractValue: 100000, taxPercent: 0 }));
  });

  it('carries the chosen type, retention, duration, resources and dates', async () => {
    renderPage(`?company=${MINE}`);
    fireEvent.change(nameInput(), { target: { value: 'مشروع' } });
    fireEvent.change(contractInput(), { target: { value: '50000' } });
    pick('مبلغ مقطوع', /تكلفة \+ هامش/);
    const [, retention, , duration, resources] = screen.getAllByRole('spinbutton');
    fireEvent.change(retention, { target: { value: '5' } });
    fireEvent.change(duration, { target: { value: '9' } });
    fireEvent.change(resources, { target: { value: '3' } });
    const [start, end] = Array.from(document.querySelectorAll('input[type="date"]'));
    fireEvent.change(start, { target: { value: '2026-10-01' } });
    fireEvent.change(end, { target: { value: '2027-06-30' } });
    submit();
    await waitFor(() => expect(addProject).toHaveBeenCalledWith(expect.objectContaining({
      contractType: 'cost_plus', retentionPercent: 5, durationMonths: 9, resourceCount: 3, startDate: '2026-10-01', endDate: '2027-06-30',
    })));
  });

  it('reports a failed create and stays on the page', async () => {
    addProject.mockRejectedValueOnce(new Error('boom'));
    renderPage(`?company=${MINE}`);
    fireEvent.change(nameInput(), { target: { value: 'مشروع' } });
    fireEvent.change(contractInput(), { target: { value: '1000' } });
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('حدث خطأ، يرجى المحاولة مرة أخرى'));
    expect(screen.getByRole('button', { name: 'إنشاء المشروع' })).toBeEnabled();
    expect(within(document.body).queryByText('لوحة التحكم')).not.toBeInTheDocument();
  });
});
