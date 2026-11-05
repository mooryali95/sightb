import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';

/**
 * Run an action the person started and, if the database refuses it, say why.
 *
 * Store actions throw on a refusal (a trigger's Arabic reason, a permission).
 * A handler that only awaited them turned the refusal into an unhandled
 * promise: no toast, the dialog still open, nothing saved — the «تحويل الدفعة
 * إلى محصّل لا يفعل شيئاً» report. Returns whether the action went through, so a
 * dialog closes only on success and keeps what was typed otherwise.
 */
export async function runOrToast(action: () => Promise<unknown>, fallback = 'تعذّر إتمام العملية'): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (e) {
    toast.error(errorMessage(e, fallback));
    return false;
  }
}
