/**
 * The organizer: dragging a project onto another portfolio moves it at once
 * and the toast can undo it; dropping it on another company asks first and
 * lists what goes with it; a refusal from the database reaches the user.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import type { Company, Portfolio, Project } from '@/types/project';
import Organize from '../Organize';

const role = vi.hoisted(() => ({ editable: ['c1', 'c2'] as string[] }));
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ isAdmin: false, canEdit: (_: string, id: string) => role.editable.includes(id) }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const companies = [{ id: 'c1', name: 'الأفق', status: 'active' }, { id: 'c2', name: 'المدار', status: 'active' }] as Company[];
const portfolios = [{ id: 'pf1', name: 'السكني', companyId: 'c1' }, { id: 'pf2', name: 'التجاري', companyId: 'c1' }, { id: 'pf9', name: 'الخارجي', companyId: 'c2' }] as Portfolio[];
const projects = [
  { id: 'p1', name: 'برج الأفق', companyId: 'c1', portfolioId: 'pf1', status: 'active', contractValue: 1000000 },
  { id: 'p2', name: 'فيلا قديمة', companyId: 'c1', status: 'completed', contractValue: 5000 },
] as Project[];
const moveProject = vi.fn();

function renderPage() {
  useStore.setState({ companies, portfolios, projects, loading: false, moveProject });
  return render(<MemoryRouter><Organize /></MemoryRouter>);
}
const zone = (company: string, label: string) => {
  const section = screen.getByRole('region', { name: `شركة ${company}` });
  const heading = within(section).getByText((_, el) => el?.tagName === 'P' && !!el.textContent?.startsWith(label));
  return heading.nextElementSibling as HTMLElement;
};
function drag(projectName: string, target: HTMLElement) {
  const card = screen.getByLabelText(`مشروع ${projectName}`);
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
  fireEvent.dragStart(card, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

beforeEach(() => {
  vi.clearAllMocks();
  role.editable = ['c1', 'c2'];
  moveProject.mockResolvedValue(undefined);
});

describe('Organize', () => {
  it('hides finished projects until asked, and searches the name ignoring spelling variants', () => {
    renderPage();
    expect(screen.queryByText('فيلا قديمة')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText('فيلا قديمة')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('بحث في المشاريع'), { target: { value: 'برج الافق' } });
    expect(screen.getByText('برج الأفق')).toBeInTheDocument();
    expect(screen.queryByText('فيلا قديمة')).not.toBeInTheDocument();
  });

  it('moves a project to another portfolio of its company at once, and undoes it from the toast', async () => {
    renderPage();
    drag('برج الأفق', zone('الأفق', 'التجاري'));
    await waitFor(() => expect(moveProject).toHaveBeenCalledWith('p1', 'c1', 'pf2'));
    expect(toast.success).toHaveBeenCalledTimes(1);
    const options = vi.mocked(toast.success).mock.calls[0][1] as unknown as { action: { onClick: () => void } };
    options.action.onClick();
    expect(moveProject).toHaveBeenLastCalledWith('p1', 'c1', 'pf1');
  });

  it('moves to standalone within the company', async () => {
    renderPage();
    drag('برج الأفق', zone('الأفق', 'مشاريع مستقلة'));
    await waitFor(() => expect(moveProject).toHaveBeenCalledWith('p1', 'c1', null));
  });

  it('asks before moving to another company, says what moves with it, and moves only on confirmation', async () => {
    renderPage();
    drag('برج الأفق', zone('المدار', 'الخارجي'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('نقل «برج الأفق» من الأفق إلى المدار — محفظة «الخارجي»');
    expect(dialog).toHaveTextContent('تنتقل مع المشروع كل بياناته');
    expect(moveProject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد النقل' }));
    await waitFor(() => expect(moveProject).toHaveBeenCalledWith('p1', 'c2', 'pf9'));
  });

  it('refuses a move into a company the user cannot edit, without calling the database', () => {
    role.editable = ['c1'];
    renderPage();
    drag('برج الأفق', zone('المدار', 'الخارجي'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(moveProject).not.toHaveBeenCalled();
  });

  it('shows the database\'s reason when it refuses', async () => {
    moveProject.mockRejectedValue(new Error('للمشروع تحميلات أو ذمم في دفتر شركته الحالية؛ احذفها أو سوِّها قبل النقل'));
    renderPage();
    drag('برج الأفق', zone('الأفق', 'التجاري'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('لم يُنقل المشروع', { description: 'للمشروع تحميلات أو ذمم في دفتر شركته الحالية؛ احذفها أو سوِّها قبل النقل' }));
  });
});
