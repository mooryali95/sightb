import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { gettingStartedSteps } from '../gettingStarted';
import { GettingStarted } from '../GettingStarted';

const empty = { companies: 1, projectIds: [] as string[], budgetItems: 0, expenses: 0, revenues: 0 };

describe('gettingStartedSteps', () => {
  it('ticks each step from the data and points the next ones at the first project', () => {
    const steps = gettingStartedSteps({ ...empty, projectIds: ['p1', 'p2'], budgetItems: 3 });
    expect(steps.map((s) => [s.key, s.done])).toEqual([['company', true], ['project', true], ['budget', true], ['expense', false], ['revenue', false]]);
    expect(steps.find((s) => s.key === 'expense')!.link).toBe('/project/p1?group=finance&tab=expenses');
  });

  it('sends the project steps to the new-project page while there is none', () => {
    expect(gettingStartedSteps(empty).find((s) => s.key === 'budget')!.link).toBe('/project/new');
  });
});

describe('GettingStarted', () => {
  beforeEach(() => localStorage.removeItem('rouya_getting_started_hidden'));
  const show = (d = empty) => render(<MemoryRouter><GettingStarted steps={gettingStartedSteps(d)} /></MemoryRouter>);

  it('counts what is done and offers one button, on the next step', () => {
    show();
    expect(screen.getByText('1 من 5 خطوات منجزة')).toBeInTheDocument();
    const start = screen.getAllByRole('link', { name: 'ابدأ' });
    expect(start).toHaveLength(1);
    expect(start[0]).toHaveAttribute('href', '/project/new');
  });

  it('is gone once every step is done', () => {
    const { container } = show({ companies: 1, projectIds: ['p'], budgetItems: 1, expenses: 1, revenues: 1 });
    expect(container).toBeEmptyDOMElement();
  });

  it('stays gone once put away', () => {
    const first = show();
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء قائمة البداية' }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    show();
    expect(screen.queryByText('ابدأ من هنا')).toBeNull();
  });
});
