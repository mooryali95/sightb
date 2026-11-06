import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { generateExecutiveSummary, type AISummary } from '@/services/aiService';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';

interface Props {
  context: Record<string, unknown>;
}

export function AIExecutiveInsights({ context }: Props) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AISummary | null>(null);

  const generate = async () => {
    setLoading(true);
    setSummary(null);
    try {
      const data = await generateExecutiveSummary(context);
      if (data?.error) {
        toast.error(data.error);
        setSummary({ error: data.error });
      } else {
        setSummary(data);
      }
    } catch (e) {
      const msg = errorMessage(e, 'فشل توليد الملخص الذكي');
      toast.error(msg);
      setSummary({ error: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 mb-4 border-primary/20 bg-gradient-to-l from-primary/5 to-transparent">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">رؤى تنفيذية ذكية</h3>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? 'جاري التحليل...' : summary ? 'إعادة التحليل' : 'توليد ملخص ذكي'}
        </Button>
      </div>

      {!summary && !loading && (
        <p className="text-xs text-muted-foreground">
          استخدم الذكاء الاصطناعي لتوليد رؤية تنفيذية مختصرة عن حالة المشروع وتوصيات قابلة للتنفيذ.
        </p>
      )}

      {summary?.error && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{summary.error}</span>
        </div>
      )}

      {summary && !summary.error && (
        <div className="space-y-3 text-sm">
          {summary.headline && (
            <p className="font-medium text-foreground border-s-2 border-primary ps-3">{summary.headline}</p>
          )}
          {summary.highlights && summary.highlights.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-success mb-1">✓ نقاط قوة</p>
              <ul className="space-y-1 text-xs text-muted-foreground ps-4">
                {summary.highlights.map((h, i) => <li key={i} className="list-disc">{h}</li>)}
              </ul>
            </div>
          )}
          {summary.concerns && summary.concerns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-warning mb-1">⚠ مخاوف</p>
              <ul className="space-y-1 text-xs text-muted-foreground ps-4">
                {summary.concerns.map((c, i) => <li key={i} className="list-disc">{c}</li>)}
              </ul>
            </div>
          )}
          {summary.recommendations && summary.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-primary mb-1">→ توصيات</p>
              <ul className="space-y-1 text-xs text-muted-foreground ps-4">
                {summary.recommendations.map((r, i) => <li key={i} className="list-disc">{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
