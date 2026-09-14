import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { ACTIONS, ENTITY_TYPES, describeDetails, timeLabel, type AuditEntry } from './auditEntries';

interface AuditEntryCardProps {
  entry: AuditEntry;
  index: number;
}

/** One entry: its kind, its action, its name, what it recorded, who did it and when. */
export function AuditEntryCard({ entry, index }: AuditEntryCardProps) {
  const entityConf = ENTITY_TYPES[entry.entityType] || ENTITY_TYPES.company;
  const actConf = ACTIONS[entry.action] || ACTIONS.insert;
  const EntityIcon = entityConf.icon;
  const ActIcon = actConf.icon;
  const details = describeDetails(entry);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex gap-3 p-3 rounded-lg border border-border/50 hover:border-border transition-colors bg-card"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entityConf.color}`}>
        <EntityIcon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${actConf.color}`}>
            <ActIcon className="w-3 h-3" />
            {actConf.label}
          </span>
          <Badge variant="outline" className={`text-xs ${entityConf.color}`}>{entityConf.label}</Badge>
          {entry.entityName && <span className="text-sm font-medium truncate">{entry.entityName}</span>}
        </div>
        {details && <span className="text-xs text-muted-foreground">{details}</span>}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span dir="ltr">{entry.userEmail || 'نظام'}</span>
          <span>•</span>
          <span>{timeLabel(entry.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}
