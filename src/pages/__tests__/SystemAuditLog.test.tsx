/**
 * Component tests for the system audit log page, written before it is
 * split. What is pinned: only an owner sees it; the entries loaded, counted,
 * grouped by day and described per kind (a role change, an invite, an
 * update's changed fields, a plain name); the entity and action chips; and
 * the search over the email, the name and the details.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { listSystemAuditEntries, type SystemAuditEntry } from '@/services/auditService';
import SystemAuditLog from '../SystemAuditLog';

const roleState = { isOwner: true, loading: false };
vi.mock('@/hooks/useRole', () => ({ useRole: () => ({ isOwner: roleState.isOwner, loading: roleState.loading }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/services/auditService', () => ({ listSystemAuditEntries: vi.fn() }));

const entry = (over: Partial<SystemAuditEntry>): SystemAuditEntry => ({
  id: 'e', userId: 'u1', userEmail: 'pm@example.com', action: 'insert', entityType: 'company',
  entityId: null, entityName: null, details: null, createdAt: '2026-09-10T08:05:00Z', ...over,
});
const entries: SystemAuditEntry[] = [
  entry({ id: 'e1', entityName: 'شركة الأفق', details: { name: 'شركة الأفق' }, createdAt: '2026-09-10T11:30:00Z' }),
  entry({ id: 'e2', action: 'update', entityType: 'project', entityName: 'مشروع الجسر', details: { old: { status: 'active', budget: 100 }, new: { status: 'closed', budget: 100 } }, createdAt: '2026-09-10T08:05:00Z' }),
  entry({ id: 'e3', action: 'update', entityType: 'user_role', details: { target_email: 'x@y.com', old_role: 'viewer', new_role: 'editor', scope_type: 'company' }, createdAt: '2026-09-08T09:00:00Z' }),
  entry({ id: 'e4', entityType: 'user_invite', userEmail: null, details: { invited_email: 'new@y.com', role: 'editor' }, createdAt: '2026-09-08T08:00:00Z' }),
  entry({ id: 'e5', action: 'delete', entityType: 'portfolio', entityName: 'محفظة الرياض', createdAt: '2026-09-08T07:00:00Z' }),
];
const day = (iso: string) => new Date(iso).toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: 'long', day: 'numeric' });

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/audit']}>
      <Routes>
        <Route path="/audit" element={<SystemAuditLog />} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}
const chip = (name: string, group: 'entity' | 'action') => {
  const buttons = screen.getAllByRole('button', { name });
  return group === 'entity' ? buttons[0] : buttons[buttons.length - 1];
};
const rows = () => screen.queryAllByText(/إضافة|تعديل|حذف/, { selector: 'span.inline-flex' }).map((s) => s.closest('.bg-card') as HTMLElement);

describe('SystemAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleState.isOwner = true;
    roleState.loading = false;
    vi.mocked(listSystemAuditEntries).mockResolvedValue(entries);
  });

  it('waits for the role, then sends anyone but an owner home without loading anything', () => {
    roleState.loading = true;
    const { unmount } = renderPage();
    expect(screen.queryByText('السجل الرئيسي')).not.toBeInTheDocument();
    expect(listSystemAuditEntries).not.toHaveBeenCalled();
    unmount();
    roleState.loading = false;
    roleState.isOwner = false;
    renderPage();
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    expect(listSystemAuditEntries).not.toHaveBeenCalled();
  });

  it('loads the latest entries, counts them, groups them by day, and describes each by its kind', async () => {
    renderPage();
    expect(listSystemAuditEntries).toHaveBeenCalledWith(500);
    expect(await screen.findByText('5 سجل')).toBeInTheDocument();
    expect(screen.getByText(day('2026-09-10T11:30:00Z'))).toBeInTheDocument();
    expect(screen.getByText(day('2026-09-08T09:00:00Z'))).toBeInTheDocument();
    const [r1, r2, r3, r4, r5] = rows();
    expect(r1).toHaveTextContent('إضافة');
    expect(r1).toHaveTextContent('شركة');
    expect(r1).toHaveTextContent('شركة الأفق');
    expect(r1).toHaveTextContent('pm@example.com');
    expect(r2).toHaveTextContent('status: active → closed');
    expect(r2).not.toHaveTextContent('budget');
    expect(r3).toHaveTextContent('x@y.com • مشاهد → محرر • شركة');
    expect(r4).toHaveTextContent('new@y.com • محرر');
    expect(r4).toHaveTextContent('نظام');
    expect(r5).toHaveTextContent('حذف');
    expect(r5).toHaveTextContent('محفظة الرياض');
  });

  it('narrows by entity chip and by action chip, together, and says when nothing matches', async () => {
    renderPage();
    await screen.findByText('5 سجل');
    fireEvent.click(chip('مشروع', 'entity'));
    expect(screen.getByText('1 سجل')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('مشروع الجسر');
    fireEvent.click(chip('حذف', 'action'));
    expect(screen.getByText('0 سجل')).toBeInTheDocument();
    expect(screen.getByText('لا توجد سجلات تطابق البحث')).toBeInTheDocument();
    fireEvent.click(chip('الكل', 'entity'));
    expect(screen.getByText('1 سجل')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('محفظة الرياض');
  });

  it('searches the actor email, the entity name and the details, ignoring the case and the padding', async () => {
    renderPage();
    await screen.findByText('5 سجل');
    const input = screen.getByPlaceholderText('بحث بالإيميل أو الاسم أو التفاصيل...');
    fireEvent.change(input, { target: { value: 'X@Y' } });
    expect(screen.getByText('1 سجل')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('مشاهد → محرر');
    fireEvent.change(input, { target: { value: 'PM@EXAMPLE' } });
    expect(screen.getByText('4 سجل')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: ' الأفق ' } });
    expect(screen.getByText('1 سجل')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('شركة الأفق');
  });

  it('shows the empty log when nothing was recorded, and nothing when the service fails', async () => {
    vi.mocked(listSystemAuditEntries).mockResolvedValueOnce([]);
    const { unmount } = renderPage();
    expect(await screen.findByText('لا توجد سجلات بعد')).toBeInTheDocument();
    unmount();
    vi.mocked(listSystemAuditEntries).mockRejectedValueOnce(new Error('down'));
    renderPage();
    expect(await screen.findByText('لا توجد سجلات بعد')).toBeInTheDocument();
    expect(screen.getByText('0 سجل')).toBeInTheDocument();
  });
});
