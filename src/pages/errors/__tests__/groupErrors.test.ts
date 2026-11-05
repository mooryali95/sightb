import { describe, it, expect } from 'vitest';
import { groupErrors, recentCount } from '../groupErrors';
import type { ClientErrorRow } from '@/services/errorReportService';

const row = (o: Partial<ClientErrorRow>): ClientErrorRow => ({
  id: Math.random().toString(), userId: 'u1', day: '2026-11-06', fingerprint: 'ErrorBoundary:a', scope: 'ErrorBoundary', message: 'boom', context: {},
  path: '/', release: 'b', userAgent: 'ua', occurrences: 1, firstSeen: '2026-11-06T08:00:00Z', lastSeen: '2026-11-06T08:00:00Z', ...o,
});

describe('groupErrors', () => {
  it('adds one bug up across people and days, and lists the newest first', () => {
    const g = groupErrors([
      row({ userId: 'u1', occurrences: 3, path: '/project/1', firstSeen: '2026-11-04T08:00:00Z', lastSeen: '2026-11-04T09:00:00Z' }),
      row({ userId: 'u2', occurrences: 2, path: '/project/2', lastSeen: '2026-11-06T10:00:00Z' }),
      row({ userId: 'u1', fingerprint: 'ErrorBoundary:b', message: 'other', lastSeen: '2026-11-05T10:00:00Z' }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ message: 'boom', occurrences: 5, people: 2, firstSeen: '2026-11-04T08:00:00Z', lastSeen: '2026-11-06T10:00:00Z', paths: ['/project/1', '/project/2'] });
    expect(g[1].message).toBe('other');
  });

  it('counts the bugs seen in the last day', () => {
    const now = new Date('2026-11-06T12:00:00Z').getTime();
    const g = groupErrors([row({ lastSeen: '2026-11-06T10:00:00Z' }), row({ fingerprint: 'x:old', message: 'old', lastSeen: '2026-11-04T10:00:00Z' })]);
    expect(recentCount(g, now)).toBe(1);
  });
});
