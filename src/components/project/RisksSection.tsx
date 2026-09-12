/**
 * The risks section: the open count and the exposure they carry, and the
 * table. The form lives under risks/ and is remounted on open through a
 * dialog session.
 */
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import {
  Risk, RISK_PROBABILITY_LABELS, RISK_IMPACT_LABELS, RISK_CATEGORY_LABELS,
  RISK_STATUS_LABELS, RISK_PROBABILITY_COLORS, RISK_IMPACT_COLORS, RISK_STATUS_COLORS,
} from '@/types/project';
import { formatCurrency } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { RiskFormDialog } from './risks/RiskFormDialog';

interface RisksSectionProps {
  projectId?: string;
  portfolioId?: string;
  risks: Risk[];
  readOnly?: boolean;
}

export function RisksSection({ projectId, portfolioId, risks, readOnly = false }: RisksSectionProps) {
  const deleteRisk = useStore((s) => s.deleteRisk);
  // Remounted on open so an edit starts from the row and an add starts blank; see useDialogSession.
  const form = useDialogSession<{ risk?: Risk }>();

  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating');
  const totalExposure = openRisks.reduce((s, r) => s + r.financialImpact, 0);

  const handleDelete = async (id: string) => {
    try {
      await deleteRisk(id);
      toast.success('تم حذف الخطر');
    } catch { toast.error('فشل الحذف'); }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="stat-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">مخاطر مفتوحة</p>
            <p className="text-lg font-bold">{openRisks.length}</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-health-warning flex items-center justify-center">
            <Shield className="w-5 h-5 health-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">إجمالي التعرض المالي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalExposure)}</p>
          </div>
        </div>
      </div>

      {/* Add button */}
      {!readOnly && (
        <RiskFormDialog
          key={form.session}
          open={form.value !== null}
          onOpenChange={(v) => { if (!v) form.close(); }}
          onRequestOpen={() => form.open({})}
          editing={form.value?.risk}
          projectId={projectId}
          portfolioId={portfolioId}
        />
      )}

      {/* Table */}
      {risks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الاحتمال</th>
                <th>الأثر</th>
                <th>الأثر المالي</th>
                <th>الفئة</th>
                <th>الحالة</th>
                <th className="hidden sm:table-cell">المسؤول</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {risks.map(risk => (
                <tr key={risk.id}>
                  <td className="font-medium">{risk.title}</td>
                  <td><span className={`text-xs px-1.5 py-0.5 rounded-full ${RISK_PROBABILITY_COLORS[risk.probability]}`}>{RISK_PROBABILITY_LABELS[risk.probability]}</span></td>
                  <td><span className={`text-xs px-1.5 py-0.5 rounded-full ${RISK_IMPACT_COLORS[risk.impact]}`}>{RISK_IMPACT_LABELS[risk.impact]}</span></td>
                  <td className="font-mono text-sm">{formatCurrency(risk.financialImpact)}</td>
                  <td className="text-xs text-muted-foreground">{RISK_CATEGORY_LABELS[risk.category]}</td>
                  <td><span className={`text-xs px-1.5 py-0.5 rounded-full ${RISK_STATUS_COLORS[risk.status]}`}>{RISK_STATUS_LABELS[risk.status]}</span></td>
                  <td className="hidden sm:table-cell text-xs text-muted-foreground">{risk.owner || '-'}</td>
                  {!readOnly && (
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => form.open({ risk })}>تعديل</Button>
                      <ConfirmDeleteDialog onConfirm={() => handleDelete(risk.id)} title="حذف الخطر" description={`هل أنت متأكد من حذف "${risk.title}"؟`} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {risks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">لا توجد مخاطر مسجلة</div>
      )}
    </div>
  );
}
