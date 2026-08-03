/**
 * ServerTruthCard — يقارن أرقام الواجهة بأرقام الخادم.
 *
 * الخادم (`project_financial_summary`) هو المرجع النهائي. إذا اختلف
 * رقم محسوب في المتصفح عن نظيره في قاعدة البيانات، يظهر هنا فوراً
 * بدل أن يمرّ صامتاً بين الشاشات.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, ServerCog } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { fetchProjectFinancialSummary, type ServerProjectSummary } from '@/services/projectSummaryService';
import { logger } from '@/lib/logger';

interface ClientFigures {
  totalActualExpenses: number;
  totalTransferredFunds: number;
  outstandingAdvances: number;
  totalCustodyDraw: number;
  remainingFunds: number;
  profit: number;
}

interface Props {
  projectId: string;
  currency: string;
  client: ClientFigures;
}

const LABELS: Record<keyof ClientFigures, string> = {
  totalActualExpenses: 'إجمالي المصروفات الفعلية',
  totalTransferredFunds: 'إجمالي الدفعات المحوّلة',
  outstandingAdvances: 'السلف القائمة',
  totalCustodyDraw: 'المسحوب للعُهد',
  remainingFunds: 'المتبقي من الدفعات',
  profit: 'الربح المتوقع',
};

/** فرق أقل من هللة واحدة ليس اختلافاً حقيقياً. */
const TOLERANCE = 0.01;

export function ServerTruthCard({ projectId, currency, client }: Props) {
  const [server, setServer] = useState<ServerProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setServer(await fetchProjectFinancialSummary(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر جلب الملخص من الخادم.');
      logger.capture('ServerTruthCard', e, { projectId });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const rows = server
    ? (Object.keys(LABELS) as (keyof ClientFigures)[]).map((key) => {
        const serverValue = server[key] as number;
        const clientValue = client[key];
        return { key, serverValue, clientValue, diff: clientValue - serverValue };
      })
    : [];

  const mismatches = rows.filter((r) => Math.abs(r.diff) > TOLERANCE);

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ServerCog className="w-4 h-4 text-primary" />
            مطابقة أرقام الخادم (المرجع النهائي)
          </CardTitle>
          <div className="flex items-center gap-2">
            {server && (
              mismatches.length === 0 ? (
                <Badge variant="outline" className="bg-success/10 text-success border-success/25 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> مطابق تماماً
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/25 gap-1">
                  <AlertTriangle className="w-3 h-3" /> {mismatches.length} فرق
                </Badge>
              )
            )}
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && loading && !server && (
          <p className="text-xs text-muted-foreground">جارٍ حساب الأرقام على الخادم…</p>
        )}
        {server && (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground pb-1 border-b border-border/50">
              <div className="col-span-6 md:col-span-5">البند</div>
              <div className="col-span-3 text-left" dir="ltr">الخادم</div>
              <div className="col-span-3 md:col-span-4 text-left" dir="ltr">الواجهة</div>
            </div>
            {rows.map((r) => {
              const mismatch = Math.abs(r.diff) > TOLERANCE;
              return (
                <div key={r.key} className="grid grid-cols-12 gap-2 py-1.5 items-center border-b border-border/30 last:border-b-0">
                  <div className="col-span-6 md:col-span-5 text-sm">{LABELS[r.key]}</div>
                  <div className="col-span-3 text-sm font-mono text-left" dir="ltr">
                    {formatCurrency(r.serverValue, currency)}
                  </div>
                  <div
                    className={`col-span-3 md:col-span-4 text-sm font-mono text-left ${mismatch ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                    dir="ltr"
                  >
                    {formatCurrency(r.clientValue, currency)}
                    {mismatch && <span className="ms-1 text-[10px]">(Δ {formatCurrency(r.diff, currency)})</span>}
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground pt-2">
              محسوب على الخادم عبر <span className="font-mono">project_financial_summary()</span> —{' '}
              {new Date(server.computedAt).toLocaleString('en-GB')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
