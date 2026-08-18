import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InspectorPanel, InspectorSection, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { AlertTriangle, CheckCircle2, BellRing } from 'lucide-react';

interface Props {
  projectId: string;
  projectName?: string;
  expenses: Expense[];
  resources: Resource[];
}

/**
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

      {report.hasIssues ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>تم رصد اختلافات في أرقام الصرف</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            {Math.abs(report.totalGap) > 0.01 && (
              <div>فرق قبل/بعد الإصلاح: <span className="font-mono">{formatCurrency(report.totalGap)}</span></div>
            )}
            {report.totalUnlinked > 0.01 && (
              <div>
                مصروفات بلا دفعة أو عهدة: <span className="font-mono">{formatCurrency(report.totalUnlinked)}</span>
                {' '}({report.unlinkedCount} عملية) — {report.unlinked.slice(0, 3).map((u) => u.label).join('، ')}
              </div>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>الأرقام متسقة</AlertTitle>
          <AlertDescription className="text-xs">
            لا توجد فروق بين ما قبل وبعد الإصلاح، وكل مصروف مرتبط بمصدر واحد صحيح.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">الإجمالي قبل</p>
          <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(report.totalBefore)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">الإجمالي بعد</p>
          <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(report.totalAfter)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">إجمالي الفجوة</p>
          <p className={`text-sm font-mono font-semibold mt-1 ${Math.abs(report.totalGap) > 0.01 ? 'text-destructive' : ''}`}>
            {formatCurrency(report.totalGap)}
          </p>
        </div>
      </div>

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
            <Badge key={u.key} variant="destructive" className="text-[10px]">
              {u.label}: {formatCurrency(u.amount)} ({u.count})
            </Badge>
          ))}
        </div>
      )}

      {/* جدول المجموعات — انقر لفتح المقارنة التفصيلية */}
      {report.rows.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            انقر على أي {dimension === 'resource' ? 'مورد' : 'فئة'} لعرض عناصر الصرف التي تغيّرت قبل/بعد الإصلاح.
          </p>
          {report.rows.map((r) => {
            const changed = Math.abs(r.gap) > 0.01;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setActiveKey(r.key)}
                className="w-full flex items-center justify-between gap-3 p-2 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors text-start"
              >
                <span className="text-xs font-medium truncate">{r.label}</span>
                <span className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                  <span className="text-muted-foreground">قبل: {formatCurrency(r.before)}</span>
                  <span>بعد: {formatCurrency(r.after)}</span>
                  <span className={changed ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    فرق: {formatCurrency(r.gap)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {comparison && (
        <InspectorPanel
          open={!!comparison}
          onOpenChange={(v) => !v && setActiveKey(null)}
          title={`مقارنة تفصيلية — ${comparison.label}`}
          description={`${comparison.changedCount} عنصر تغيّر من أصل ${comparison.lines.length}`}
          width="lg"
        >
          <InspectorKpiStrip
            items={[
              { label: 'قبل الإصلاح', value: formatCurrency(comparison.before), tone: 'default' },
              { label: 'بعد الإصلاح', value: formatCurrency(comparison.after), tone: 'success' },
              { label: 'الفرق', value: formatCurrency(comparison.gap), tone: Math.abs(comparison.gap) > 0.01 ? 'danger' : 'default' },
            ]}
          />
          <InspectorSection title="عناصر الصرف — قبل / بعد / الفرق">
            <div className="space-y-2">
              {comparison.lines.map((l) => {
                const changed = Math.abs(l.diff) > 0.01;
                return (
                  <div
                    key={`${l.kind}-${l.id}`}
                    className={`p-2 rounded border ${changed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/20'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{l.description}</span>
                      {changed && <Badge variant="destructive" className="text-[10px] shrink-0">تغيّر</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] font-mono">
                      {l.date && <span className="text-muted-foreground">{l.date}</span>}
                      <span className="text-muted-foreground">{l.categoryLabel}</span>
                      <span className="text-muted-foreground">قبل: {formatCurrency(l.before)}</span>
                      <span>بعد: {formatCurrency(l.after)}</span>
                      <span className={changed ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                        فرق: {formatCurrency(l.diff)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {comparison.lines.length === 0 && (
                <p className="text-xs text-muted-foreground">لا توجد عناصر صرف في هذه المجموعة.</p>
              )}
            </div>
          </InspectorSection>
          <InspectorSection title="مركز التنبيهات">
            <Link to="/alerts" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              <BellRing className="w-3.5 h-3.5" />عرض سجل تنبيهات الاتساق لكل المشاريع
            </Link>
          </InspectorSection>
        </InspectorPanel>
      )}
    </div>
  );
}
