import type { ReactNode } from 'react';

/** One setting: its name and what it does at the start, its control at the end. */
export function SettingRow({ id, label, description, children }: { id: string; label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p id={id} className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SectionCard({ icon, title, subtitle, children, aside }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card shadow-card overflow-hidden" aria-label={title}>
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg gradient-gold-soft flex items-center justify-center text-accent-text shrink-0" aria-hidden="true">{icon}</div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
