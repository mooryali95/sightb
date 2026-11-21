import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useStore, type AppState } from '@/store/useStore';
import type { Company } from '@/types/project';
import NewProject from '../NewProject';
import { resetOrgSettingsCache } from '@/hooks/useOrgSettings';
import { getOrgSettings } from '@/services/orgSettingsService';

vi.mock('@/services/orgSettingsService', () => ({ getOrgSettings: vi.fn(), saveOrgSettings: vi.fn() }));
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ roles: [], isAdmin: true, isOwner: false, isScopedAdmin: true, isAdminFor: () => true, canEdit: () => true, hasAccess: () => true, loading: false }),
}));
vi.mock('@/hooks/useAppData', () => ({ useCoreData: () => undefined }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

const CO = '11111111-1111-4111-8111-111111111111';
const companies: Company[] = [{ id: CO, name: 'شركتي', status: 'active', createdAt: '' }];
const addProject = vi.fn().mockResolvedValue('p-new');
const vatInput = () => screen.getAllByRole('spinbutton')[2] as HTMLInputElement;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/projects/new?company=${CO}`]}>
      <Routes>
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/" element={<div>لوحة التحكم</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetOrgSettingsCache();
  addProject.mockClear();
  useStore.setState({ companies, portfolios: [], addProject } satisfies Partial<AppState>);
  vi.mocked(getOrgSettings).mockResolvedValue({ defaultTaxPercent: 5, defaultCurrency: 'USD', defaultDurationMonths: 6, defaultRetentionPercent: 10, updatedAt: null });
});

describe('a new project starts from the organisation settings', () => {
  it('uses the organisation VAT, currency, duration and retention', async () => {
    renderPage();
    await waitFor(() => expect(vatInput().value).toBe('5'));
    fireEvent.change(screen.getByPlaceholderText(/مشروع الرواد/), { target: { value: 'مشروع' } });
    fireEvent.change(screen.getByPlaceholderText('230,000'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء المشروع' }));
    await waitFor(() => expect(addProject).toHaveBeenCalledWith(expect.objectContaining({
      taxPercent: 5, currency: 'USD', durationMonths: 6, retentionPercent: 10,
    })));
  });

  it('keeps a VAT rate the person typed before the settings arrived', async () => {
    let answer: (v: Awaited<ReturnType<typeof getOrgSettings>>) => void = () => {};
    vi.mocked(getOrgSettings).mockReturnValue(new Promise((r) => { answer = r; }));
    renderPage();
    fireEvent.change(vatInput(), { target: { value: '0' } });
    answer({ defaultTaxPercent: 5, defaultCurrency: 'SAR', defaultDurationMonths: 6, defaultRetentionPercent: 10, updatedAt: null });
    await waitFor(() => expect((screen.getAllByRole('spinbutton')[3] as HTMLInputElement).value).toBe('6'));
    expect(vatInput().value).toBe('0');
  });
});
