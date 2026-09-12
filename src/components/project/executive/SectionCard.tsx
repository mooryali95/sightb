/** The card and title every block of the executive summary uses. */
import type { ComponentType, ReactNode } from 'react';

export const SectionCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>{children}</div>
);

export const SectionTitle = ({ icon: Icon, children, actions }: { icon: ComponentType<{ className?: string }>; children: ReactNode; actions?: ReactNode }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      {children}
    </h3>
    {actions}
  </div>
);
