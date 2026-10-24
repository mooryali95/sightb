import { describe, it, expect } from 'vitest';
import type { Portfolio, Project } from '@/types/project';
import { planMove } from '../project-placement';

const project = { id: 'p1', name: 'برج الأفق', companyId: 'c1', portfolioId: 'pf1' } as Project;
const portfolios = [
  { id: 'pf1', name: 'السكني', companyId: 'c1' }, { id: 'pf2', name: 'التجاري', companyId: 'c1' }, { id: 'pf9', name: 'الخارجي', companyId: 'c2' },
] as Portfolio[];
const ctx = (editable: string[]) => ({
  portfolios, companyName: (id: string) => ({ c1: 'الأفق', c2: 'المدار' } as Record<string, string>)[id], canEditCompany: (id: string) => editable.includes(id),
});

describe('planMove', () => {
  it('does nothing when dropped where it already is', () => {
    expect(planMove(project, { companyId: 'c1', portfolioId: 'pf1' }, ctx(['c1']))).toEqual({ kind: 'noop' });
  });

  it('moves within the company between portfolios and out to standalone', () => {
    expect(planMove(project, { companyId: 'c1', portfolioId: 'pf2' }, ctx(['c1']))).toMatchObject({
      kind: 'within', summary: 'نقل «برج الأفق» من محفظة «السكني» إلى محفظة «التجاري»',
    });
    expect(planMove(project, { companyId: 'c1', portfolioId: null }, ctx(['c1']))).toMatchObject({ kind: 'within', summary: expect.stringContaining('المشاريع المستقلة') });
  });

  it('refuses another company\'s portfolio under this company', () => {
    expect(planMove(project, { companyId: 'c1', portfolioId: 'pf9' }, ctx(['c1', 'c2']))).toEqual({ kind: 'blocked', reason: 'المحفظة لا تتبع الشركة المختارة' });
  });

  it('moves across companies only with edit rights on both, and says what moves with it', () => {
    expect(planMove(project, { companyId: 'c2', portfolioId: 'pf9' }, ctx(['c1']))).toMatchObject({ kind: 'blocked' });
    expect(planMove(project, { companyId: 'c2', portfolioId: 'pf9' }, ctx(['c2']))).toMatchObject({ kind: 'blocked' });
    const plan = planMove(project, { companyId: 'c2', portfolioId: 'pf9' }, ctx(['c1', 'c2']));
    expect(plan).toMatchObject({ kind: 'across', summary: 'نقل «برج الأفق» من الأفق إلى المدار — محفظة «الخارجي»' });
    expect(plan.kind === 'across' && plan.warnings.length).toBe(4);
  });

  it('refuses a move inside a company the user cannot edit', () => {
    expect(planMove(project, { companyId: 'c1', portfolioId: 'pf2' }, ctx([]))).toMatchObject({ kind: 'blocked' });
  });
});
