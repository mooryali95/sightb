import { useEffect, useMemo, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { auditCashIntegrity, type OrphanTransfer } from '@/lib/cash-integrity';
import { recordCashRepairEvent } from '@/lib/cash-repair-events';
import { listCashTransferRepairs, repairOrphanCashTransfer, type CashTransferRepair } from '@/services/cashRepairService';
import type { Custody, CashTransfer, ProjectFund, Expense, PaymentRequest } from '@/types/project';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { balanceSnapshot } from './cashrepair/balanceSnapshot';
import { IntegrityCard } from './cashrepair/IntegrityCard';
import { RepairLogCard } from './cashrepair/RepairLogCard';
import { RepairConfirmPanel } from './cashrepair/RepairConfirmPanel';
import { RepairDetailPanel } from './cashrepair/RepairDetailPanel';

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

/**
 * سجل تدقيق إصلاح التحويلات بلا مصدر + كاشف حي للتحويلات اليتيمة المتبقية.
 */
export function CashRepairLogSection({
  projectId, custodies, cashTransfers, funds, expenses, paymentRequests = [], readOnly, onRepaired,
}: Props) {
  const { toast } = useToast();
  const refreshCashDerivations = useStore((s) => s.refreshCashDerivations);
  const removeCashTransferLocal = useStore((s) => s.removeCashTransferLocal);
  const restoreCashTransferLocal = useStore((s) => s.restoreCashTransferLocal);

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
    const repaired = target;
    // لقطة الأرصدة قبل الإزالة التفاؤلية
    const before = balanceSnapshot(useStore.getState(), projectId, repaired.custodyId);
    // إزالة تفاؤلية: يختفي التحويل اليتيم فوراً من القائمة والأرصدة
    const removed = removeCashTransferLocal?.(repaired.transferId) ?? null;
    try {
      await repairOrphanCashTransfer(repaired.transferId, reason.trim());
      toast({ title: 'تم الإصلاح', description: 'حُذف التحويل بلا مصدر وسُجّلت الأرقام قبل/بعد.' });
      setTarget(null);
      setReason('');
      // إعادة مزامنة النقد في المتجر حتى تُصحّح الأرصدة من الخادم
      await Promise.all([
        load(),
        Promise.resolve(refreshCashDerivations?.(projectId)).catch((err) =>
          logger.error('cashRepair.resync', err instanceof Error ? err.message : 'تعذّر تحديث بيانات النقد'),
        ),
      ]);
      recordCashRepairEvent({
        projectId,
        at: new Date().toISOString(),
        transferId: repaired.transferId,
        custodyId: repaired.custodyId,
        custodyName: custodyName(repaired.custodyId),
        amount: repaired.amount,
        before,
        after: balanceSnapshot(useStore.getState(), projectId, repaired.custodyId),
      });
      onRepaired?.();
    } catch (e) {
      // تراجع تلقائي: يعود التحويل اليتيم للقائمة كما كان
      if (removed) restoreCashTransferLocal?.(removed);
      toast({ title: 'تعذّر الإصلاح', description: e instanceof Error ? e.message : 'خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <IntegrityCard
        integrity={integrity}
        custodyName={custodyName}
        readOnly={readOnly}
        saving={saving}
        repairingId={saving && target ? target.transferId : null}
        onRepair={(o) => { setTarget(o); setReason(''); }}
      />
      <RepairLogCard repairs={repairs} loading={loading} onOpen={setDetail} />
      <RepairConfirmPanel
        target={target}
        custodyName={custodyName}
        reason={reason}
        onReasonChange={setReason}
        saving={saving}
        onConfirm={handleRepair}
        onClose={() => setTarget(null)}
      />
      <RepairDetailPanel detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
