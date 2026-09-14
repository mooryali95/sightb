/**
 * Component tests for the global search, written before it is split. What
 * is pinned is what it lists, how it narrows, and where it goes: the
 * desktop trigger and its Ctrl+K toggle, the three groups with archived
 * companies left out and each portfolio and project carrying its company,
 * the narrowing as one types, the empty state, the navigation a choice
 * performs, and the mobile sheet with its own query, its clear button and
 * its reset on close.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Company, Portfolio, Project } from '@/types/project';
import { useStore, type AppState } from '@/store/useStore';
import { GlobalSearch } from '../GlobalSearch';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
let mobile = false;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));

const fixture = <T,>(rows: Partial<T>[]): T[] => rows as T[];
const companies = fixture<Company>([
  { id: 'c1', name: 'شركة الأفق', description: 'مقاولات عامة', status: 'active' },
  { id: 'c2', name: 'شركة قديمة', status: 'archived' },
]);
const portfolios = fixture<Portfolio>([{ id: 'pf1', companyId: 'c1', name: 'محفظة الرياض' }]);
const projects = fixture<Project>([
  { id: 'p1', companyId: 'c1', name: 'مشروع الجسر' },
  { id: 'p2', companyId: 'c2', name: 'مشروع النفق' },
  { id: 'p3', companyId: 'c1', name: 'Metro Line 3' },
]);

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderSearch() {
  useStore.setState({ companies, portfolios, projects } satisfies Partial<AppState>);
  return render(
    <MemoryRouter initialEntries={['/']}>
      <GlobalSearch />
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </MemoryRouter>,
  );
}

const dialog = () => screen.getByRole('dialog');
const options = (root: HTMLElement) => within(root).getAllByRole('option').map((o) => o.textContent);

describe('GlobalSearch on desktop', () => {
  beforeEach(() => { mobile = false; });

  it('opens from the trigger or Ctrl+K and lists active companies, portfolios and projects with their company', () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: /بحث\.\.\./ }));
    const d = dialog();
    expect(within(d).getByText('الشركات')).toBeVisible();
    expect(within(d).getByText('المحافظ')).toBeVisible();
    expect(within(d).getByText('المشاريع')).toBeVisible();
    expect(options(d)).toEqual([
      'شركة الأفق— مقاولات عامة',
      'محفظة الرياضشركة الأفق',
      'مشروع الجسرشركة الأفق',
      'مشروع النفقشركة قديمة',
      'Metro Line 3شركة الأفق',
    ]);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()).then(() => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
      expect(dialog()).toBeInTheDocument();
    });
  });

  it('narrows the groups as one types, shows the empty state, and navigates on a choice', async () => {
    renderSearch();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = within(dialog()).getByPlaceholderText('ابحث عن شركة، محفظة أو مشروع...');
    fireEvent.change(input, { target: { value: 'النفق' } });
    await waitFor(() => expect(options(dialog())).toEqual(['مشروع النفقشركة قديمة']));
    expect(within(dialog()).getByText('الشركات')).not.toBeVisible();
    expect(within(dialog()).getByText('المشاريع')).toBeVisible();

    fireEvent.change(input, { target: { value: 'لا شيء هنا' } });
    await waitFor(() => expect(within(dialog()).getByText('لا توجد نتائج')).toBeInTheDocument());

    fireEvent.change(input, { target: { value: 'النفق' } });
    fireEvent.click(await within(dialog()).findByText('مشروع النفق'));
    expect(screen.getByTestId('path')).toHaveTextContent('/project/p2');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('GlobalSearch on mobile', () => {
  beforeEach(() => { mobile = true; });

  it('opens a sheet whose query narrows every group by name regardless of case, clears, and reports no results', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    const sheet = dialog();
    expect(within(sheet).getByText('بحث سريع')).toBeInTheDocument();
    expect(options(sheet)).toEqual(['شركة الأفق', 'محفظة الرياضشركة الأفق', 'مشروع الجسرشركة الأفق', 'مشروع النفقشركة قديمة', 'Metro Line 3شركة الأفق']);
    const input = within(sheet).getByPlaceholderText('ابحث عن شركة، محفظة أو مشروع...');

    fireEvent.change(input, { target: { value: ' الرياض ' } });
    expect(options(sheet)).toEqual(['محفظة الرياضشركة الأفق']);
    expect(within(sheet).queryByText('الشركات')).toBeNull();
    expect(within(sheet).queryByText('المشاريع')).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'مسح' }));
    expect(input).toHaveValue('');
    expect(options(sheet)).toHaveLength(5);

    fireEvent.change(input, { target: { value: 'METRO' } });
    expect(options(sheet)).toEqual(['Metro Line 3شركة الأفق']);

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(within(sheet).getByText('لا توجد نتائج')).toBeInTheDocument();
  });

  it('navigates on a choice, closes, and forgets the query for the next opening', async () => {
    renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    const input = within(dialog()).getByPlaceholderText('ابحث عن شركة، محفظة أو مشروع...');
    fireEvent.change(input, { target: { value: 'الأفق' } });
    fireEvent.click(within(dialog()).getByText('شركة الأفق'));
    expect(screen.getByTestId('path')).toHaveTextContent('/company/c1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    expect(within(dialog()).getByPlaceholderText('ابحث عن شركة، محفظة أو مشروع...')).toHaveValue('');
    expect(within(dialog()).getByText('مشروع النفق')).toBeInTheDocument();
  });
});
