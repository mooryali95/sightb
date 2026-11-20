/**
 * «هيكل المنظومة», the drawn structure of the company map, reached through
 * the map's «قائمة / هيكل» toggle: the choice in the address bar, every box
 * a named link, status in a symbol and a word, money on the lines by
 * thickness, the loading, empty and ledger-not-live states, and the indented
 * tree at phone width.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CompanyMap } from '../CompanyMap';
import type { MapProjectInput } from '@/lib/finance/company-map';
import type { IntercompanyEntry } from '@/lib/finance/company-ledger';

const phone = vi.hoisted(() => ({ on: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => phone.on }));
beforeEach(() => { phone.on = false; });

const p = (id: string, name: string, over: Partial<MapProjectInput> = {}): MapProjectInput => ({
  id, name, group: 'المحفظة السكنية', groupId: 'pf-homes', status: 'active', contract: 100000, planned: 80000, actual: 20000, collected: 0, ...over,
});
const C = { kind: 'company' as const, id: null };
const P = (id: string) => ({ kind: 'project' as const, id });
const move = (id: string, from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number, type: IntercompanyEntry['type'] = 'advance'): IntercompanyEntry => ({
  id, companyId: 'c', date: '2026-10-01', amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});
const ledger = {
  entries: [move('f', C, P('tower'), 40000), move('r', P('tower'), C, 15000, 'repayment'), move('f2', C, P('villa'), 4000)],
  expenses: [{ id: 'e', companyId: 'c', date: '2026-10-01', amount: 10000, description: '', kind: 'salary' as const, partyId: null, paidByPartyId: null }],
  allocations: [{ id: 'a', expenseId: 'e', projectId: 'tower', amount: 6000 }],
};
const alone = { group: 'دون محفظة', groupId: null };
const projects = [
  p('villa', 'فيلا الشاطئ', { ...alone, status: 'on-hold', actual: 0 }),
  p('tower', 'برج الأفق'),
  p('mall', 'مجمع المدار', { actual: 90000 }),
  p('school', 'مدرسة النور', { ...alone, status: 'completed', actual: 50000 }),
];

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }
const renderMap = (at = '/company/c?map=structure', props: Partial<React.ComponentProps<typeof CompanyMap>> = {}) => render(
  <MemoryRouter initialEntries={[at]}>
    <Routes><Route path="*" element={<><CompanyMap companyId="c" companyName="الأفق" projects={projects} ledger={ledger} net={120000} {...props} /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const org = () => screen.getByRole('navigation', { name: 'هيكل المنظومة' });
const node = (name: RegExp | string) => within(org()).getByRole('link', { name });
const lines = (kind: string) => [...org().querySelectorAll<SVGPathElement>(`path[data-line="${kind}"]`)];
const widths = (kind: string) => lines(kind).map((l) => Number(l.getAttribute('stroke-width')));

describe('«قائمة / هيكل»', () => {
  it('opens on the strips, switches to the structure and back, and keeps the choice in the address bar', () => {
    renderMap('/company/c?tab=x');
    const [list, structure] = [screen.getByRole('button', { name: 'قائمة' }), screen.getByRole('button', { name: 'هيكل' })];
    expect(within(screen.getByRole('group', { name: 'طريقة عرض المشاريع' })).getAllByRole('button')).toHaveLength(2);
    expect(list).toHaveAttribute('aria-pressed', 'true');
    expect(structure).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('navigation', { name: 'هيكل المنظومة' })).toBeNull();
    expect(screen.getByRole('button', { name: /^برج الأفق:/ })).toBeInTheDocument();

    fireEvent.click(structure);
    expect(screen.getByTestId('where')).toHaveTextContent('/company/c?tab=x&map=structure'); // other parameters stay
    expect(structure).toHaveAttribute('aria-pressed', 'true');
    expect(org()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^برج الأفق:/ })).toBeNull();   // the strips step aside
    expect(screen.queryByRole('list', { name: 'مفتاح الألوان' })).toBeNull();
    expect(screen.getByRole('list', { name: 'مفتاح الخطوط' })).toHaveTextContent('سماكة الخط بحسب المبلغ');
    // The company's own figures and the split stay in both views.
    expect(screen.getByText('مصاريف المنظومة')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /للمنظومة وحدها/ })).toBeInTheDocument();

    fireEvent.click(list);
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/company\/c\?tab=x$/);
    expect(screen.getByRole('button', { name: /^برج الأفق:/ })).toBeInTheDocument();
  });

  it('opens straight on the structure from a shared link, and ignores a value it does not know', () => {
    renderMap('/company/c?map=structure');
    expect(org()).toBeInTheDocument();
    renderMap('/company/c?map=grid');
    expect(screen.getAllByRole('navigation', { name: 'هيكل المنظومة' })).toHaveLength(1);
  });
});

describe('the structure', () => {
  it('makes every box a link named for what it is, its state in words and its money, in reading order', () => {
    renderMap();
    const links = within(org()).getAllByRole('link');
    // The company, then each portfolio with its projects, then the projects outside any.
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/?company=c', '/portfolio/pf-homes', '/project/tower', '/project/mall',
      '/?company=c&portfolio=standalone', '/project/villa', '/project/school',
    ]);
    expect(links[0]).toHaveAccessibleName('المنظومة الأفق: مشاريعها في لوحة التحكم');
    expect(node(/^المحفظة السكنية:/)).toHaveAccessibleName('المحفظة السكنية: مشروعان، من المنظومة 46,000.00 ر.س، إلى المنظومة 15,000.00 ر.س');
    expect(node(/^دون محفظة:/)).toHaveAccessibleName('دون محفظة: مشروعان، من المنظومة 4,000.00 ر.س، إلى المنظومة 0.00 ر.س');
    expect(node(/^برج الأفق:/)).toHaveAccessibleName('برج الأفق: على المسار، من المنظومة 46,000.00 ر.س، إلى المنظومة 15,000.00 ر.س');
    for (const l of links) expect(l).not.toHaveAttribute('tabindex', '-1');
  });

  it('says each project\'s state with a symbol and a word, never colour alone, and its spend against budget', () => {
    renderMap();
    expect(node(/^برج الأفق:/)).toHaveTextContent('✓ على المسار');
    expect(node(/^برج الأفق:/)).toHaveTextContent('صُرف 25%');
    expect(node(/^مجمع المدار:/)).toHaveTextContent('✕ تجاوز الموازنة');
    expect(node(/^مجمع المدار:/)).toHaveTextContent('صُرف 113%');
    expect(node(/^فيلا الشاطئ:/)).toHaveTextContent('▲ يحتاج انتباه');
    expect(node(/^مدرسة النور:/)).toHaveTextContent('○ لا صرف جارٍ');
    expect(node(/^مجمع المدار:/)).toHaveAccessibleName(/تجاوز الموازنة/);
  });

  it('shows the map\'s own figures on each box: funding and charges out, repayment back', () => {
    renderMap();
    expect(node(/^برج الأفق:/)).toHaveTextContent('↓46,000.00 ر.س↑15,000.00 ر.س'); // 40,000 funding + 6,000 charged
    expect(node(/^برج الأفق:/)).toHaveAttribute('title', 'تمويل 40,000.00 ر.س + محمَّل من مصاريف المنظومة 6,000.00 ر.س');
    expect(node(/^مجمع المدار:/)).toHaveTextContent('↓0.00 ر.س↑0.00 ر.س');
    expect(node(/^المحفظة السكنية:/)).toHaveTextContent('↓46,000.00 ر.س↑15,000.00 ر.س');
  });

  it('draws the money as lines as thick as the amount: solid out, dashed back, and a thin plain line where none passed', () => {
    renderMap();
    // Out: the homes portfolio and the tower (46,000, the largest), the standalone group and the villa (4,000).
    expect(widths('out').sort((a, b) => b - a)).toEqual([10, 10, 2.2, 2.2]);
    // Back: the tower's 15,000 and its portfolio's.
    expect(widths('back')).toEqual([4.3, 4.3]);
    for (const l of lines('back')) expect(l).toHaveAttribute('stroke-dasharray');
    for (const l of lines('out')) expect(l).not.toHaveAttribute('stroke-dasharray');
    // The mall and the school got nothing: a belongs-to line each, beside the two column trunks.
    expect(lines('tree')).toHaveLength(4);
    expect(new Set(widths('tree'))).toEqual(new Set([1]));
    // The drawing is decoration to a screen reader; the links carry the words.
    expect(org().querySelector('svg[width]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves only where motion is welcome', () => {
    renderMap();
    expect(node(/^برج الأفق:/).className).toContain('motion-reduce:transition-none');
    expect(org().querySelector('.motion-safe\\:animate-in')).not.toBeNull();
    expect(org().innerHTML).not.toMatch(/(^|[" ])animate-(?!in)/); // nothing animates outside motion-safe
  });
});

describe('states', () => {
  it('shows the skeleton while loading and the first-project prompt when empty, whichever view is chosen', () => {
    const { unmount } = renderMap('/company/c?map=structure', { loading: true });
    expect(screen.getByRole('region', { name: 'خريطة المنظومة' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('navigation', { name: 'هيكل المنظومة' })).toBeNull();
    unmount();
    renderMap('/company/c?map=structure', { projects: [] });
    expect(screen.getByText('خريطة المنظومة تبدأ بأول مشروع')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'هيكل المنظومة' })).toBeNull();
  });

  it('draws the structure without money when the ledger is not live, and says why', () => {
    renderMap('/company/c?map=structure', { ledger: 'not-ready' });
    expect(screen.getByRole('status')).toHaveTextContent('دفتر المنظومة غير مفعّل بعد');
    expect(node(/^برج الأفق:/)).toHaveAccessibleName('برج الأفق: على المسار');
    expect(node(/^برج الأفق:/)).not.toHaveTextContent('↓');
    expect(node(/^المحفظة السكنية:/)).toHaveAccessibleName('المحفظة السكنية: مشروعان');
    expect(lines('out')).toHaveLength(0);
    expect(lines('back')).toHaveLength(0);
    expect(lines('tree')).toHaveLength(2 + 4 + 2);
    expect(screen.queryByRole('list', { name: 'مفتاح الخطوط' })).toBeNull();
  });
});

describe('at phone width', () => {
  it('stacks the same links as an indented tree, each project inside its portfolio\'s list, each amount with a sample of its line', () => {
    phone.on = true;
    renderMap();
    expect(within(org()).getAllByRole('link')).toHaveLength(7);
    const homes = within(org()).getByRole('list', { name: 'مشاريع المحفظة السكنية' });
    expect(within(homes).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/project/tower', '/project/mall']);
    expect(within(within(org()).getByRole('list', { name: 'مشاريع دون محفظة' })).getAllByRole('link')).toHaveLength(2);
    // No absolute drawing here: nothing is positioned, so nothing can run off the screen.
    expect(lines('out')).toHaveLength(0);
    for (const l of within(org()).getAllByRole('link')) expect(l.style.position).toBe('');
    // The tower's line out is the thickest sample; its line back is thinner and dashed.
    const samples = [...node(/^برج الأفق:/).querySelectorAll('line')];
    expect(samples.map((s) => Number(s.getAttribute('stroke-width')))).toEqual([10, 4.3]);
    expect(samples[1]).toHaveAttribute('stroke-dasharray');
    expect(node(/^برج الأفق:/)).toHaveTextContent('✓ على المسار');
  });
});
