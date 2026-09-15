import { INVITE_STATUSES, type InviteCounts, type InviteStatus } from './inviteFigures';

const CHIPS: Record<InviteStatus | 'all', { label: string; active: string; idle: string }> = {
  all: { label: 'الكل', active: 'bg-primary text-primary-foreground', idle: 'bg-muted text-muted-foreground hover:bg-muted/80' },
  pending: { label: 'معلّقة', active: 'bg-warning text-warning-foreground', idle: 'bg-warning/10 health-warning hover:opacity-80' },
  sent: { label: 'مرسلة', active: 'bg-primary text-primary-foreground', idle: 'bg-primary/10 text-primary hover:opacity-80' },
  failed: { label: 'فاشلة', active: 'bg-destructive text-destructive-foreground', idle: 'bg-destructive/10 text-destructive hover:bg-destructive/20' },
  accepted: { label: 'مقبولة', active: 'bg-success text-success-foreground', idle: 'bg-success/10 health-good hover:opacity-80' },
};

interface InviteStatusChipsProps {
  counts: InviteCounts;
  value: InviteStatus | 'all';
  onChange: (value: InviteStatus | 'all') => void;
}

/** One chip per status with its count; the chosen one lit. */
export function InviteStatusChips({ counts, value, onChange }: InviteStatusChipsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(['all', ...INVITE_STATUSES] as const).map((key) => {
        const chip = CHIPS[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${value === key ? chip.active : chip.idle}`}
          >
            {chip.label} ({counts[key]})
          </button>
        );
      })}
    </div>
  );
}
