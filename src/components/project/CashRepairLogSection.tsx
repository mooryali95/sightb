import { useEffect, useMemo, useState, useCallback } from 'react';
import { formatCurrency } from '@/lib/finance';
import { auditCashIntegrity, type OrphanTransfer } from '@/lib/cash-integrity';
import { listCashTransferRepairs, repairOrphanCashTransfer, type CashTransferRepair, type CustodySnapshot } from '@/services/cashRepairService';
import type { Custody, CashTransfer, ProjectFund, Expense, PaymentRequest } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { InspectorPanel, InspectorSection, InspectorField } from '@/components/ui/inspector-panel';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { AlertTriangle, CheckCircle2, History, Wrench } from 'lucide-react';

interface Props {
  projectId: string;
  custodies: Custody[];
  cashTransfers: CashTransfer[];
  funds: ProjectFund[];
  expenses: Expense[];
  paymentRequests?: PaymentRequest[];
  readOnly?: boolean;
  onRepaired?: () => void;
}

function SnapshotTable({ title, snap }: { title: string; snap?: CustodySnapshot | null }) {
  if (!snap) return null;
  return (
    <div className="p-2 rounded border border-border bg-muted/20">
      <p className="text-[11px] font-semibold mb-1">{title}</p>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between"><span className="text-muted-foreground">المبلغ الأساسي</span><span className="font-mono">{formatCurrency(Number(snap.base_amount))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">تحويلات واردة</span><span className="font-mono">{formatCurrency(Number(snap.transfers_in))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">المتاح</span><span className="font-mono">{formatCurrency(Number(snap.available))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">المصروف</span><span className="font-mono">{formatCurrency(Number(snap.spent))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">سلف قائمة</span><span className="font-mono">{formatCurrency(Number(snap.outstanding_advances))}</span></div>
        <div className="flex justify-between font-semibold"><span>المتبقي</span><span className="font-mono">{formatCurrency(Number(snap.remaining))}</span></div>
      </div>
    </div>
  );
}

/**
 * سجل تدقيق إصلاح التحويلات بلا مصدر + كاشف حي للتحويلات اليتيمة المتبقية.
 */
export function CashRepairLogSection({
  projectId, custodies, cashTransfers, funds, expenses, paymentRequests = [], readOnly, onRepaired,
}: Props) {
  const { toast } = useToast();
  const [repairs, setRepairs] = useState<CashTransferRepair[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<OrphanTransfer | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CashTransferRepair | null>(null);

  const integrity = useMemo(
    () => auditCashIntegrity({ custodies, cashTransfers, funds, expenses, paymentRequests }),
    [custodies, cashTransfers, funds, expenses, paymentRequests],
  );

  const load = useCallback(async () => {
    try {
      setRepairs(await listCashTransferRepairs(projectId));
    } catch (e) {
      logger.error('cashRepair.load', e instanceof Error ? e.message : 'تعذّر تحميل سجل الإصلاح');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const custodyName = (id: string) => custodies.find((c) => c.id === id)?.resourceName ?? id;

  const handleRepair = async () => {
    if (!target) return;
    if (reason.trim().length < 5) {
      toast({ title: 'سبب الإصلاح مطلوب', description: 'اكتب سبباً واضحاً لا يقل عن 5 أحرف.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await repairOrphanCashTransfer(target.transferId, reason.trim());
      toast({ title: 'تم الإصلاح', description: 'حُذف التحويل بلا مصدر وسُجّلت الأرقام قبل/بعد.' });
      setTarget(null);
      setReason('');
      // إعادة مزامنة النقد في المتجر حتى تختفي الحوالة اليتيمة وتُصحّح الأرصدة فوراً
      await Promise.all([
        load(),
        Promise.resolve(ensureProjectCashData?.(projectId)).catch((err) =>
          logger.error('cashRepair.resync', err instanceof Error ? err.message : 'تعذّر تحديث بيانات النقد'),
        ),
      ]);
      onRepaired?.();

    } catch (e) {
      toast({ title: 'تعذّر الإصلاح', description: e instanceof Error ? e.message : 'خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live integrity state */}
      <div className="stat-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Wrench className="w-4 h-4" />سلامة الترابط النقدي
          </h3>
          {integrity.clean ? (
            <Badge className="gap-1 bg-success/10 text-success border-success/20">
              <CheckCircle2 className="w-3 h-3" />لا توجد تحويلات بلا مصدر
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />{integrity.orphanTransfers.length} تحويل بلا مصدر
            </Badge>
          )}
        </div>

        {integrity.clean ? (
          <p className="text-xs text-muted-foreground">
            كل تحويل وارد مرتبط بدفعة أصل، وأرقام العهد (المتاح/المصروف/المتبقي) مطابقة لقواعد الربط.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              هذه التحويلات ترفع رصيد العهدة بمقدار {formatCurrency(integrity.inflatedAmount)} دون دفعة أصل.
            </p>
            {integrity.orphanTransfers.map((o) => (
              <div key={o.transferId} className="flex items-center justify-between gap-2 p-2 rounded border border-destructive/30 bg-destructive/5">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {custodyName(o.custodyId)} · {formatCurrency(o.amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">{o.transferDate}</p>
                </div>
                {!readOnly && (
                  <Button size="sm" variant="outline" onClick={() => { setTarget(o); setReason(''); }}>
                    إصلاح
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Repair audit log */}
      <div className="stat-card space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <History className="w-4 h-4" />سجل إصلاح التحويلات بلا مصدر
        </h3>
        {loading ? (
          <p className="text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : repairs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا توجد عمليات إصلاح مسجّلة لهذا المشروع</p>
        ) : (
          <div className="space-y-2">
            {repairs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetail(r)}
                className="w-full text-start p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">
                    {r.custodyName || r.custodyId || '—'} · {formatCurrency(r.amount)}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                    {r.createdAt.split('T')[0]}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{r.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.performedByEmail ?? r.performedBy}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirm repair */}
      <InspectorPanel
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        title="إصلاح تحويل بلا دفعة أصل"
        description="سيُحذف سجل التحويل ويُسجَّل في سجل التدقيق مع صورة الأرقام قبل وبعد."
        width="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setTarget(null)} disabled={saving}>إلغاء</Button>
            <Button size="sm" onClick={handleRepair} disabled={saving}>{saving ? 'جارٍ التنفيذ…' : 'تنفيذ الإصلاح'}</Button>
          </div>
        }
      >
        {target && (
          <>
            <InspectorSection title="التحويل">
              <InspectorField label="العهدة" value={custodyName(target.custodyId)} />
              <InspectorField label="المبلغ" value={formatCurrency(target.amount)} mono />
              <InspectorField label="التاريخ" value={target.transferDate} mono />
              <InspectorField label="الدفعة المفقودة" value={target.missingFundId} />
            </InspectorSection>
            <InspectorSection title="سبب الحذف">
              <Label className="sr-only">سبب الحذف</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: سجل يتيم ناتج عن حذف دفعة سابقة — لا يقابله نقد فعلي."
                rows={3}
              />
            </InspectorSection>
          </>
        )}
      </InspectorPanel>

      {/* Before / after detail */}
      <InspectorPanel
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        title="تفاصيل عملية الإصلاح"
        description={detail ? new Date(detail.createdAt).toISOString().replace('T', ' ').slice(0, 16) : undefined}
        width="lg"
      >
        {detail && (
          <>
            <InspectorSection title="الملخص">
              <InspectorField label="العهدة" value={detail.custodyName ?? detail.custodyId ?? '—'} />
              <InspectorField label="المبلغ المحذوف" value={formatCurrency(detail.amount)} mono />
              <InspectorField label="تاريخ التحويل" value={detail.transferDate ?? '—'} mono />
              <InspectorField label="الدفعة المفقودة" value={detail.missingFundId ?? '—'} />
              <InspectorField label="المنفِّذ" value={detail.performedByEmail ?? detail.performedBy} />
              <InspectorField label="السبب" value={detail.reason} />
            </InspectorSection>
            <InspectorSection title="الأرقام قبل / بعد">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SnapshotTable title="قبل" snap={detail.before?.custody} />
                <SnapshotTable title="بعد" snap={detail.after?.custody} />
              </div>
            </InspectorSection>
          </>
        )}
      </InspectorPanel>
    </div>
  );
}
