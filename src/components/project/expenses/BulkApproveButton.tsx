import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency, sumMoney } from '@/lib/finance';
import { runEach } from '@/lib/run-each';
import { countAr } from '@/lib/plural';
import type { Expense } from '@/types/project';

/**
 * Approves the pending expenses on screen in one go, after one confirmation
 * that names how many and how much. They go one at a time, so a refusal of
 * one (a fund without the balance) leaves the rest approved and is named.
 */
export function BulkApproveButton({ pending, approve }: { pending: Expense[]; approve: (id: string) => Promise<unknown> }) {
  const [busy, setBusy] = useState<number | null>(null);
  if (pending.length < 2) return null;
  const total = sumMoney(pending);

  const run = async () => {
    setBusy(0);
    const r = await runEach(pending, (e) => approve(e.id), setBusy);
    setBusy(null);
    if (r.failed.length === 0) {
      toast.success(`اعتُمدت المصروفات كلها (${r.done.length})`);
    } else {
      const first = r.failed[0];
      toast.error(`اعتُمد ${r.done.length} من ${pending.length}. لم يُعتمد «${first.item.description || 'مصروف'}»: ${first.message}${r.failed.length > 1 ? ` و${r.failed.length - 1} غيره` : ''}`);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="ms-auto gap-1.5" disabled={busy !== null}>
          <CheckCheck className="w-4 h-4" aria-hidden="true" />
          {busy !== null ? `جارٍ الاعتماد ${busy} من ${pending.length}` : `اعتماد الكل (${pending.length})`}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>اعتماد {countAr(pending.length, 'expense')}</AlertDialogTitle>
          <AlertDialogDescription>
            مجموعها <bdi>{formatCurrency(total)}</bdi>. تُعتمد واحداً بعد الآخر، وما يرفضه النظام يبقى معلّقاً ويُذكر لك.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={run}>اعتماد</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
