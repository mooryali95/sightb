import { useState, useEffect } from 'react';
import { useStore, type AuditRecord } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/project';
import { useShallow } from 'zustand/react/shallow';

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

const ACTION_LABELS: Record<string, string> = {
  delete: 'حذف',
  update: 'تعديل',
  insert: 'إضافة',
  DELETE: 'حذف',
  UPDATE: 'تعديل',
  INSERT: 'إضافة',
};

const ACTION_COLORS: Record<string, string> = {
  delete: 'bg-destructive/10 text-destructive',
  update: 'bg-primary/10 text-primary',
  insert: 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  DELETE: 'bg-destructive/10 text-destructive',
  UPDATE: 'bg-primary/10 text-primary',
  INSERT: 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
};

interface AuditLogSectionProps {
  projectId: string;
}

export function AuditLogSection({ projectId }: AuditLogSectionProps) {
  const { auditLog, loadAuditLog } = useStore(useShallow((s) => ({ auditLog: s.auditLog, loadAuditLog: s.loadAuditLog })));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditLog(projectId).finally(() => setLoading(false));
  }, [projectId, loadAuditLog]);

  if (loading) {
    return <div className="stat-card text-center py-8 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="stat-card">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">سجل العمليات</h3>
        <p className="text-xs text-muted-foreground">يمكنك مراجعة جميع التعديلات والحذف في هذا المشروع</p>
      </div>

      {auditLog.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد عمليات مسجلة</p>
      ) : (
        <div className="space-y-3">
          {auditLog.map((entry) => {
            const isUpdate = entry.action === 'update';
            const data: AuditRecord = entry.recordData ?? {};
            return (
              <div key={entry.id} className="p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${ACTION_COLORS[entry.action] || ACTION_COLORS.update}`}>
                    {ACTION_LABELS[entry.action] || entry.action || 'تعديل'} {TABLE_NAME_LABELS[entry.tableName] || entry.tableName}
                  </span>
                  {entry.recordData && (entry.recordData.name || entry.recordData.title || entry.recordData.description) && (
                    <span className="text-muted-foreground text-xs ms-2">
                      {entry.recordData.name || entry.recordData.title || (typeof entry.recordData.description === 'string' ? entry.recordData.description.substring(0, 40) : '')}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString('ar-SA', { calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit' })} — {new Date(entry.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  {isUpdate ? (
                    <UpdateDiff oldData={data.old} newData={data.new} />
                  ) : (
                    <>
                      {data.description && <p><span className="text-muted-foreground">الوصف:</span> {data.description}</p>}
                      {data.name && <p><span className="text-muted-foreground">الاسم:</span> {data.name}</p>}
                      {data.resource_name && <p><span className="text-muted-foreground">المستلم:</span> {data.resource_name}</p>}
                      {(data.amount !== undefined || data.planned_amount !== undefined) && (
                        <p><span className="text-muted-foreground">المبلغ:</span> {formatCurrency(data.amount || data.planned_amount || 0)}</p>
                      )}
                      {data.category && <p><span className="text-muted-foreground">الفئة:</span> {EXPENSE_CATEGORY_LABELS[data.category as ExpenseCategory] || data.category}</p>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم',
  description: 'الوصف',
  amount: 'المبلغ',
  planned_amount: 'المبلغ المخطط',
  category: 'الفئة',
  date: 'التاريخ',
  month: 'الشهر',
  responsible: 'المسؤول',
  notes: 'ملاحظات',
  resource_name: 'المستلم',
  status: 'الحالة',
  contract_value: 'قيمة العقد',
  monthly_cost: 'التكلفة الشهرية',
  role: 'الدور',
};

const SKIP_FIELDS = new Set(['id', 'user_id', 'project_id', 'company_id', 'portfolio_id', 'created_at', 'baseline_id', 'budget_item_id', 'resource_id', 'custody_id']);

type Row = Record<string, unknown> | null | undefined;

function UpdateDiff({ oldData, newData }: { oldData: Row; newData: Row }) {
  if (!oldData || !newData) return <p className="text-muted-foreground">بيانات التعديل غير متوفرة</p>;

  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(newData)) {
    if (SKIP_FIELDS.has(key)) continue;
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changes.push({ field: key, from: oldData[key], to: newData[key] });
    }
  }

  if (changes.length === 0) return <p className="text-muted-foreground">لا توجد تغييرات ظاهرة</p>;

  return (
    <div className="space-y-1">
      {changes.map((c) => (
        <p key={c.field}>
          <span className="text-muted-foreground">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
          <span className="line-through text-destructive/70">{formatValue(c.from)}</span>
          {' → '}
          <span className="text-foreground font-medium">{formatValue(c.to)}</span>
        </p>
      ))}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(val);
}
