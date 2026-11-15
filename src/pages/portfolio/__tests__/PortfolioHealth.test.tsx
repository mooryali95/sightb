/**
 * «حالة مشاريع المحفظة»: the same health as the company map, in symbol and
 * words, over-budget projects first, each opening its project.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PortfolioHealth } from '../PortfolioHealth';
import type { MapProjectInput } from '@/lib/finance/company-map';

const p = (id: string, over: Partial<MapProjectInput> = {}): MapProjectInput => ({
  id, name: id, group: '', status: 'active', contract: 100000, planned: 80000, actual: 20000, collected: 0, ...over,
});
const show = (projects: MapProjectInput[]) => render(<MemoryRouter><PortfolioHealth projects={projects} /></MemoryRouter>);

describe('PortfolioHealth', () => {
  it('lists the over-budget project first, each with its status in words, linking to it', () => {
    show([p('سليم'), p('معلق', { status: 'on-hold' }), p('متجاوز', { actual: 90000 })]);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['متجاوز: تجاوز الموازنة', 'معلق: يحتاج انتباه', 'سليم: على المسار']);
    expect(links[0]).toHaveAttribute('href', '/project/متجاوز');
    expect(screen.getByRole('region', { name: 'حالة مشاريع المحفظة' })).toHaveTextContent('✕ تجاوز الموازنة 1');
  });

  it('draws nothing for an empty portfolio', () => {
    expect(show([]).container).toBeEmptyDOMElement();
  });
});
