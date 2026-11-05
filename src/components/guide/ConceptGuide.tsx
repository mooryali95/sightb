import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CONCEPTS, FLOW } from './concepts';

const SEEN_KEY = 'rouya_concept_guide_seen';

function GuideBody() {
  return (
    <div className="space-y-5 text-sm">
      <ol className="space-y-1.5 list-decimal ps-5 marker:text-muted-foreground">
        {FLOW.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <dl className="space-y-3">
        {CONCEPTS.map((c) => (
          <div key={c.term}>
            <dt className="font-semibold">{c.term}</dt>
            <dd className="text-muted-foreground leading-relaxed">{c.meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The guide on demand, from the sidebar. */
export function ConceptGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>دليل المفاهيم</DialogTitle>
          <DialogDescription>كيف تتحرك الأموال في النظام، وما تعنيه كل كلمة.</DialogDescription>
        </DialogHeader>
        <GuideBody />
      </DialogContent>
    </Dialog>
  );
}

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };
// '0' (or nothing) means not yet seen.

/**
 * Shown once, on the dashboard, to someone who has not dismissed it; after
 * that the guide lives in the sidebar. A storage that cannot be read counts
 * as seen, so a private window is not nagged on every visit.
 */
export function FirstRunGuide() {
  const [hidden, setHidden] = useState(seen);
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* the card still closes */ }
    setHidden(true);
  };
  return (
    <section aria-labelledby="first-run-guide" className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-6 flex items-start gap-3">
      <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <h2 id="first-run-guide" className="font-semibold text-sm">جديد على النظام؟</h2>
        <p className="text-sm text-muted-foreground mt-0.5">دقيقة واحدة تشرح الدفعة والعهدة والسلفة والمستحق والالتزام، وكيف تنتقل الأموال بينها.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>اقرأ الدليل</Button>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="إخفاء الدليل" onClick={dismiss}>
        <X className="w-4 h-4" />
      </Button>
      <ConceptGuideDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) dismiss(); }} />
    </section>
  );
}
