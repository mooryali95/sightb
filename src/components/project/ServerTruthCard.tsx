/**
 * ServerTruthCard — يقارن أرقام الواجهة بأرقام الخادم مع سجل تدقيق لكل رقم.
 *
 * الخادم (`project_financial_summary`) هو المرجع النهائي. لكل بند:
 * القيمة من الجانبين، الفرق، تفكيك المكوّنات (مبالغ + تحويلات + مصروفات + سلف)
 * ومصدر كل مكوّن، وسبب الفرق إن وجد.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RefreshCw, ServerCog, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import type { SsotFigure, SsotKey } from '@/lib/ssot-report';
import { useSsotHealth } from '@/hooks/useSsotHealth';

interface Props {
  projectId: string;
  currency: string;
  audit: Record<SsotKey, SsotFigure>;
}

export function ServerTruthCard({ projectId, currency, audit }: Props) {
  const { rows, mismatches, loading, error, computedAt, refetch } = useSsotHealth(projectId, audit);
  const [open, setOpen] = useState<SsotKey | null>(null);

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ServerCog className="w-4 h-4 text-primary" />
            مطابقة أرقام الخادم (المرجع النهائي)
          </CardTitle>
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
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
            <Button variant="ghost" size="sm" onClick={refetch} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && loading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">جارٍ حساب الأرقام على الخادم…</p>
        )}
        {rows.length > 0 && (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground pb-1 border-b border-border/50">
              <div className="col-span-6 md:col-span-5">البند</div>
              <div className="col-span-3 text-left" dir="ltr">الخادم</div>
              <div className="col-span-3 md:col-span-4 text-left" dir="ltr">الواجهة</div>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="border-b border-border/30 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.key ? null : r.key)}
                  className="w-full grid grid-cols-12 gap-2 py-1.5 items-center text-start hover:bg-muted/40 rounded-sm transition-colors"
                >
                  <div className="col-span-6 md:col-span-5 text-sm flex items-center gap-1">
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open === r.key ? 'rotate-180' : ''}`} />
                    {r.label}
                  </div>
                  <div className="col-span-3 text-sm font-mono text-left" dir="ltr">
                    {formatCurrency(r.serverValue, currency)}
                  </div>
                  <div
                    className={`col-span-3 md:col-span-4 text-sm font-mono text-left ${r.mismatch ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                    dir="ltr"
                  >
                    {formatCurrency(r.clientValue, currency)}
                    {r.mismatch && <span className="ms-1 text-xs">(Δ {formatCurrency(r.diff, currency)})</span>}
                  </div>
                </button>

                {open === r.key && (
                  <div className="pb-3 px-1 space-y-2">
                    <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1" dir="ltr">
                      {r.formula}
                    </div>
                    <div className="rounded-md border border-border/60 overflow-hidden">
                      <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1">
                        <div className="col-span-6">المكوّن</div>
                        <div className="col-span-3 text-left" dir="ltr">القيمة</div>
                        <div className="col-span-3 text-left" dir="ltr">المصدر</div>
                      </div>
                      {r.components.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">لا توجد مكوّنات مسجّلة.</div>
                      )}
                      {r.components.map((c, i) => (
                        <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1 text-xs border-t border-border/40">
                          <div className="col-span-6">
                            <span className="font-mono me-1 text-muted-foreground">{c.sign}</span>{c.label}
                          </div>
                          <div className="col-span-3 font-mono text-left" dir="ltr">{formatCurrency(c.value, currency)}</div>
                          <div className="col-span-3 font-mono text-left text-muted-foreground" dir="ltr">{c.source}</div>
                        </div>
                      ))}
                    </div>
                    {r.reason && (
                      <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                        سبب الفرق المحتمل: {r.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              محسوب على الخادم عبر <span className="font-mono">project_financial_summary()</span> —{' '}
              {computedAt ? new Date(computedAt).toLocaleString('en-GB') : '—'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
