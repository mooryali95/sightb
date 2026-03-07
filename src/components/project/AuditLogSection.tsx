import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';

const TABLE_NAME_LABELS: Record<string, string> = {
  expenses: 'مصروف',
  budget_items: 'بند موازنة',
  revenues: 'إيراد',
  resources: 'مورد',
  custodies: 'عهدة',
  cost_baselines: 'خط أساس',
  projects: 'مشروع',
  companies: 'شركة',
  portfolios: 'محفظة',
};

interface AuditLogSectionProps {
  projectId: string;
}

export function AuditLogSection({ projectId }: AuditLogSectionProps) {
  const { auditLog, loadAuditLog } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditLog(projectId).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <div className="stat-card text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="stat-card">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">سجل العمليات المحذوفة</h3>
        <p className="text-xs text-muted-foreground">يمكنك مراجعة جميع العناصر التي تم حذفها من هذا المشروع</p>
      </div>

      {auditLog.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد عمليات حذف مسجلة</p>
      ) : (
        <div className="space-y-3">
          {auditLog.map((entry) => {
            const data = entry.recordData;
            return (
              <div key={entry.id} className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                    حذف {TABLE_NAME_LABELS[entry.tableName] || entry.tableName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString('ar-SA')} — {new Date(entry.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  {data.description && <p><span className="text-muted-foreground">الوصف:</span> {data.description}</p>}
                  {data.name && <p><span className="text-muted-foreground">الاسم:</span> {data.name}</p>}
                  {data.resourceName && <p><span className="text-muted-foreground">المستلم:</span> {data.resourceName}</p>}
                  {(data.amount !== undefined || data.plannedAmount !== undefined) && (
                    <p><span className="text-muted-foreground">المبلغ:</span> {formatCurrency(data.amount || data.plannedAmount || 0)}</p>
                  )}
                  {data.category && <p><span className="text-muted-foreground">الفئة:</span> {EXPENSE_CATEGORY_LABELS[data.category as ExpenseCategory] || data.category}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
