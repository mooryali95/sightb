/**
 * Component tests for the what-if analysis, written before its maths is
 * taken out. The sliders are Radix and are driven through their thumbs'
 * keyboard handling; what is tested is the scenario each setting produces
 * and the warnings it raises.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WhatIfSection } from '../WhatIfSection';

// The Radix slider measures itself; jsdom has no ResizeObserver.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

function renderSection() {
  // Contract 100,000; planned 80,000; spent 40,000; collected 50,000; 10 months; 50% done.
  return render(
    <WhatIfSection contractValue={100000} totalPlanned={80000} totalActual={40000} totalRevenue={50000} durationMonths={10} percentComplete={50} currency="SAR" />,
  );
}

const result = (title: string) => screen.getByText(title).parentElement as HTMLElement;
/** The four sliders, in the order they are laid out. */
const slider = (index: number) => screen.getAllByRole('slider')[index];
/** Moves a slider by keyboard: one step per key press. */
function nudge(index: number, steps: number) {
  const key = steps > 0 ? 'ArrowRight' : 'ArrowLeft';
  for (let i = 0; i < Math.abs(steps); i++) fireEvent.keyDown(slider(index), { key });
}

describe('the starting scenario', () => {
  it('shows the project as it is, with no reset and no warnings', () => {
    renderSection();
    expect(result('الربح المتوقع')).toHaveTextContent('20,000.00 ر.س');
    expect(result('الربح المتوقع')).toHaveTextContent('هامش: 20.0%');
    expect(result('المتبقي من الموازنة')).toHaveTextContent('40,000.00 ر.س');
    // 40,000 left at 8,000 a month.
    expect(result('المتبقي من الموازنة')).toHaveTextContent('5.0 شهر متبقي');
    // EV 40,000 against AC 40,000.
    expect(result('مؤشر CPI')).toHaveTextContent('1.00');
    expect(result('التكلفة المقدرة (EAC)')).toHaveTextContent('80,000.00 ر.س');
    expect(screen.queryByRole('button', { name: /إعادة ضبط/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/تحذير/)).not.toBeInTheDocument();
  });
});

describe('moving the sliders', () => {
  it('raises the contract and shows the gain against the original', () => {
    renderSection();
    nudge(0, 10);
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(result('الربح المتوقع')).toHaveTextContent('30,000.00 ر.س');
    expect(result('الربح المتوقع')).toHaveTextContent('+10,000.00 ر.س عن الأصلي');
    expect(screen.getByRole('button', { name: /إعادة ضبط/ })).toBeInTheDocument();
  });

  it('raises the spend, moves the plan with it, lowers the CPI, and warns of a loss and an overrun when it bites', () => {
    renderSection();
    nudge(1, 30);
    // Spent 52,000 and planned 104,000 against a 100,000 contract; EV stays 40,000.
    expect(result('الربح المتوقع')).toHaveTextContent('-4,000.00 ر.س');
    expect(result('مؤشر CPI')).toHaveTextContent('0.77');
    expect(result('مؤشر CPI')).toHaveTextContent('تجاوز التكلفة');
    // 104,000 / (40,000 / 52,000).
    expect(result('التكلفة المقدرة (EAC)')).toHaveTextContent('135,200.00 ر.س');
    expect(screen.getByText(/يؤدي إلى خسارة بقيمة 4,000\.00 ر\.س/)).toBeInTheDocument();
    expect(screen.getByText(/مؤشر أداء التكلفة منخفض جداً \(0\.77\)/)).toBeInTheDocument();
    expect(screen.queryByText(/تجاوز الموازنة بقيمة/)).not.toBeInTheDocument();
  });

  it('stretches the duration and slows the burn', () => {
    renderSection();
    nudge(2, 6);
    expect(screen.getByText('16 شهر')).toBeInTheDocument();
    // 40,000 left at 5,000 a month.
    expect(result('المتبقي من الموازنة')).toHaveTextContent('8.0 شهر متبقي');
  });

  it('resets every slider at once', () => {
    renderSection();
    nudge(0, 5);
    nudge(3, -20);
    expect(screen.getByText('-20%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إعادة ضبط/ }));
    expect(screen.queryByRole('button', { name: /إعادة ضبط/ })).not.toBeInTheDocument();
    expect(result('الربح المتوقع')).toHaveTextContent('20,000.00 ر.س');
    expect(within(screen.getAllByRole('slider')[3].closest('.space-y-3') as HTMLElement).getByText('0%')).toBeInTheDocument();
  });
});
