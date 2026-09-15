import { describe, expect, it } from 'vitest';
import type { Invite } from '../labels';
import { countInvites, deliveryFor, filterInvites, groupByEmail } from '../inviteFigures';

const invite = (over: Partial<Invite>): Invite => ({ id: 'i', email: 'a@x.com', role: 'editor', scopeType: 'project', scopeId: 'p1', status: 'pending', createdAt: '', ...over });
const rows = [
  invite({ id: 'i1', email: 'ali@x.com', status: 'sent' }),
  invite({ id: 'i2', email: 'ali@x.com', status: 'failed' }),
  invite({ id: 'i3', email: 'Sara@y.com', status: 'accepted' }),
  invite({ id: 'i4', email: 'omar@z.com', status: 'pending' }),
  invite({ id: 'i5', email: 'omar@z.com', status: 'odd' }),
];
const ids = (list: Invite[]) => list.map((i) => i.id);

describe('countInvites', () => {
  it('counts each known status and everything in all, unknown statuses only in all', () => {
    expect(countInvites(rows)).toEqual({ all: 5, pending: 1, sent: 1, failed: 1, accepted: 1 });
    expect(countInvites([])).toEqual({ all: 0, pending: 0, sent: 0, failed: 0, accepted: 0 });
  });
});

describe('filterInvites', () => {
  it('keeps everything for the empty filter and narrows by status', () => {
    expect(ids(filterInvites(rows, { status: 'all', query: '' }))).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
    expect(ids(filterInvites(rows, { status: 'failed', query: '' }))).toEqual(['i2']);
  });

  it('matches the email trimmed and regardless of case, together with the status', () => {
    expect(ids(filterInvites(rows, { status: 'all', query: ' SARA ' }))).toEqual(['i3']);
    expect(ids(filterInvites(rows, { status: 'pending', query: 'omar' }))).toEqual(['i4']);
    expect(ids(filterInvites(rows, { status: 'all', query: '   ' }))).toHaveLength(5);
  });
});

describe('groupByEmail', () => {
  it('groups under the email as written, in first-seen order', () => {
    expect(groupByEmail(rows).map(([email, list]) => [email, ids(list)])).toEqual([
      ['ali@x.com', ['i1', 'i2']], ['Sara@y.com', ['i3']], ['omar@z.com', ['i4', 'i5']],
    ]);
  });
});

describe('deliveryFor', () => {
  it('prefers the invite\'s own delivery, then the one keyed by its lower-cased email', () => {
    const own = { inviteId: 'i3', email: '', status: 'dlq', errorMessage: null, createdAt: '' };
    const byMail = { inviteId: null, email: '', status: 'sent', errorMessage: null, createdAt: '' };
    expect(deliveryFor(rows[2], { 'invite:i3': own, 'email:sara@y.com': byMail })).toBe(own);
    expect(deliveryFor(rows[2], { 'email:sara@y.com': byMail })).toBe(byMail);
    expect(deliveryFor(rows[2], { 'email:Sara@y.com': byMail })).toBeUndefined();
  });
});
