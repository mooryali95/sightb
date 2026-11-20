import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun, SlidersHorizontal, Type, Rows3, Rows4, PanelRightClose } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { useTableDensity } from '@/hooks/useTableDensity';
import { usePreferences } from '@/lib/preferences';
import { SectionCard, SettingRow } from './SettingRow';

const item = 'h-8 px-3 gap-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

export function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  // next-themes knows the theme only after mounting; hold the choice until then.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [density, setDensity] = useTableDensity();
  const [prefs, setPrefs] = usePreferences();

  return (
    <SectionCard
      icon={<SlidersHorizontal className="w-4 h-4" />}
      title="الإعدادات العامة"
      subtitle="تغيّر شكل التطبيق لك وحدك، وتُحفظ على هذا الجهاز."
    >
      <div className="divide-y divide-border/60">
        <SettingRow id="pref-theme" label="المظهر" description="فاتح أو داكن، أو حسب إعداد جهازك.">
          <ToggleGroup type="single" value={mounted ? theme : undefined} onValueChange={(v) => v && setTheme(v)} aria-labelledby="pref-theme" className="border border-border/60 rounded-md p-0.5">
            <ToggleGroupItem value="light" className={item}><Sun className="w-3.5 h-3.5" aria-hidden="true" />فاتح</ToggleGroupItem>
            <ToggleGroupItem value="dark" className={item}><Moon className="w-3.5 h-3.5" aria-hidden="true" />داكن</ToggleGroupItem>
            <ToggleGroupItem value="system" className={item}><Monitor className="w-3.5 h-3.5" aria-hidden="true" />تلقائي</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        <SettingRow id="pref-text" label="حجم النص" description="تكبير كل النصوص والأرقام في التطبيق.">
          <ToggleGroup type="single" value={prefs.textSize} onValueChange={(v) => v && setPrefs({ textSize: v === 'large' ? 'large' : 'normal' })} aria-labelledby="pref-text" className="border border-border/60 rounded-md p-0.5">
            <ToggleGroupItem value="normal" className={item}><Type className="w-3 h-3" aria-hidden="true" />عادي</ToggleGroupItem>
            <ToggleGroupItem value="large" className={item}><Type className="w-4 h-4" aria-hidden="true" />كبير</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        <SettingRow id="pref-density" label="كثافة الجداول" description="مسافات أوسع للقراءة، أو صفوف أكثر في الشاشة.">
          <ToggleGroup type="single" value={density} onValueChange={(v) => v && setDensity(v === 'compact' ? 'compact' : 'comfortable')} aria-labelledby="pref-density" className="border border-border/60 rounded-md p-0.5">
            <ToggleGroupItem value="comfortable" className={item}><Rows3 className="w-3.5 h-3.5" aria-hidden="true" />مريح</ToggleGroupItem>
            <ToggleGroupItem value="compact" className={item}><Rows4 className="w-3.5 h-3.5" aria-hidden="true" />مضغوط</ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>

        <SettingRow id="pref-sidebar" label="القائمة الجانبية مطوية" description="تفتح الصفحات والقائمة مطوية لمساحة أكبر على الشاشة.">
          <div className="flex items-center gap-2">
            <PanelRightClose className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Switch checked={prefs.sidebarCollapsed} onCheckedChange={(v) => setPrefs({ sidebarCollapsed: v })} aria-labelledby="pref-sidebar" />
          </div>
        </SettingRow>
      </div>
    </SectionCard>
  );
}
