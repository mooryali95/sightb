import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from 'sonner';
import { runOrToast } from '../run-or-toast';

describe('runOrToast', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it('says yes when the action goes through, and stays quiet', async () => {
    await expect(runOrToast(async () => 'ok')).resolves.toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the database's own reason when it refuses, and says no so the dialog stays open", async () => {
    const refusal = { message: 'لا يمكن تحصيل دفعة بلا تاريخ تحصيل', code: 'P0001' };
    await expect(runOrToast(async () => { throw refusal; }, 'تعذّر الحفظ')).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledWith('لا يمكن تحصيل دفعة بلا تاريخ تحصيل');
  });

  it('falls back to its own words when the throw carries none', async () => {
    await runOrToast(async () => { throw null; }, 'تعذّر الحفظ');
    expect(toast.error).toHaveBeenCalledWith('تعذّر الحفظ');
  });
});
