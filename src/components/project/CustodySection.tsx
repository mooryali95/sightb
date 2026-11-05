import { useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency } from '@/lib/finance';
import { type Custody, type Expense } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, todayLocal } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { getFundRemaining } from '@/lib/funds';
import { useRole } from '@/hooks/useRole';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';
import { CustodyFormDialog } from './custody/CustodyFormDialog';
import { CashTransferDialog } from './custody/CashTransferDialog';
import { CustodyInspector } from './custody/CustodyInspector';
import { enrichCustody } from './custody/enrichCustody';
import { useShallow } from 'zustand/react/shallow';

interface CustodySectionProps {
  projectId: string;
  companyId: string;
  custodies: Custody[];
  expenses: Expense[];
  readOnly?: boolean;
}

export function CustodySection({ projectId, companyId, custodies, expenses, readOnly = false }: CustodySectionProps) {
  const { updateCustody, deleteCustody, projectFunds, paymentRequests, cashTransfers } = useStore(useShallow((s) => ({ updateCustody: s.updateCustody, deleteCustody: s.deleteCustody, projectFunds: s.projectFunds, paymentRequests: s.paymentRequests, cashTransfers: s.cashTransfers })));
  const projPRs = useMemo(() => paymentRequests.filter((p) => p.projectId === projectId), [paymentRequests, projectId]);
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );
  const { isAdminFor } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const inspector = useDialogSession<string>();
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  const availableFunds = useMemo(
    () => projectFunds
      .filter((f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'))
      .map((f) => {
        const remaining = getFundRemaining(f, expenses, custodies, projPRs, projTransfers);
        return { ...f, remaining };
      })
      .filter((f) => f.remaining > 0)
      .sort((a, b) => b.fundNumber - a.fundNumber),
    [projectFunds, projectId, expenses, custodies, projPRs, projTransfers],
  );

  // ─── Dialogs ───
  // Each owns its form and is remounted (via `key`) on every open, so an edit
  // starts from the row and an add starts blank. See useDialogSession.
  const form = useDialogSession<{ custody?: Custody }>();
  const transfer = useDialogSession<Record<string, never>>();

  const enrichedCustodies = custodies.map((c) => enrichCustody(c, expenses, projTransfers, projPRs, projectFunds));

  // Auto-close exhausted custodies (via Zustand updateCustody — keeps state in sync)
  //
  // NOTE: `trg_auto_close_custody` on public.expenses already does this in the
  // database, and the two disagree on what "exhausted" means. The trigger
  // compares SUM(expenses) against custodies.amount alone; `remaining` below
  // also credits incoming cash transfers and debits outstanding advances. The
  // trigger additionally *re-opens* a custody whenever spend drops back under
  // the base amount, so it can revert a close performed here. Reconciling the
  // two definitions is tracked as P1-01 in docs/production-readiness-2026-08.md;
  // neither side is removed here because that needs a live database to verify.
  const custodyRemainingKey = enrichedCustodies.map((c) => `${c.id}:${c.remaining}`).join(',');
  useEffect(() => {
    enrichedCustodies.forEach(async (c) => {
      if (c.remaining <= 0 && c.status === 'active' && !c.closedDate) {
        try {
          await updateCustody(c.id, {
            status: 'closed',
            closedDate: todayLocal(),
          });
        } catch { /* silent — background close */ }
      }
    });
    // Deliberately keyed on the id:remaining digest rather than the array.
    // `enrichedCustodies` is rebuilt on every render, so depending on it would
    // re-run this write-effect each render — an unbounded loop of UPDATEs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custodyRemainingKey]);

  const totalAmount = enrichedCustodies.reduce((s, c) => s + c.effectiveAmount, 0);
  const totalSpent = enrichedCustodies.reduce((s, c) => s + c.spent, 0);
  // Summed from the rows, not recomputed as total − spent: the rows also
  // debit outstanding advances, and the header must say the same number.
  const totalRemaining = enrichedCustodies.reduce((s, c) => s + c.remaining, 0);


  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">سجل العهد</h3>
          <p className="text-xs text-muted-foreground">
            إجمالي العهد: {formatCurrency(totalAmount)} · المصروف: {formatCurrency(totalSpent)} · المتبقي: {formatCurrency(totalRemaining)}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {!readOnly && (
        <CashTransferDialog
          key={transfer.session}
          open={transfer.value !== null}
          onOpenChange={(v) => { if (!v) transfer.close(); }}
          onRequestOpen={() => transfer.open({})}
          projectId={projectId}
          availableFunds={availableFunds}
          activeCustodies={enrichedCustodies.filter((c) => c.status === 'active')}
        />
        )}
        {!readOnly && (

        <CustodyFormDialog
          key={form.session}
          open={form.value !== null}
          onOpenChange={(v) => { if (!v) form.close(); }}
          onRequestOpen={() => form.open({})}
          editing={form.value?.custody}
          projectId={projectId}
          custodies={custodies}
          expenses={expenses}
          availableFunds={availableFunds}
          isAdmin={isAdmin}
        />
        )}
        <p className="text-xs text-muted-foreground mt-2">العهدة مرتبطة بالمصروفات — عند إضافة مصروف يمكن ربطه بعهدة ليُخصم منها تلقائياً</p>
        </div>
      </div>

      {enrichedCustodies.length === 0 ? (

        <p className="text-sm text-muted-foreground text-center py-8">لا توجد عهد مسجلة بعد</p>
      ) : (
        <>
        <div className="flex justify-end mb-2"><TableDensityToggle /></div>
        <div className="data-table-wrapper data-table-wrapper--scroll">
          <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
            <thead>
              <tr>
                <th>المستلم</th>
                <th>مبلغ العهدة</th>
                <th className="hidden sm:table-cell">تحويلات واردة</th>
                <th>الإجمالي المتاح</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                <th className="hidden sm:table-cell">نسبة الصرف</th>
                <th>الاستلام</th>
                <th>الحالة</th>
                <th className="hidden md:table-cell">ملاحظات</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enrichedCustodies.map((c) => {
                const pct = c.spendPercent;
                return (
                  <tr key={c.id} className={pct > 100 ? 'bg-destructive/5' : ''}>

                    <td className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{c.resourceName}</span>
                        {c.sourceFundId ? (() => {
                          const sf = projectFunds.find(f => f.id === c.sourceFundId);
                          return sf ? (
                            <Badge variant="outline" className="text-xs border-warning/40 text-warning w-fit">
                              من دفعة #{sf.fundNumber}
                            </Badge>
                          ) : null;
                        })() : (
                          <Badge variant="outline" className="text-xs border-destructive/40 text-destructive w-fit">
                            غير مرتبطة بدفعة
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(c.amount)}</td>
                    <td className="font-mono text-sm hidden sm:table-cell">
                      {c.transfersIn > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-primary">+{formatCurrency(c.transfersIn)}</span>
                          <div className="flex flex-wrap gap-1">
                            {c.transferSources.map((t) => (
                              <Badge
                                key={t.transferId}
                                variant="outline"
                                className={`text-xs w-fit ${t.orphan
                                  ? 'border-destructive/50 text-destructive'
                                  : 'border-primary/40 text-primary'}`}
                                title={`${formatCurrency(t.amount)} · ${t.transferDate}`}
                              >
                                {t.orphan ? 'مصدر مفقود ⚠' : `من دفعة #${t.fundNumber}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="font-mono text-sm font-semibold">{formatCurrency(c.effectiveAmount)}</td>
                    <td className="font-mono text-sm">
                      {formatCurrency(c.spent)}
                      {c.outstandingAdvances > 0 && (
                        <span className="block text-xs text-warning">+ سلف {formatCurrency(c.outstandingAdvances)}</span>
                      )}
                    </td>
                    <td>
                      <span className={c.remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(c.remaining)}</span>
                      {c.remaining <= 0 && (
                        <span className="text-xs text-destructive ms-1">⚠️ مستنفدة</span>
                      )}
                      {c.remaining > 0 && c.remaining < c.effectiveAmount * 0.1 && (
                        <span className="text-xs text-warning ms-1">⚠️ أقل من 10%</span>
                      )}
                    </td>

                    <td className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground">{c.receivedDate || '—'}</td>
                    <td>
                      {c.isClosed ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مُغلقة</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">نشطة</span>
                      )}
                    </td>
                    <td className="text-muted-foreground text-xs hidden md:table-cell">{c.notes || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => inspector.open(c.id)} title="عرض التفاصيل">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {!readOnly && (
                          <>
                            {!c.sourceFundId && isAdmin && availableFunds.length > 0 && (
                              <Select
                                value=""
                                onValueChange={async (fid) => {
                                  if (!fid) return;
                                  const f = availableFunds.find(x => x.id === fid);
                                  if (!f) return;
                                  // ربط العهدة بدفعة يسحب مبلغ العهدة الأساسي كاملاً من الدفعة
                                  if (f.remaining < c.amount) {
                                    toast.error(`رصيد الدفعة لا يكفي. المتاح: ${formatCurrency(f.remaining)}, المطلوب: ${formatCurrency(c.amount)}`);
                                    return;
                                  }

                                  try {
                                    await updateCustody(c.id, { sourceFundId: fid });
                                    toast.success(`تم ربط العهدة بالدفعة #${f.fundNumber}`);
                                  } catch (e) {
                                    toast.error(errorMessage(e, 'تعذّر الربط'));
                                  }
                                }}
                              >
                                <SelectTrigger className="h-7 w-[140px] text-xs">
                                  <SelectValue placeholder="ربط بدفعة" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFunds.map(f => (
                                    <SelectItem key={f.id} value={f.id} className="text-xs">
                                      دفعة #{f.fundNumber} — متاح {formatCurrency(f.remaining)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => form.open({ custody: c })} title="تعديل العهدة">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <ConfirmDeleteDialog title="حذف العهدة" description={c.spent > 0 ? `⚠️ هذه العهدة عليها ${formatCurrency(c.spent)} من المصروفات. الحذف سيُسقط الربط مع تلك المصروفات. متابعة؟` : 'هل أنت متأكد من حذف هذه العهدة؟'} onConfirm={() => deleteCustody(c.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <CustodyInspector
        custody={inspector.value ? enrichedCustodies.find((x) => x.id === inspector.value) : undefined}
        projectFunds={projectFunds}
        expenses={expenses}
        readOnly={readOnly}
        onEdit={(c) => { form.open({ custody: c }); inspector.close(); }}
        onClose={inspector.close}
      />
    </div>
  );
}
