import { describe, it, expect, vi } from 'vitest';
import { runEach } from '../run-each';

describe('runEach', () => {
  it('runs every item in order, keeps going past a refusal, and reports both', async () => {
    const order: number[] = [];
    const progress = vi.fn();
    const r = await runEach([1, 2, 3], async (n) => {
      order.push(n);
      if (n === 2) throw new Error('رصيد الدفعة لا يكفي');
    }, progress);
    expect(order).toEqual([1, 2, 3]);
    expect(r.done).toEqual([1, 3]);
    expect(r.failed).toEqual([{ item: 2, message: 'رصيد الدفعة لا يكفي' }]);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it('waits for each before starting the next', async () => {
    let running = 0; let peak = 0;
    await runEach([1, 2, 3], async () => { running += 1; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running -= 1; });
    expect(peak).toBe(1);
  });
});
