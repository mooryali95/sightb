/**
 * consistency-alerts.ts — سجل تنبيهات اتساق الصرف (قبل/بعد) لكل مشروع.
 *
 * يُخزَّن محلياً لكل مستخدم؛ التنبيه يُسجَّل مرة واحدة لكل «بصمة» اختلاف
 * (المشروع + البُعد + قيم الفجوة/غير المرتبط)، ويُحدَّث تاريخ آخر رصد عند
 * تكرار نفس الاختلاف — فيبقى تاريخ الاكتشاف الأول محفوظاً.
 */
import type { ConsistencyReport } from './spend-consistency';

const KEY = 'rouya.consistency-alerts.v1';

export interface ConsistencyAlert {
  id: string;
  projectId: string;
  projectName: string;
  dimension: 'resource' | 'category';
  /** بصمة الاختلاف لمنع التكرار. */
  fingerprint: string;
  totalGap: number;
  totalUnlinked: number;
  unlinkedCount: number;
  /** أبرز المجموعات المتأثرة. */
  topGroups: { key: string; label: string; gap: number }[];
  detectedAt: string;
  lastSeenAt: string;
  seenCount: number;
  resolvedAt: string | null;
}

function readAll(): ConsistencyAlert[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as ConsistencyAlert[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ConsistencyAlert[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function fingerprintOf(projectId: string, report: ConsistencyReport): string {
  return [projectId, report.dimension, r2(report.totalGap), r2(report.totalUnlinked), report.unlinkedCount].join('|');
}

/**
 * يسجّل التنبيه إن كان التقرير يحمل اختلافاً، ويُغلق التنبيهات السابقة لنفس
 * المشروع/البُعد عند اختفاء الاختلاف. يُرجع التنبيه النشط إن وُجد.
 */
export function recordConsistencyAlert(
  projectId: string,
  projectName: string,
  report: ConsistencyReport,
  now: string = new Date().toISOString(),
): ConsistencyAlert | null {
  const list = readAll();

  if (!report.hasIssues) {
    let changed = false;
    const next = list.map((a) => {
      if (a.projectId === projectId && a.dimension === report.dimension && !a.resolvedAt) {
        changed = true;
        return { ...a, resolvedAt: now };
      }
      return a;
    });
    if (changed) writeAll(next);
    return null;
  }

  const fingerprint = fingerprintOf(projectId, report);
  const existing = list.find((a) => a.fingerprint === fingerprint && !a.resolvedAt);
  if (existing) {
    const updated: ConsistencyAlert = { ...existing, lastSeenAt: now, seenCount: existing.seenCount + 1 };
    writeAll(list.map((a) => (a.id === updated.id ? updated : a)));
    return updated;
  }

  const alert: ConsistencyAlert = {
    id: globalThis.crypto?.randomUUID?.() ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    projectId,
    projectName,
    dimension: report.dimension,
    fingerprint,
    totalGap: r2(report.totalGap),
    totalUnlinked: r2(report.totalUnlinked),
    unlinkedCount: report.unlinkedCount,
    topGroups: report.rows
      .filter((r) => Math.abs(r.gap) > 0.01)
      .slice(0, 5)
      .map((r) => ({ key: r.key, label: r.label, gap: r2(r.gap) })),
    detectedAt: now,
    lastSeenAt: now,
    seenCount: 1,
    resolvedAt: null,
  };
  // إغلاق التنبيهات القديمة لنفس المشروع/البُعد ببصمة مختلفة (تغيّرت الأرقام).
  const closed = list.map((a) =>
    a.projectId === projectId && a.dimension === report.dimension && !a.resolvedAt
      ? { ...a, resolvedAt: now }
      : a,
  );
  writeAll([alert, ...closed]);
  return alert;
}

export function listConsistencyAlerts(projectId?: string): ConsistencyAlert[] {
  return readAll()
    .filter((a) => !projectId || a.projectId === projectId)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function countOpenAlerts(projectId?: string): number {
  return listConsistencyAlerts(projectId).filter((a) => !a.resolvedAt).length;
}

export function dismissConsistencyAlert(id: string, now: string = new Date().toISOString()): void {
  writeAll(readAll().map((a) => (a.id === id ? { ...a, resolvedAt: a.resolvedAt ?? now } : a)));
}

export function clearConsistencyAlerts(projectId?: string): void {
  writeAll(projectId ? readAll().filter((a) => a.projectId !== projectId) : []);
}
