import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { errorMessage } from '@/lib/utils';

/**
 * Delete with a way back. The row leaves the screen at once and stays in the
 * database for UNDO_MS; «تراجع» in the toast puts it back, and nothing was
 * deleted. Otherwise the delete is sent, and when the database refuses it the
 * row returns with the reason.
 *
 * Deferring, not deleting and re-inserting: a re-insert would come back
 * without what the delete cascaded away (attachments, links) and would log a
 * second creation. Leaving the page, or hiding it, sends every waiting delete
 * at once, so a closed tab does not keep a row the person removed.
 *
 * For light rows only (an expense, a revenue, a milestone, a risk, a change
 * order, a commitment); a fund, a custody, a project or a company keeps its
 * confirmation dialog, since what hangs on it is too much to judge in a toast.
 */
export const UNDO_MS = 6000;

type Row = { id: string };
type Collection = 'expenses' | 'revenues' | 'milestones' | 'risks' | 'changeOrders' | 'commitments';

const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => Promise<void> }>();

const rowsOf = (key: Collection) => (useStore.getState() as unknown as Record<Collection, Row[]>)[key];
const setRows = (key: Collection, rows: Row[]) => useStore.setState({ [key]: rows } as never);

export function deleteWithUndo<T extends Row>(opts: {
  collection: Collection;
  id: string;
  /** What was deleted, in words: «المصروف», «الخطر». */
  label: string;
  /** The row as the caller shows it; the store's copy is used when it has one. */
  row: T;
  /** Sends the delete; gets the row as it was. */
  commit: (row: T) => Promise<unknown>;
}): void {
  const { collection, id, label, commit } = opts;
  if (waiting.has(id)) return;
  const rows = rowsOf(collection);
  const index = rows.findIndex((r) => r.id === id);
  const row = (index >= 0 ? rows[index] : opts.row) as T;
  if (index >= 0) setRows(collection, rows.filter((r) => r.id !== id));

  const restore = () => {
    if (index < 0) return;
    const now = rowsOf(collection);
    if (now.some((r) => r.id === id)) return;
    const at = Math.min(index, now.length);
    setRows(collection, [...now.slice(0, at), row, ...now.slice(at)]);
  };

  const send = async () => {
    const entry = waiting.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    waiting.delete(id);
    try {
      await commit(row);
    } catch (err) {
      restore();
      toast.error(`لم يُحذف ${label}: ${errorMessage(err, 'رفضه النظام')}`);
    }
  };

  waiting.set(id, { timer: setTimeout(() => { void send(); }, UNDO_MS), send });
  toast.success(`حُذف ${label}`, {
    duration: UNDO_MS,
    action: {
      label: 'تراجع',
      onClick: () => {
        const entry = waiting.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        waiting.delete(id);
        restore();
      },
    },
  });
}

/** Sends every waiting delete now. */
export function flushPendingDeletes(): Promise<void[]> {
  return Promise.all([...waiting.values()].map((w) => w.send()));
}

/** How many deletes are waiting; for tests. */
export const pendingDeleteCount = () => waiting.size;

let installed = false;
/** Sends waiting deletes when the page is left or hidden (main.tsx). */
export function installDeleteFlush() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pagehide', () => { void flushPendingDeletes(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPendingDeletes();
  });
}
