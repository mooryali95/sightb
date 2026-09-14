import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowDownUp, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { ACTIONS, ENTITY_TYPES, type AuditFilter, type KindConfig } from './auditEntries';

interface ChipRowProps {
  kinds: Record<string, KindConfig>;
  value: string;
  onChange: (value: string) => void;
  Icon: KindConfig['icon'];
  /** Classes for a chosen kind chip; a kind's own colour when omitted. */
  activeClass?: string;
  className?: string;
}

function ChipRow({ kinds, value, onChange, Icon, activeClass, className }: ChipRowProps) {
  const idle = 'bg-muted text-muted-foreground hover:bg-muted/80';
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <button
        onClick={() => onChange('all')}
        className={`text-xs px-3 py-1 rounded-full transition-colors ${value === 'all' ? 'bg-primary text-primary-foreground' : idle}`}
      >
        الكل
      </button>
      {Object.entries(kinds).map(([key, conf]) => {
        const KindIcon = conf.icon;
        const active = activeClass ?? conf.color;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`text-xs px-3 py-1 rounded-full transition-colors inline-flex items-center gap-1 ${value === key ? active + ' font-medium' : idle}`}
          >
            <KindIcon className="w-3 h-3" />
            {conf.label}
          </button>
        );
      })}
    </div>
  );
}

interface AuditFiltersProps {
  filter: AuditFilter;
  onChange: (filter: AuditFilter) => void;
  count: number;
}

/** The search box, the entity and action chips, and the count of what they leave. */
export function AuditFilters({ filter, onChange, count }: AuditFiltersProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="stat-card space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالإيميل أو الاسم أو التفاصيل..."
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
            className="pr-9 h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ChipRow kinds={ENTITY_TYPES} value={filter.entityType} onChange={(v) => onChange({ ...filter, entityType: v })} Icon={Filter} />
        <ChipRow
          kinds={ACTIONS}
          value={filter.action}
          onChange={(v) => onChange({ ...filter, action: v })}
          Icon={ArrowDownUp}
          activeClass="bg-foreground text-background"
          className="mr-4"
        />
      </div>

      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">{count} سجل</Badge>
      </div>
    </motion.div>
  );
}
