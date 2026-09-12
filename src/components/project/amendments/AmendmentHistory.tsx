/** The past amendments of a project, each approved one with its delta and a comparison. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, ArrowLeftRight } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { BUDGET_AMENDMENT_STATUS_LABELS, BUDGET_AMENDMENT_STATUS_COLORS, type BudgetAmendment } from '@/types/project';
import { ComparisonView } from './ComparisonView';

export function AmendmentHistory({ history }: { history: BudgetAmendment[] }) {
  const [comparisonOpen, setComparisonOpen] = useState<BudgetAmendment | null>(null);
  if (history.length === 0) return null;
  return (
    <>
      <div className="mt-4 pt-4 border-t border-border">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          سجل التعديلات ({history.length})
        </h4>
        <div className="space-y-1.5">
          {history.map((a) => {
            const delta = (a.totalAfter ?? 0) - a.totalBefore;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-muted/30 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${BUDGET_AMENDMENT_STATUS_COLORS[a.status]}`}>
                      {BUDGET_AMENDMENT_STATUS_LABELS[a.status]}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString('ar-SA', {
                        calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </span>
                    {a.status === 'approved' && (
                      <span className={`font-mono ${delta >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                      </span>
                    )}
                  </div>
                  <p className="truncate mt-0.5">{a.reason}</p>
                </div>
                {a.status === 'approved' && a.snapshotAfter && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 gap-1 shrink-0"
                    onClick={() => setComparisonOpen(a)}
                  >
                    <ArrowLeftRight className="w-3 h-3" /> مقارنة
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison dialog */}
      <Dialog open={!!comparisonOpen} onOpenChange={(v) => !v && setComparisonOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مقارنة الموازنة قبل وبعد التعديل</DialogTitle>
          </DialogHeader>
          {comparisonOpen && <ComparisonView amendment={comparisonOpen} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
