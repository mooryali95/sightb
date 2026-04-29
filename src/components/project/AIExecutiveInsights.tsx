import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AISummary {
  headline?: string;
  highlights?: string[];
  concerns?: string[];
  recommendations?: string[];
  error?: string;
}

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
      const { data, error } = await supabase.functions.invoke('ai-executive-summary', { body: context });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setSummary({ error: data.error });
      } else {
        setSummary(data);
      }
    } catch (e: any) {
      const msg = e?.message || 'فشل توليد الملخص الذكي';
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
            <p className="font-medium text-foreground border-r-2 border-primary pr-3">{summary.headline}</p>
          )}
          {summary.highlights && summary.highlights.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">✓ نقاط قوة</p>
              <ul className="space-y-1 text-xs text-muted-foreground pr-4">
                {summary.highlights.map((h, i) => <li key={i} className="list-disc">{h}</li>)}
              </ul>
            </div>
          )}
          {summary.concerns && summary.concerns.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">⚠ مخاوف</p>
              <ul className="space-y-1 text-xs text-muted-foreground pr-4">
                {summary.concerns.map((c, i) => <li key={i} className="list-disc">{c}</li>)}
              </ul>
            </div>
          )}
          {summary.recommendations && summary.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-primary mb-1">→ توصيات</p>
              <ul className="space-y-1 text-xs text-muted-foreground pr-4">
                {summary.recommendations.map((r, i) => <li key={i} className="list-disc">{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
