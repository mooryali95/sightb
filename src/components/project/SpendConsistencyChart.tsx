import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/finance';
import { buildSpendConsistency, buildRowComparison, type ConsistencyDimension } from '@/lib/spend-consistency';
import { recordConsistencyAlert } from '@/lib/consistency-alerts';
import { listCashTransferRepairs } from '@/services/cashRepairService';
import { logger } from '@/lib/logger';
import type { Expense, Resource } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConsistencyBanner } from './consistency/ConsistencyBanner';
import { ConsistencyRows } from './consistency/ConsistencyRows';
import { RowComparisonPanel } from './consistency/RowComparisonPanel';

interface Props {
  projectId: string;
  projectName?: string;
  expenses: Expense[];
  resources: Resource[];
}

/**
 * The banner, the rows and the comparison panel live under consistency/.
 *
 * مخطط فجوات الاتساق: يقارن أرقام الصرف قبل/بعد إصلاح التحويلات بلا مصدر
 * على مستوى المورد أو الفئة، وينبّه عند وجود أي اختلاف أو مصروف بلا مصدر.
 */
export function SpendConsistencyChart({ projectId, projectName = '', expenses, resources }: Props) {
  const [dimension, setDimension] = useState<ConsistencyDimension>('resource');
  const [repairs, setRepairs] = useState<{ id: string; custodyId: string | null; amount: number }[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCashTransferRepairs(projectId)
      .then((rows) => {
        if (alive) setRepairs(rows.map((r) => ({ id: r.id, custodyId: r.custodyId, amount: r.amount })));
      })
      .catch((e) => logger.error('spend-consistency', 'repairs load failed', { error: String(e) }));
    return () => { alive = false; };
  }, [projectId]);

  const report = useMemo(
    () => buildSpendConsistency(expenses, repairs, dimension, { resources }),
    [expenses, repairs, dimension, resources],
  );

  // تسجيل أي اختلاف في مركز التنبيهات مع تاريخ الاكتشاف.
  useEffect(() => {
    if (!projectId) return;
    try {
      recordConsistencyAlert(projectId, projectName, report);
    } catch (e) {
      logger.error('spend-consistency', 'alert record failed', { error: String(e) });
    }
  }, [projectId, projectName, report]);

  const comparison = useMemo(
    () => (activeKey ? buildRowComparison(activeKey, expenses, repairs, dimension, { resources }) : null),
    [activeKey, expenses, repairs, dimension, resources],
  );



  const data = useMemo(
    () => report.rows.slice(0, 12).map((r) => ({
      name: r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label,
      قبل: Math.round(r.before),
      بعد: Math.round(r.after),
      فجوة: Math.round(r.gap),
    })),
    [report],
  );

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">اتساق الصرف — قبل/بعد الإصلاح</h3>
          <p className="text-xs text-muted-foreground">
            مقارنة الأرقام قبل وبعد حذف التحويلات بلا مصدر، مع كشف المصروفات غير المرتبطة بدفعة أو عهدة.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={dimension === 'resource' ? 'default' : 'outline'} onClick={() => setDimension('resource')}>حسب المورد</Button>
          <Button size="sm" variant={dimension === 'category' ? 'default' : 'outline'} onClick={() => setDimension('category')}>حسب الفئة</Button>
        </div>
      </div>

      <ConsistencyBanner report={report} />

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد مصروفات لعرضها</p>
      ) : (
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="قبل" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="بعد" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="فجوة" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {report.unlinked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.unlinked.map((u) => (
            <Badge key={u.key} variant="destructive" className="text-xs">
              {u.label}: {formatCurrency(u.amount)} ({u.count})
            </Badge>
          ))}
        </div>
      )}

      {/* جدول المجموعات — انقر لفتح المقارنة التفصيلية */}
      <ConsistencyRows report={report} dimension={dimension} onOpen={setActiveKey} />

      {comparison && <RowComparisonPanel comparison={comparison} onClose={() => setActiveKey(null)} />}
    </div>
  );
}
