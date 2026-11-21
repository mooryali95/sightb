/**
 * orgSettingsService
 * ---------------------------------------------------------------
 * Reads and saves the organisation's shared settings (one row). Everyone
 * signed in may read it; the database lets only a system admin or the owner
 * change it, and records who did and when. A refusal is thrown with the
 * server's reason so the form can say why.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizeCurrency } from '@/lib/currency';
import { ORG_SETTINGS_DEFAULTS, type OrgSettings, type OrgSettingsInput } from '@/lib/org-settings';

interface Row {
  default_tax_percent: number | string;
  default_currency: string;
  default_duration_months: number;
  default_retention_percent: number | string;
  updated_at: string | null;
}

function fromRow(r: Row | null): OrgSettings {
  if (!r) return ORG_SETTINGS_DEFAULTS;
  return {
    defaultTaxPercent: Number(r.default_tax_percent),
    defaultCurrency: normalizeCurrency(r.default_currency),
    defaultDurationMonths: Number(r.default_duration_months),
    defaultRetentionPercent: Number(r.default_retention_percent),
    updatedAt: r.updated_at,
  };
}

const COLUMNS = 'default_tax_percent, default_currency, default_duration_months, default_retention_percent, updated_at';

export async function getOrgSettings(): Promise<OrgSettings> {
  const { data, error } = await supabase.from('organization_settings').select(COLUMNS).eq('singleton', true).maybeSingle();
  if (error) throw error;
  return fromRow(data as Row | null);
}

export async function saveOrgSettings(v: OrgSettingsInput): Promise<OrgSettings> {
  const { data, error } = await supabase
    .from('organization_settings')
    .update({
      default_tax_percent: v.defaultTaxPercent,
      default_currency: v.defaultCurrency,
      default_duration_months: v.defaultDurationMonths,
      default_retention_percent: v.defaultRetentionPercent,
    })
    .eq('singleton', true)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  // No row back means the policy filtered it out: the person may not change it.
  if (!data) throw new Error('لا تملك صلاحية تعديل إعدادات المؤسسة');
  return fromRow(data as Row);
}
