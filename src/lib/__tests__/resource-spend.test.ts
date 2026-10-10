import { describe, it, expect } from 'vitest';
import type { Expense, Resource } from '@/types/project';
import {
  normalizeArabicName, summarizeSpendByResource, matchesResourceQuery, UNLINKED_KEY,
} from '../resource-spend';

const res = (id: string, name: string, role?: string): Resource =>
  ({ id, projectId: 'p', name, role, monthlyCost: 0, createdAt: '' });
const exp = (over: Partial<Expense>): Expense =>
  ({ id: Math.random().toString(), projectId: 'p', amount: 0, approvalStatus: 'approved', ...over } as Expense);

const team = [res('r-ayman', 'أيمن أصلان', 'مهندس'), res('r-omar', 'عمر عبدالحميد'), res('r-ahmad', 'أحمد صبري')];

describe('normalizeArabicName', () => {
  it('treats hamza, ta marbuta, alef maqsura, diacritics and spacing as the same name', () => {
    expect(normalizeArabicName('أيمن  أصلان')).toBe(normalizeArabicName('ايمن اصلان'));
    expect(normalizeArabicName('مؤسسة الهدى')).toBe(normalizeArabicName('موسسه الهدي'));
    expect(normalizeArabicName('عُمَر')).toBe(normalizeArabicName('عمر'));
  });
});

describe('summarizeSpendByResource', () => {
  it('counts an expense typed with the name but never linked — the reported gap', () => {
    const out = summarizeSpendByResource([exp({ amount: 500, responsible: 'ايمن اصلان' })], team);
    expect(out[0]).toMatchObject({ key: 'r-ayman', total: 500, count: 1, matchedByName: 1 });
  });

  it('prefers the explicit link over the typed name', () => {
    const out = summarizeSpendByResource([exp({ amount: 100, resourceId: 'r-omar', responsible: 'أيمن أصلان' })], team);
    expect(out[0].key).toBe('r-omar');
  });

  it('falls back to the vendor field', () => {
    const out = summarizeSpendByResource([exp({ amount: 70, vendor: 'أحمد صبري' })], team);
    expect(out[0].key).toBe('r-ahmad');
  });

  it('puts what matches nobody in one bucket, last, so the cards always sum to the total', () => {
    const rows = [
      exp({ amount: 1000, resourceId: 'r-omar' }),
      exp({ amount: 300, responsible: 'مطبعة الرياض' }),
      exp({ amount: 2000, responsible: 'أحمد صبري' }),
    ];
    const out = summarizeSpendByResource(rows, team);
    expect(out.map((b) => b.key)).toEqual(['r-ahmad', 'r-omar', UNLINKED_KEY]);
    expect(out.reduce((s, b) => s + b.total, 0)).toBe(3300);
  });
});

describe('matchesResourceQuery', () => {
  it('finds by name or role, ignoring spelling variants', () => {
    const [ayman] = summarizeSpendByResource([exp({ amount: 1, resourceId: 'r-ayman' })], team);
    expect(matchesResourceQuery(ayman, 'ايمن')).toBe(true);
    expect(matchesResourceQuery(ayman, 'مهندس')).toBe(true);
    expect(matchesResourceQuery(ayman, 'عمر')).toBe(false);
    expect(matchesResourceQuery(ayman, '  ')).toBe(true);
  });
});
