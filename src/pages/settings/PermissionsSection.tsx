import { Check, Minus, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPABILITIES, ROLE_LABELS, type AppRoleName, type RoleLine } from '@/lib/settings-access';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from './SettingRow';

const COLUMNS: AppRoleName[] = ['owner', 'admin', 'editor', 'viewer'];

export function PermissionsSection({ lines, strongest, loading }: { lines: RoleLine[]; strongest: AppRoleName | null; loading: boolean }) {
  return (
    <SectionCard
      icon={<ShieldCheck className="w-4 h-4" />}
      title="الصلاحيات"
      subtitle="أدوارك الحالية، وما يحق لكل دور. تُغيَّر الأدوار من إدارة المستخدمين فقط."
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">أدوارك</p>
          {loading ? <Skeleton className="h-9 w-64 rounded-md" /> : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد لك دور بعد. اطلب من المدير إضافتك.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {lines.map((l, i) => (
                <li key={`${l.role}-${l.scope}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 ps-1 pe-3 py-1">
                  <span className="text-xs font-semibold rounded-full bg-primary text-primary-foreground px-2 py-0.5">{l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.scope}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <caption className="sr-only">ما يحق لكل دور</caption>
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className="text-start font-semibold px-3 py-2 text-xs">الصلاحية</th>
                {COLUMNS.map((r) => (
                  <th key={r} scope="col" className={cn('px-3 py-2 text-xs font-semibold text-center whitespace-nowrap', r === strongest && 'text-accent-text')}>
                    {ROLE_LABELS[r]}{r === strongest && <span className="block text-xs font-normal text-muted-foreground">دورك</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label} className="border-t border-border/50">
                  <th scope="row" className="text-start font-normal px-3 py-2.5">{c.label}</th>
                  {COLUMNS.map((r) => {
                    const yes = c.roles.includes(r);
                    return (
                      <td key={r} className={cn('px-3 py-2.5 text-center', r === strongest && 'bg-accent/10')}>
                        {yes
                          ? <Check className="w-4 h-4 mx-auto text-success" aria-label="مسموح" />
                          : <Minus className="w-4 h-4 mx-auto text-muted-foreground/50" aria-label="غير مسموح" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
