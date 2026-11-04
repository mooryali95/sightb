import { Plus, type LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface MobileFABProps {
  onClick: () => void;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
}

/**
 * Floating Action Button for mobile only — primary contextual action per page.
 * Positioned bottom-left for RTL Arabic layout.
 */
export function MobileFAB({ onClick, label, icon: Icon = Plus, hidden }: MobileFABProps) {
  const isMobile = useIsMobile();
  if (!isMobile || hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed z-40 end-4 bottom-[max(env(safe-area-inset-bottom),1rem)]',
        'h-14 px-5 rounded-full',
        'bg-primary text-primary-foreground shadow-elevated',
        'flex items-center gap-2 font-semibold text-sm',
        'active:scale-95 transition-transform motion-fast',
        'focus-ring',
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
