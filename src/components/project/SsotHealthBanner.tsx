/**
 * SsotHealthBanner — تحقق تلقائي عند فتح المشروع.
 * يعرض آخر وقت حُسبت فيه أرقام SSOT على الخادم، وهل تتطابق مع أرقام الواجهة،
 * مع روابط للسبب وزر للانتقال إلى تبويب «مصدر الحقيقة».
 */
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { buildSsotAudit } from '@/lib/ssot-report';
import { useSsotHealth } from '@/hooks/useSsotHealth';
import type {
  Project, Expense, Custody, PaymentRequest, CashTransfer, ProjectFund,
  FundSettlement, ChangeOrder,
} from '@/types/project';

interface Props {
  project: Project;
  expenses: Expense[];
  custodies: Custody[];
  paymentRequests: PaymentRequest[];
  cashTransfers: CashTransfer[];
  funds: ProjectFund[];
  settlements: FundSettlement[];
  changeOrders: ChangeOrder[];
  onInspect: () => void;
}

export function SsotHealthBanner({
  project, expenses, custodies, paymentRequests, cashTransfers,
  funds, settlements, changeOrders, onInspect,
}: Props) {
  const audit = buildSsotAudit({
    projectId: project.id,
    contractValue: project.contractValue,
    expenses, custodies, paymentRequests, cashTransfers, funds, settlements, changeOrders,
  });
  const { loading, error, computedAt, mismatches, rows, refetch } = useSsotHealth(project.id, audit);

  const stamp = computedAt ? new Date(computedAt).toLocaleString('en-GB') : '—';

  const tone = error
    ? 'border-warning/30 bg-warning/5 text-warning'
    : mismatches.length > 0
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-success/30 bg-success/5 text-success';

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2 flex items-center gap-2 flex-wrap text-xs ${tone}`}>
      {loading && rows.length === 0 ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : error || mismatches.length > 0 ? (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      )}

      <span className="font-semibold">
        {loading && rows.length === 0
          ? 'جارٍ التحقق من سلامة الأرقام…'
          : error
            ? 'تعذّر التحقق من أرقام الخادم'
            : mismatches.length === 0
              ? 'لا توجد تعارضات — أرقام الواجهة مطابقة للخادم'
              : `${mismatches.length} تعارض في الأرقام`}
      </span>

      {!loading && !error && (
        <span className="text-muted-foreground">
          آخر حساب SSOT: <span className="font-mono" dir="ltr">{stamp}</span>
        </span>
      )}

      {error && <span className="text-muted-foreground">{error}</span>}

      {mismatches.length > 0 && (
        <span className="text-muted-foreground">
          السبب: {mismatches.map((m) => m.label).join('، ')}
        </span>
      )}

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={refetch} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2" onClick={onInspect}>
          عرض التفاصيل
        </Button>
      </div>
    </div>
  );
}
