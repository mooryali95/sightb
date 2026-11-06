import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { deleteWithUndo, flushPendingDeletes, pendingDeleteCount, UNDO_MS } from '../undo-delete';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type R = { id: string; title: string };
const rows: R[] = [{ id: 'a', title: 'أ' }, { id: 'b', title: 'ب' }, { id: 'c', title: 'ج' }];
const risks = () => (useStore.getState() as unknown as { risks: R[] }).risks.map((r) => r.id);
const undoOf = () => (vi.mocked(toast.success).mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }).action.onClick;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear();
  useStore.setState({ risks: rows } as never);
});
afterEach(async () => { await flushPendingDeletes(); vi.useRealTimers(); });

describe('deleteWithUndo', () => {
  it('takes the row off the screen at once and sends the delete only after the undo window', async () => {
    const commit = vi.fn(async () => undefined);
    deleteWithUndo({ collection: 'risks', id: 'b', row: rows[1], label: 'الخطر', commit });
    expect(risks()).toEqual(['a', 'c']);
    expect(toast.success).toHaveBeenCalledWith('حُذف الخطر', expect.objectContaining({ duration: UNDO_MS }));
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledWith(rows[1]);
    expect(pendingDeleteCount()).toBe(0);
  });

  it('puts the row back in its place on «تراجع», and nothing is deleted', async () => {
    const commit = vi.fn(async () => undefined);
    deleteWithUndo({ collection: 'risks', id: 'b', row: rows[1], label: 'الخطر', commit });
    undoOf()();
    expect(risks()).toEqual(['a', 'b', 'c']);
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('brings the row back with the reason when the database refuses', async () => {
    const commit = vi.fn(async () => { throw new Error('مرتبط بمصروفات'); });
    deleteWithUndo({ collection: 'risks', id: 'a', row: rows[0], label: 'الخطر', commit });
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(risks()).toEqual(['a', 'b', 'c']);
    expect(toast.error).toHaveBeenCalledWith('لم يُحذف الخطر: مرتبط بمصروفات');
  });

  it('sends every waiting delete at once when the page is left', async () => {
    const commit = vi.fn(async () => undefined);
    deleteWithUndo({ collection: 'risks', id: 'a', row: rows[0], label: 'الخطر', commit });
    deleteWithUndo({ collection: 'risks', id: 'c', row: rows[2], label: 'الخطر', commit });
    await flushPendingDeletes();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(pendingDeleteCount()).toBe(0);
  });

  it('ignores a second click on a row already waiting', () => {
    const commit = vi.fn(async () => undefined);
    deleteWithUndo({ collection: 'risks', id: 'a', row: rows[0], label: 'الخطر', commit });
    deleteWithUndo({ collection: 'risks', id: 'a', row: rows[0], label: 'الخطر', commit });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
