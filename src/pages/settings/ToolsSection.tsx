import { useNavigate } from 'react-router-dom';
import { BarChart3, BellRing, Bug, KeyRound, Layers, LayoutGrid, ScanSearch, ScrollText, Users, ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AUDIENCE_LABELS, visibleTools, type Access, type Audience, type ToolKey } from '@/lib/settings-access';
import { countAr } from '@/lib/plural';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from './SettingRow';

const ICONS: Record<ToolKey, LucideIcon> = {
  finance: BarChart3, alerts: BellRing, organize: Layers, security: KeyRound,
  users: Users, controlCenter: ScanSearch, audit: ScrollText, errors: Bug,
};
const BADGE: Record<Audience, string> = {
  everyone: 'bg-muted text-muted-foreground',
  admin: 'bg-info/10 text-info',
  owner: 'bg-warning/10 text-warning',
};

export function ToolsSection({ access, loading }: { access: Access; loading: boolean }) {
  const navigate = useNavigate();
  const tools = visibleTools(access);
  return (
    <SectionCard
      icon={<LayoutGrid className="w-4 h-4" />}
      title="الأدوات المتاحة لك"
      subtitle="تظهر هنا فقط الأدوات التي يسمح بها دورك."
      aside={!loading && <span className="text-xs text-muted-foreground whitespace-nowrap">{countAr(tools.length, 'item')}</span>}
    >
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3" aria-busy="true" aria-label="جاري التحقق من الصلاحية">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3 stagger-in">
          {tools.map((t) => {
            const Icon = ICONS[t.key];
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => navigate(t.path)}
                  className="group w-full h-full text-start rounded-lg border border-border/70 bg-background/60 p-4 flex items-start gap-3 motion-fast transition-[border-color,box-shadow,transform] hover:border-accent/50 hover:shadow-card hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden="true"><Icon className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{t.label}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5', BADGE[t.audience])}>{AUDIENCE_LABELS[t.audience]}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1">{t.description}</span>
                  </span>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0 mt-1 motion-fast transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
