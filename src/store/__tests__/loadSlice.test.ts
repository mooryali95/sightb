/**
 * The thirteenth layer: the realtime path on the project detail screen.
 *
 * `subscribeToProject` keeps five tables in sync while a project is open —
 * expenses, revenues, milestones, budget items and change orders. It is the
 * one place where rows enter the store without anyone in the app asking for
 * them, which makes it the one place where a row can arrive that is already
 * there.
 *
 * That is not hypothetical. Every write in the store adds its row optimistically
 * and the database then broadcasts the same INSERT back to the client that made
 * it, so a self-echo is the normal case rather than the edge one. A list that
 * takes it at face value holds the same expense twice, and every figure built on
 * that list — custody spend, fund remaining, dashboard totals, variance —
 * counts it twice until the page is reloaded.
 *
 * The logic used to sit inside the subscription callback where no test could
 * reach it. It is pulled out here for the same reason
 * `applyCashTransferRealtimeEvent` was, and now carries the same guard.
 */
import { describe, it, expect } from 'vitest';
import { applyProjectRealtimeEvent } from '@/store/slices/loadSlice';

interface Row { id: string; amount: number }
const map = (d: never): Row => {
  const r = d as unknown as { id: string; amount: number | string };
  return { id: r.id, amount: Number(r.amount) };
};

const row = (id: string, amount: number | string = 100) => ({ id, amount });

describe('a row the client already holds is not added again', () => {
  /**
   * The one that matters, and the one that was failing before this layer: the
   * client records an expense, the store prepends it, and realtime hands the
   * same INSERT straight back.
   */
  it('ignores an INSERT for an id already in the list', () => {
    const list: Row[] = [{ id: 'exp-1', amount: 750 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'INSERT', new: row('exp-1', 750) }, map);

    expect(next).toHaveLength(1);
    expect(next).toBe(list);
  });

  it('still adds a row written by somebody else', () => {
    const list: Row[] = [{ id: 'exp-1', amount: 750 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'INSERT', new: row('exp-2', 400) }, map);

    expect(next.map((r) => r.id)).toEqual(['exp-2', 'exp-1']);
  });

  /**
   * The duplicate is judged on identity, not on content. Two genuinely separate
   * expenses of the same amount on the same day are ordinary, and dropping the
   * second would lose real money from the ledger — the opposite mistake, and a
   * worse one.
   */
  it('does not mistake an identical amount for the same row', () => {
    const list: Row[] = [{ id: 'exp-1', amount: 750 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'INSERT', new: row('exp-2', 750) }, map);

    expect(next).toHaveLength(2);
  });

  /**
   * The duplicate check has to be on the id alone, not on the whole row.
   *
   * The optimistic copy and the stored one are routinely not identical: a
   * trigger can adjust a column, the server can normalise a number, and an
   * offline write maps the local row rather than the returned one. Comparing
   * whole rows would call those "different" and add a second copy carrying the
   * same id — which is the duplicate this guard exists to stop, arriving
   * through the guard itself.
   */
  it('treats a row with the same id but changed content as already present', () => {
    const list: Row[] = [{ id: 'exp-1', amount: 750 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'INSERT', new: row('exp-1', 812) }, map);

    expect(next).toHaveLength(1);
    expect(next.filter((r) => r.id === 'exp-1')).toHaveLength(1);
  });
});

describe('updates and deletes', () => {
  it('replaces a row in place, keeping its position', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }, { id: 'b', amount: 2 }, { id: 'c', amount: 3 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'UPDATE', new: row('b', 99) }, map);

    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(next.find((r) => r.id === 'b')?.amount).toBe(99);
  });

  /**
   * The channel filters on project_id, but a row can be moved between projects,
   * and an UPDATE for a row this client never held must not smuggle it in.
   */
  it('adds nothing on an UPDATE for a row it does not hold', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'UPDATE', new: row('ghost', 5) }, map);

    expect(next.map((r) => r.id)).toEqual(['a']);
  });

  it('removes the deleted row and only that one', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }, { id: 'b', amount: 2 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'DELETE', old: { id: 'a' } }, map);

    expect(next.map((r) => r.id)).toEqual(['b']);
  });
});

describe('events that should change nothing, change nothing', () => {
  /**
   * Returning the same array rather than an equal copy matters: every one of
   * these events would otherwise re-render every consumer of the list for a
   * change that did not happen.
   */
  it('returns the same array for a DELETE with no id, and for an unknown event', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }];

    expect(applyProjectRealtimeEvent(list, { eventType: 'DELETE', old: {} }, map)).toBe(list);
    expect(applyProjectRealtimeEvent(list, { eventType: 'DELETE' }, map)).toBe(list);
    expect(applyProjectRealtimeEvent(list, { eventType: 'TRUNCATE' }, map)).toBe(list);
  });

  it('returns the same array when INSERT or UPDATE arrive with no row', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }];

    expect(applyProjectRealtimeEvent(list, { eventType: 'INSERT' }, map)).toBe(list);
    expect(applyProjectRealtimeEvent(list, { eventType: 'UPDATE' }, map)).toBe(list);
  });
});

describe('the mapper is applied, not bypassed', () => {
  /**
   * Realtime delivers raw database rows, so numerics arrive as strings just as
   * they do over REST. A row pushed in unmapped keeps that string, and the next
   * sum over the list concatenates instead of adding.
   */
  it('maps an inserted row rather than storing it raw', () => {
    const next = applyProjectRealtimeEvent([], { eventType: 'INSERT', new: row('a', '750') }, map);

    expect(next[0].amount).toBe(750);
    expect(next[0].amount + 250).toBe(1000);
  });

  it('maps an updated row too', () => {
    const list: Row[] = [{ id: 'a', amount: 1 }];

    const next = applyProjectRealtimeEvent(list, { eventType: 'UPDATE', new: row('a', '750') }, map);

    expect(next[0].amount).toBe(750);
  });
});
