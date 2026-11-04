import { useCashRepairStatus } from '@/lib/cash-repair-events';
import { Badge } from '@/components/ui/badge';
import { Wrench, Clock } from 'lucide-react';

/**
 * شريط حالة يعرض آخر عملية إصلاح لتحويل يتيم وعدد التحويلات المعالجة في الجلسة.
 */
export function CashRepairStatusBar({ projectId }: { projectId: string }) {
  const { last, repairedCount } = useCashRepairStatus(projectId);
  if (!last) return null;

  const at = new Date(last.at);
  const time = `${at.toISOString().split('T')[0]} ${at.toTimeString().slice(0, 5)}`;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
      <Wrench className="w-4 h-4 text-success shrink-0" />
      <span className="text-xs font-medium">تم إصلاح التحويلات بلا مصدر</span>
      <Badge className="bg-success/10 text-success border-success/20 text-xs">
        {repairedCount} تحويل معالج
      </Badge>
      <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
        <Clock className="w-3 h-3" />{time}
      </span>
      <span className="text-xs text-muted-foreground">
        آخر إصلاح: {last.custodyName}
      </span>
    </div>
  );
}
