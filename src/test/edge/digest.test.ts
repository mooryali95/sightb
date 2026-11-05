/**
 * The morning digest: nothing is sent on an empty morning; the lines name
 * each project's pending expenses with their total and link to where they
 * are acted on; names cannot inject markup.
 */
import { describe, it, expect } from 'vitest';
import { hasNews, digestLines, digestSubject, digestHtml, type DigestPayload } from '../../../supabase/functions/_shared/digest.ts';

const empty: DigestPayload = { pending_expenses: [], payment_requests: 0, funds_unacknowledged: 0, new_errors: 0, error_occurrences: 0 };

describe('daily digest', () => {
  it('has nothing to say on an empty morning', () => {
    expect(hasNews(empty)).toBe(false);
    expect(hasNews({ ...empty, new_errors: 1, error_occurrences: 3 })).toBe(true);
  });

  it('names each project with its count and total, and links to it', () => {
    const p = { ...empty, pending_expenses: [{ id: 'p1', name: 'الهاكاثون', count: 3, total: 12500.5 }], funds_unacknowledged: 1 };
    expect(digestLines(p)).toEqual([
      { text: 'الهاكاثون: 3 مصروف بانتظار الاعتماد بمجموع 12,500.50 ر.س', link: 'https://sightb.lovable.app/project/p1' },
      { text: '1 دفعة حُوّلت ولم يؤكَّد استلامها', link: 'https://sightb.lovable.app/alerts' },
    ]);
    expect(digestSubject(p)).toBe('رؤية: 3 مصروف بانتظار اعتمادك');
    expect(digestSubject({ ...empty, new_errors: 1, error_occurrences: 1 })).toBe('رؤية: ملخص الصباح');
  });

  it('lists ten projects and sums up the rest', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, name: `م${i}`, count: 1, total: 1 }));
    const lines = digestLines({ ...empty, pending_expenses: many });
    expect(lines).toHaveLength(11);
    expect(lines[10].text).toBe('و3 مشاريع أخرى فيها مصروفات معلّقة');
  });

  it('escapes a project name', () => {
    const html = digestHtml({ ...empty, pending_expenses: [{ id: 'p1', name: '<img src=x onerror=alert(1)>', count: 1, total: 1 }] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
