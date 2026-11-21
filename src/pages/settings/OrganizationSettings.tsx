import { useEffect, useState } from 'react';
import { Building2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_CURRENCIES, currencySymbol } from '@/lib/currency';
import { toDraft, validateOrgSettings, type OrgSettingsDraft } from '@/lib/org-settings';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { runOrToast } from '@/lib/run-or-toast';
import { SectionCard } from './SettingRow';

const FIELDS: { key: Exclude<keyof OrgSettingsDraft, 'defaultCurrency'>; label: string; hint: string; suffix: string }[] = [
  { key: 'defaultTaxPercent', label: 'نسبة الضريبة الافتراضية', hint: 'تبدأ بها خانة الضريبة في كل مشروع جديد.', suffix: '%' },
  { key: 'defaultRetentionPercent', label: 'نسبة المحتجزات الافتراضية', hint: 'ما يُحتجز من كل دفعة حتى التسليم.', suffix: '%' },
  { key: 'defaultDurationMonths', label: 'مدة المشروع الافتراضية', hint: 'بالأشهر، من 1 إلى 120.', suffix: 'شهر' },
];

/**
 * The organisation's shared settings. A system admin or the owner edits them;
 * everyone else sees the values the new-project form will start from. The
 * database enforces who may save, whatever this screen shows.
 */
export function OrganizationSettings({ canManage, roleLoading }: { canManage: boolean; roleLoading: boolean }) {
  const { settings, loaded, save } = useOrgSettings();
  const [draft, setDraft] = useState<OrgSettingsDraft>(() => toDraft(settings));
  const [error, setError] = useState<{ field: keyof OrgSettingsDraft; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = canManage && !roleLoading && loaded;

  useEffect(() => { setDraft(toDraft(settings)); }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
  const set = (k: keyof OrgSettingsDraft, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setError(null); };

  const onSave = async () => {
    const r = validateOrgSettings(draft);
    if (!r.ok) { setError({ field: r.field, message: r.message }); return; }
    setSaving(true);
    const ok = await runOrToast(() => save(r.value), 'تعذّر حفظ إعدادات المؤسسة');
    setSaving(false);
    if (ok) toast.success('حُفظت إعدادات المؤسسة، وستبدأ بها المشاريع الجديدة');
  };

  const updated = settings.updatedAt ? new Date(settings.updatedAt).toLocaleDateString('en-GB') : null;

  return (
    <SectionCard
      icon={<Building2 className="w-4 h-4" />}
      title="إعدادات المؤسسة"
      subtitle="تنطبق على الجميع، وتبدأ بها المشاريع الجديدة. المشاريع الحالية تحتفظ بقيمها."
      aside={!editable && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground shrink-0">
          <Lock className="w-3 h-3" aria-hidden="true" /> يعدّلها المدير فقط
        </span>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-currency">العملة الافتراضية</Label>
          <Select value={draft.defaultCurrency} onValueChange={(v) => set('defaultCurrency', v)} disabled={!editable}>
            <SelectTrigger id="org-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c} — {currencySymbol(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">مشاريع الشركة الواحدة تُجمع بعملة واحدة؛ خلط العملات يوقف الإجماليات.</p>
        </div>

        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`org-${f.key}`}>{f.label}</Label>
            <div className="relative">
              <Input
                id={`org-${f.key}`}
                inputMode="decimal"
                dir="ltr"
                value={draft[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={!editable}
                aria-invalid={error?.field === f.key}
                aria-describedby={`org-${f.key}-hint`}
                className="pe-12 text-start tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">{f.suffix}</span>
            </div>
            <p id={`org-${f.key}-hint`} className={error?.field === f.key ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {error?.field === f.key ? error.message : f.hint}
            </p>
          </div>
        ))}
      </div>

      {error?.field === 'defaultCurrency' && <p className="mt-3 text-xs text-destructive">{error.message}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          {updated ? `آخر تعديل: ${updated}` : 'لم تُعدّل بعد — هذه القيم الأصلية.'}
        </p>
        {editable && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => { setDraft(toDraft(settings)); setError(null); }}>تراجع</Button>
            <Button size="sm" className="gap-1.5" disabled={!dirty || saving} onClick={onSave}>
              <Save className="w-3.5 h-3.5" aria-hidden="true" /> {saving ? 'جارٍ الحفظ…' : 'حفظ إعدادات المؤسسة'}
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
