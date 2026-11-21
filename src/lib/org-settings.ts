/**
 * Organisation settings: one shared record, changed by a system admin or the
 * owner, read by everyone. They are only the *starting values* of a new
 * project; a saved project keeps its own VAT rate and currency, so changing
 * a setting never moves a figure already recorded.
 */
import { SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/currency';
import { normalizeDigits } from '@/lib/utils';

export interface OrgSettings {
  defaultTaxPercent: number;
  defaultCurrency: CurrencyCode;
  defaultDurationMonths: number;
  defaultRetentionPercent: number;
  updatedAt: string | null;
}

/** The values the app used before these settings existed; also the database defaults. */
export const ORG_SETTINGS_DEFAULTS: OrgSettings = {
  defaultTaxPercent: 15,
  defaultCurrency: 'SAR',
  defaultDurationMonths: 4,
  defaultRetentionPercent: 0,
  updatedAt: null,
};

export interface OrgSettingsDraft {
  defaultTaxPercent: string;
  defaultCurrency: string;
  defaultDurationMonths: string;
  defaultRetentionPercent: string;
}

export type OrgSettingsInput = Omit<OrgSettings, 'updatedAt'>;

export type ValidationResult =
  | { ok: true; value: OrgSettingsInput }
  | { ok: false; field: keyof OrgSettingsDraft; message: string };

function num(text: string): number {
  const t = normalizeDigits(text.trim());
  return t === '' ? NaN : Number(t);
}

/** Checks a draft against the same limits the database enforces, and says which field is wrong. */
export function validateOrgSettings(d: OrgSettingsDraft): ValidationResult {
  const tax = num(d.defaultTaxPercent);
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
    return { ok: false, field: 'defaultTaxPercent', message: 'نسبة الضريبة بين 0 و 100' };
  }
  const retention = num(d.defaultRetentionPercent);
  if (!Number.isFinite(retention) || retention < 0 || retention > 100) {
    return { ok: false, field: 'defaultRetentionPercent', message: 'نسبة المحتجزات بين 0 و 100' };
  }
  const months = num(d.defaultDurationMonths);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    return { ok: false, field: 'defaultDurationMonths', message: 'مدة المشروع عدد صحيح من 1 إلى 120 شهرًا' };
  }
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(d.defaultCurrency)) {
    return { ok: false, field: 'defaultCurrency', message: 'اختر عملة من القائمة' };
  }
  return {
    ok: true,
    value: {
      defaultTaxPercent: Math.round(tax * 100) / 100,
      defaultCurrency: d.defaultCurrency as CurrencyCode,
      defaultDurationMonths: months,
      defaultRetentionPercent: Math.round(retention * 100) / 100,
    },
  };
}

export function toDraft(s: OrgSettings): OrgSettingsDraft {
  return {
    defaultTaxPercent: String(s.defaultTaxPercent),
    defaultCurrency: s.defaultCurrency,
    defaultDurationMonths: String(s.defaultDurationMonths),
    defaultRetentionPercent: String(s.defaultRetentionPercent),
  };
}
