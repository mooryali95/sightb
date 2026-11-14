/**
 * «خريطة المنظومة»: four designed states (loading, no projects, ledger not
 * live, full), a status symbol on every project, the flows between the
 * company and each project, and what belongs to whom.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CompanyMap } from '../CompanyMap';
import type { MapProjectInput } from '@/lib/finance/company-map';
import type { IntercompanyEntry } from '@/lib/finance/company-ledger';

const p = (id: string, name: string, over: Partial<MapProjectInput> = {}): MapProjectInput => ({
  id, name, group: 'المحفظة السكنية', status: 'active', contract: 100000, planned: 80000, actual: 20000, collected: 0, ...over,
});
const move = (id: string, from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number, type: IntercompanyEntry['type'] = 'advance'): IntercompanyEntry => ({
  id, companyId: 'c', date: '2026-10-01', amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});
const C = { kind: 'company' as const, id: null };
const ledger = {
  entries: [move('f', C, { kind: 'project', id: 'tower' }, 40000), move('r', { kind: 'project', id: 'tower' }, C, 15000, 'repayment')],
  expenses: [{ id: 'e', companyId: 'c', date: '2026-10-01', amount: 10000, description: '', kind: 'salary' as const, partyId: null, paidByPartyId: null }],
  allocations: [{ id: 'a', expenseId: 'e', projectId: 'tower', amount: 6000 }],
};
const projects = [
  p('tower', 'برج الأفق'),
  p('mall', 'مجمع المدار', { actual: 90000 }),
  p('villa', 'فيلا الشاطئ', { group: 'دون محفظة', status: 'on-hold', actual: 0 }),
  p('school', 'مدرسة النور', { group: 'دون محفظة', status: 'completed', actual: 50000 }),
];

function Where() { return <span data-testid="where">{useLocation().pathname}</span>; }
const renderMap = (props: Partial<React.ComponentProps<typeof CompanyMap>> = {}) => render(
  <MemoryRouter initialEntries={['/company/c']}>
    <Routes><Route path="*" element={<><CompanyMap companyName="الأفق" projects={projects} ledger={ledger} net={120000} {...props} /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const strip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) });

describe('CompanyMap', () => {
  it('shows a skeleton while loading, not figures', () => {
    renderMap({ loading: true });
    expect(screen.getByRole('region', { name: 'خريطة المنظومة' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('برج الأفق')).not.toBeInTheDocument();
  });

  it('says what to do when the company has no project yet', () => {
    const onNewProject = vi.fn();
    renderMap({ projects: [], onNewProject });
    expect(screen.getByText('خريطة المنظومة تبدأ بأول مشروع')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /مشروع جديد/ }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it('marks every project with a symbol, not colour alone, grouped by portfolio', () => {
    renderMap();
    expect(strip('برج الأفق')).toHaveTextContent('✓ على المسار');
    expect(strip('مجمع المدار')).toHaveTextContent('✕ تجاوز الموازنة');
    expect(strip('فيلا الشاطئ')).toHaveTextContent('▲ يحتاج انتباه'); // on hold
    expect(strip('مدرسة النور')).toHaveTextContent('○ لا صرف جارٍ');   // finished
    expect(screen.getByRole('heading', { name: /المحفظة السكنية/ })).toHaveTextContent('(2)');
    expect(screen.getByRole('img', { name: 'صُرف 113% من الموازنة' })).toBeInTheDocument();
  });

  it('draws what went to each project from the company and what came back, and what it still owes', () => {
    renderMap();
    const tower = strip('برج الأفق');
    expect(tower).toHaveTextContent('من المنظومة46,000.00');
    expect(tower).toHaveTextContent('إلى المنظومة15,000.00');
    expect(tower).toHaveTextContent('عليه للمنظومة 25,000.00');
    expect(strip('مجمع المدار')).toHaveTextContent('✓ لا ذمة بينه وبين المنظومة');
  });

  it('heads the map with the company: its net, its own spend and how much of it the projects carry', () => {
    renderMap();
    const hub = screen.getByText('صافي الشركة المخطط').parentElement!;
    expect(hub).toHaveTextContent('120,000.00');
    expect(screen.getByText('مصاريف المنظومة').parentElement).toHaveTextContent('6,000.00 ر.س حُمِّلت على المشاريع · 4,000.00 ر.س بقيت عليها');
    expect(screen.getByText('أُرسل إلى المشاريع').parentElement).toHaveTextContent('عاد منه 15,000.00');
  });

  it('marks a planned deficit in words, not by colour alone', () => {
    renderMap({ net: -5000 });
    expect(screen.getByText('صافي الشركة المخطط').parentElement).toHaveTextContent('▼ عجز');
  });

  it('says what belongs to the company alone, to both, and to the projects alone', () => {
    renderMap();
    const band = screen.getByRole('img', { name: /للمنظومة وحدها/ });
    expect(band).toHaveAccessibleName('للمنظومة وحدها 4,000.00 ر.س، بينهما 46,000.00 ر.س، للمشاريع وحدها 160,000.00 ر.س');
  });

  it('still shows the projects, without flows, when the ledger is not live, and says why', () => {
    renderMap({ ledger: 'not-ready' });
    expect(screen.getByRole('status')).toHaveTextContent('دفتر المنظومة غير مفعّل بعد');
    expect(strip('برج الأفق')).not.toHaveTextContent('من المنظومة');
  });

  it('opens the project from its strip', () => {
    renderMap();
    fireEvent.click(strip('برج الأفق'));
    expect(screen.getByTestId('where')).toHaveTextContent('/project/tower');
    expect(within(screen.getByRole('list', { name: 'مفتاح الألوان' })).getAllByRole('listitem')).toHaveLength(3);
  });
});
