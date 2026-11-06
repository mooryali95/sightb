/** The pending-expense and proposed-order pills under the stats. */
import { Clock, FileEdit } from 'lucide-react';
import { countAr } from '@/lib/plural';

interface Props {
  pendingExpensesCount: number;
  pendingChangeOrders: number;
}

export function QuickAlerts({ pendingExpensesCount, pendingChangeOrders }: Props) {
  return (
    <>
  {/* تنبيهات سريعة */}
  {(pendingExpensesCount > 0 || pendingChangeOrders > 0) && (
    <div className="flex flex-wrap gap-2 mb-4">
      {pendingExpensesCount > 0 && (
        <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
          <Clock className="w-3 h-3" />
          {countAr(pendingExpensesCount, 'expense')} بانتظار الاعتماد
        </div>
      )}
      {pendingChangeOrders > 0 && (
        <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
          <FileEdit className="w-3 h-3" />
          {pendingChangeOrders} أمر تغيير مقترح
        </div>
      )}
    </div>
  )}
    </>
  );
}
