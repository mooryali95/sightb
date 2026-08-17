/**
 * spend-templates.ts — حفظ قوالب الفلاتر/النطاق الزمني/الفرز لمستكشف الصرف.
 * التخزين محلي لكل مستخدم (localStorage)، مع إمكانية حصر القالب بمشروع أو
 * جعله عاماً لكل المشاريع.
 */
import type { SpendDimension, SpendFilters, SpendSort } from './expense-analytics';

const KEY = 'rouya.spend-templates.v1';

export interface SpendTemplate {
  id: string;
  name: string;
  /** null = متاح لكل المشاريع. */
  projectId: string | null;
  dimensions: SpendDimension[];
  filters: SpendFilters;
  sort: SpendSort;
  createdAt: string;
}

function readAll(): SpendTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SpendTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: SpendTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* تجاهل امتلاء التخزين */
  }
}

/** قوالب المشروع الحالي + القوالب العامة. */
export function listSpendTemplates(projectId?: string): SpendTemplate[] {
  return readAll()
    .filter((t) => !t.projectId || !projectId || t.projectId === projectId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function saveSpendTemplate(
  input: Omit<SpendTemplate, 'id' | 'createdAt'>,
): SpendTemplate {
  const list = readAll();
  const existing = list.find((t) => t.name === input.name && t.projectId === input.projectId);
  const tpl: SpendTemplate = existing
    ? { ...existing, ...input }
    : {
        ...input,
        id: (globalThis.crypto?.randomUUID?.() ?? `tpl-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        createdAt: new Date().toISOString(),
      };
  const next = existing ? list.map((t) => (t.id === tpl.id ? tpl : t)) : [...list, tpl];
  writeAll(next);
  return tpl;
}

export function deleteSpendTemplate(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
