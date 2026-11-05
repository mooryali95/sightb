import type { ClientErrorRow } from '@/services/errorReportService';

/** One bug as the owner sees it: every person and day it hit, added up. */
export interface ErrorGroup {
  key: string;
  scope: string;
  message: string;
  occurrences: number;
  people: number;
  firstSeen: string;
  lastSeen: string;
  paths: string[];
  sample: ClientErrorRow;
}

/** Rows are per person per day; the fingerprint names the bug, ignoring the ids and numbers in its message. */
export function groupErrors(rows: ClientErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, { rows: ClientErrorRow[] }>();
  for (const r of rows) {
    const key = r.fingerprint;
    const g = groups.get(key) ?? { rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, { rows: rs }]) => {
    const latest = rs.reduce((a, b) => (a.lastSeen >= b.lastSeen ? a : b));
    return {
      key,
      scope: latest.scope,
      message: latest.message,
      occurrences: rs.reduce((s, r) => s + r.occurrences, 0),
      people: new Set(rs.map((r) => r.userId)).size,
      firstSeen: rs.reduce((m, r) => (r.firstSeen < m ? r.firstSeen : m), rs[0].firstSeen),
      lastSeen: latest.lastSeen,
      paths: [...new Set(rs.map((r) => r.path).filter((p): p is string => !!p))].slice(0, 5),
      sample: latest,
    };
  }).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

/** Errors seen in the last day, for the badge and the summary line. */
export function recentCount(groups: ErrorGroup[], now = Date.now()): number {
  return groups.filter((g) => now - new Date(g.lastSeen).getTime() < 86_400_000).length;
}
