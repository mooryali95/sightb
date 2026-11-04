import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Code2, AlertTriangle } from 'lucide-react';
import { explainSsotKey, type SsotExplanation } from '@/services/ssotService';
import { errorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/finance';
import { toast } from '@/hooks/use-toast';

interface Props {
  ssotKey: string;
  label: string;
  projectId: string;
  currency: string;
}

export function SsotExplainButton({ ssotKey, label, projectId, currency }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SsotExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null); setData(null);
    try {
      const r = await explainSsotKey(ssotKey, projectId);
      setData(r);
    } catch (e) {
      const msg = errorMessage(e, 'تعذّر جلب المصدر.');
      setError(msg);
      toast({ title: 'مصدر الحقيقة', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => { setOpen(true); load(); }}
        aria-label={`عرض مصدر ${label}`}
      >
        <Code2 className="w-3 h-3" /> SQL
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start">مصدر الرقم: {label}</DialogTitle>
            <DialogDescription className="text-start text-xs">
              الاستعلام الحقيقي المستخدم في قاعدة البيانات لحساب هذا الرقم، مع نتيجته الحالية وخطة تنفيذه (EXPLAIN).
              متاح لمدير النظام فقط.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin me-2" /> يتم التحميل…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-4">
              <section>
                <div className="text-xs font-semibold text-muted-foreground mb-1">النتيجة الحالية</div>
                <div className="rounded bg-muted/40 border border-border/60 px-3 py-2 font-mono text-lg" dir="ltr">
                  {formatCurrency(Number(data.result || 0), currency)}
                </div>
              </section>
              <section>
                <div className="text-xs font-semibold text-muted-foreground mb-1">SQL</div>
                <pre className="rounded bg-muted/40 border border-border/60 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap" dir="ltr">
{data.sql}
                </pre>
              </section>
              <section>
                <div className="text-xs font-semibold text-muted-foreground mb-1">EXPLAIN (JSON)</div>
                <pre className="rounded bg-muted/40 border border-border/60 p-3 text-xs font-mono overflow-x-auto max-h-64" dir="ltr">
{JSON.stringify(data.plan, null, 2)}
                </pre>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
