import { Lock } from 'lucide-react';
import { SYSTEM_POLICIES } from '@/lib/settings-access';
import { SectionCard } from './SettingRow';

export function PoliciesSection() {
  return (
    <SectionCard
      icon={<Lock className="w-4 h-4" />}
      title="سياسات النظام"
      subtitle="قواعد ثابتة تنطبق على الجميع، للاطلاع فقط."
    >
      <dl className="grid sm:grid-cols-2 gap-3">
        {SYSTEM_POLICIES.map((p) => (
          <div key={p.label} className="rounded-lg bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">{p.label}</dt>
            <dd className="text-sm font-semibold text-foreground mt-0.5">{p.value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
