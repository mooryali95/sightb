import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrganizationSettings } from '../settings/OrganizationSettings';
import { resetOrgSettingsCache } from '@/hooks/useOrgSettings';
import { getOrgSettings, saveOrgSettings } from '@/services/orgSettingsService';

vi.mock('@/services/orgSettingsService', () => ({ getOrgSettings: vi.fn(), saveOrgSettings: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const stored = { defaultTaxPercent: 15, defaultCurrency: 'SAR' as const, defaultDurationMonths: 4, defaultRetentionPercent: 0, updatedAt: null };
const vat = () => screen.getByLabelText('نسبة الضريبة الافتراضية') as HTMLInputElement;
const saveButton = () => screen.queryByRole('button', { name: /حفظ إعدادات المؤسسة/ });

beforeEach(() => {
  resetOrgSettingsCache();
  vi.mocked(getOrgSettings).mockReset().mockResolvedValue(stored);
  vi.mocked(saveOrgSettings).mockReset().mockImplementation(async (v) => ({ ...v, updatedAt: '2026-11-21T21:00:00Z' }));
});

describe('organisation settings: who may change them', () => {
  it('shows anyone who is not an admin the values, locked, with nothing to save', async () => {
    render(<OrganizationSettings canManage={false} roleLoading={false} />);
    await waitFor(() => expect(vat().value).toBe('15'));
    expect(vat()).toBeDisabled();
    expect(saveButton()).toBeNull();
    expect(screen.getByText('يعدّلها المدير فقط')).toBeInTheDocument();
  });

  it('offers no save while the role is still being checked', async () => {
    render(<OrganizationSettings canManage roleLoading />);
    await waitFor(() => expect(vat().value).toBe('15'));
    expect(saveButton()).toBeNull();
  });

  it('offers no save when the stored values could not be read, so nothing unknown is overwritten', async () => {
    vi.mocked(getOrgSettings).mockRejectedValue(new Error('offline'));
    render(<OrganizationSettings canManage roleLoading={false} />);
    await waitFor(() => expect(getOrgSettings).toHaveBeenCalled());
    expect(saveButton()).toBeNull();
  });

  it('lets an admin change the VAT rate and saves the new rate', async () => {
    render(<OrganizationSettings canManage roleLoading={false} />);
    await waitFor(() => expect(vat()).not.toBeDisabled());
    fireEvent.change(vat(), { target: { value: '5' } });
    await waitFor(() => expect(saveButton()).not.toBeDisabled());
    fireEvent.click(saveButton()!);
    await waitFor(() => expect(saveOrgSettings).toHaveBeenCalledWith({
      defaultTaxPercent: 5, defaultCurrency: 'SAR', defaultDurationMonths: 4, defaultRetentionPercent: 0,
    }));
  });

  it('refuses to save a VAT rate above 100 and says why', async () => {
    render(<OrganizationSettings canManage roleLoading={false} />);
    await waitFor(() => expect(vat()).not.toBeDisabled());
    fireEvent.change(vat(), { target: { value: '150' } });
    await waitFor(() => expect(saveButton()).not.toBeDisabled());
    fireEvent.click(saveButton()!);
    expect(await screen.findByText('نسبة الضريبة بين 0 و 100')).toBeInTheDocument();
    expect(saveOrgSettings).not.toHaveBeenCalled();
  });
});
