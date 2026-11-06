import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { StartStep } from './gettingStarted';

const HIDDEN_KEY = 'rouya_getting_started_hidden';
const hidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; } };

/**
 * «ابدأ من هنا»: shown on the dashboard to someone who can edit, until every
 * step is done or they put it away. The next step is the one to act on, so it
 * is the only one with a button.
 */
export function GettingStarted({ steps }: { steps: StartStep[] }) {
  const [isHidden, setHidden] = useState(hidden);
  const done = steps.filter((s) => s.done).length;
  if (isHidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  const dismiss = () => {
    try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* the card still closes */ }
    setHidden(true);
  };
  return (
    <section aria-labelledby="getting-started" className="rounded-xl border border-border bg-card p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 id="getting-started" className="font-semibold">ابدأ من هنا</h2>
          <p className="text-sm text-muted-foreground">{done} من {steps.length} خطوات منجزة</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="إخفاء قائمة البداية" onClick={dismiss}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <Progress value={(done / steps.length) * 100} className="h-1.5 mb-4" aria-label="التقدم في خطوات البداية" />
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            {s.done
              ? <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-label="منجزة" />
              : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-label="لم تُنجز" />}
            <div className="flex-1 min-w-0">
              <p className={s.done ? 'text-sm text-muted-foreground line-through' : 'text-sm font-medium'}>{s.title}</p>
              {!s.done && <p className="text-xs text-muted-foreground">{s.hint}</p>}
            </div>
            {s === next && (
              <Button asChild size="sm" className="shrink-0">
                <Link to={s.link}>ابدأ</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
