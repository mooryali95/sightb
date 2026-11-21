import { describe, it, expect } from 'vitest';
import { validateOrgSettings, ORG_SETTINGS_DEFAULTS, type OrgSettingsDraft } from '../org-settings';

const draft = (over: Partial<OrgSettingsDraft> = {}): OrgSettingsDraft => ({
  defaultTaxPercent: '15', defaultCurrency: 'SAR', defaultDurationMonths: '4', defaultRetentionPercent: '0', ...over,
});

describe('organisation settings limits', () => {
  it('starts from the values the app used before: 15% VAT, SAR, 4 months, no retention', () => {
    expect(ORG_SETTINGS_DEFAULTS).toMatchObject({ defaultTaxPercent: 15, defaultCurrency: 'SAR', defaultDurationMonths: 4, defaultRetentionPercent: 0 });
  });

  it('accepts a VAT rate of 0 and of 100, and refuses one outside 0–100', () => {
    expect(validateOrgSettings(draft({ defaultTaxPercent: '0' })).ok).toBe(true);
    expect(validateOrgSettings(draft({ defaultTaxPercent: '100' })).ok).toBe(true);
    expect(validateOrgSettings(draft({ defaultTaxPercent: '100.5' }))).toMatchObject({ ok: false, field: 'defaultTaxPercent' });
    expect(validateOrgSettings(draft({ defaultTaxPercent: '-1' }))).toMatchObject({ ok: false, field: 'defaultTaxPercent' });
    expect(validateOrgSettings(draft({ defaultTaxPercent: '' }))).toMatchObject({ ok: false, field: 'defaultTaxPercent' });
  });

  it('reads Arabic digits as English ones before saving', () => {
    const r = validateOrgSettings(draft({ defaultTaxPercent: '١٥', defaultDurationMonths: '٦' }));
    expect(r).toEqual({ ok: true, value: { defaultTaxPercent: 15, defaultCurrency: 'SAR', defaultDurationMonths: 6, defaultRetentionPercent: 0 } });
  });

  it('keeps the duration a whole number of months from 1 to 120', () => {
    expect(validateOrgSettings(draft({ defaultDurationMonths: '0' }))).toMatchObject({ ok: false, field: 'defaultDurationMonths' });
    expect(validateOrgSettings(draft({ defaultDurationMonths: '121' }))).toMatchObject({ ok: false, field: 'defaultDurationMonths' });
    expect(validateOrgSettings(draft({ defaultDurationMonths: '2.5' }))).toMatchObject({ ok: false, field: 'defaultDurationMonths' });
    expect(validateOrgSettings(draft({ defaultDurationMonths: '120' })).ok).toBe(true);
  });

  it('refuses retention outside 0–100', () => {
    expect(validateOrgSettings(draft({ defaultRetentionPercent: '101' }))).toMatchObject({ ok: false, field: 'defaultRetentionPercent' });
  });

  it('accepts only a currency the projects table accepts', () => {
    expect(validateOrgSettings(draft({ defaultCurrency: 'USD' })).ok).toBe(true);
    expect(validateOrgSettings(draft({ defaultCurrency: 'ر.س' }))).toMatchObject({ ok: false, field: 'defaultCurrency' });
  });
});
