/**
 * The read-only custody inspector: the balance formula written out, where
 * each incoming transfer came from, and the expenses charged to it.
 */
import { formatCurrency } from '@/lib/finance';
import type { Expense, ProjectFund } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import type { EnrichedCustody } from './enrichCustody';

interface Props {
  /** The custody being inspected; the panel is closed when absent. */
  custody: EnrichedCustody | undefined;
  projectFunds: ProjectFund[];
  expenses: Expense[];
  readOnly: boolean;
  onEdit: (custody: EnrichedCustody) => void;
  onClose: () => void;
}

export function CustodyInspector({ custody, projectFunds, expenses, readOnly, onEdit, onClose }: Props) {
  const c = custody;
  if (!c) return null;
  const sf = c.sourceFundId ? projectFunds.find(f => f.id === c.sourceFundId) : null;
  const linkedExpenses = expenses.filter((e) => e.custodyId === c.id);
  const pct = c.spendPercent;
  return (
    <InspectorPanel
      open={!!custody}
      onOpenChange={(o) => !o && onClose()}
      title={c.resourceName}
      description="تفاصيل العهدة والمصروفات المرتبطة بها"
      meta={c.isClosed
        ? <Badge variant="outline" className="text-[10px] bg-muted">مُغلقة</Badge>
        : <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">نشطة</Badge>}
      width="lg"
      footer={!readOnly && (
        <Button size="sm" onClick={() => onEdit(c)}>
          <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
        </Button>
      )}
    >
      <InspectorKpiStrip
        items={[
          { label: 'مبلغ العهدة', value: formatCurrency(c.amount) },
          { label: 'تحويلات واردة', value: formatCurrency(c.transfersIn), tone: c.transfersIn > 0 ? 'info' : 'default' },
          { label: 'الإجمالي المتاح', value: formatCurrency(c.effectiveAmount) },
          { label: 'المصروف', value: formatCurrency(c.spent), tone: 'warning' },
          { label: 'المتبقي', value: formatCurrency(c.remaining), tone: c.remaining > 0 ? 'success' : 'destructive' },
        ]}
      />

      <InspectorSection title="معادلة الرصيد">
        <div className="text-xs font-mono leading-6 bg-muted/40 rounded-md p-3 space-y-0.5">
          <div>مبلغ العهدة: {formatCurrency(c.amount)}</div>
          <div>+ تحويلات نقدية واردة: {formatCurrency(c.transfersIn)}</div>
          <div>= الإجمالي المتاح: {formatCurrency(c.effectiveAmount)}</div>
          <div>− المصروفات المرتبطة: {formatCurrency(c.spent)}</div>
          <div>− سلف قائمة من العهدة: {formatCurrency(c.outstandingAdvances)}</div>
          <div className="border-t border-border pt-0.5 font-semibold">= المتبقي: {formatCurrency(c.remaining)}</div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          محسوب عبر <span className="font-mono">getCustodyBreakdown()</span> — نفس المصدر المستخدم في كل الشاشات.
        </p>
      </InspectorSection>

      <InspectorSection title="أصل التحويلات النقدية الواردة">
        {c.transferSources.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد تحويلات نقدية واردة لهذه العهدة.</p>
        ) : (
          <div className="space-y-1">
            {c.transferSources.map((t) => (
              <div
                key={t.transferId}
                className="flex items-center justify-between gap-2 text-xs border border-border/60 rounded-md px-2 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${t.orphan ? 'border-destructive/50 text-destructive' : 'border-primary/40 text-primary'}`}
                  >
                    {t.orphan ? 'مصدر مفقود' : `دفعة #${t.fundNumber}`}
                  </Badge>
                  <span className="text-muted-foreground font-mono">{t.transferDate}</span>
                </span>
                <span className="font-mono">+{formatCurrency(t.amount)}</span>
              </div>
            ))}
            {c.orphanTransfers.length > 0 && (
              <p className="text-[11px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                تحويل بلا دفعة مصدر (الدفعة محذوفة) — يجب حذف التحويل أو إعادة ربطه بدفعة قائمة حتى يبقى كل ريال في العهدة له أصل.
              </p>
            )}
          </div>
        )}
      </InspectorSection>




      <InspectorSection title="نسبة الصرف">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: pct > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
              }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      </InspectorSection>

      <InspectorSection title="المصدر">
        <InspectorField
          label="الدفعة المصدر"
          value={sf ? `دفعة #${sf.fundNumber}` : <span className="text-destructive">غير مرتبطة</span>}
        />
        <InspectorField label="تاريخ الاستلام" value={c.receivedDate || '—'} mono />
        {c.closedDate && <InspectorField label="تاريخ الإغلاق" value={c.closedDate} mono />}
      </InspectorSection>

      {c.notes && (
        <InspectorSection title="ملاحظات">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{c.notes}</p>
        </InspectorSection>
      )}

      <InspectorSection title={`المصروفات المرتبطة (${linkedExpenses.length})`}>
        {linkedExpenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد مصروفات مرتبطة بهذه العهدة بعد.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {linkedExpenses.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md border border-border/50 bg-muted/30">
                <div className="min-w-0">
                  <div className="text-sm truncate">{e.description || e.category || 'مصروف'}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{e.date || '—'}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(e.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </InspectorSection>
    </InspectorPanel>
  );
}
