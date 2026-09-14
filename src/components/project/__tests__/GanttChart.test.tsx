/**
 * Component tests for the Gantt chart, written before its timeline maths
 * is taken out. What is pinned: which milestones appear (dated ones
 * only), the columns of each view, where each bar starts and how wide it
 * is, the actual bar under a started milestone, the today line, and the
 * click handed back.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Milestone } from '@/types/project';
import { GanttChart } from '../GanttChart';

function milestone(over: Partial<Milestone>): Milestone {
  return { id: 'm', projectId: 'p', name: 'مرحلة', sortOrder: 0, percentComplete: 0, weight: 0, status: 'planned', createdAt: '', ...over };
}

// Two dated milestones in a past year, one undated. The timeline pads a week
// before the earliest date and two weeks after the latest: 2020-02-24 to
// 2020-04-14, fifty days.
const milestones: Milestone[] = [
  milestone({ id: 'design', name: 'التصميم', status: 'completed', percentComplete: 100, plannedStart: '2020-03-02', plannedEnd: '2020-03-12', actualStart: '2020-03-03', actualEnd: '2020-03-10' }),
  milestone({ id: 'build', name: 'التنفيذ', status: 'in_progress', percentComplete: 40, plannedStart: '2020-03-12', plannedEnd: '2020-03-31' }),
  milestone({ id: 'undated', name: 'بلا تاريخ', status: 'planned' }),
];

const rowFor = (name: string) => screen.getByText(name).closest('.border-b') as HTMLElement;
const plannedBar = (name: string) => rowFor(name).querySelector('.top-2') as HTMLElement;
const actualBar = (name: string) => rowFor(name).querySelector('.top-6') as HTMLElement | null;
const pct = (v: string | undefined) => parseFloat(v ?? 'NaN');

describe('the timeline', () => {
  it('lists the dated milestones only, under month columns spanning the padded range', () => {
    render(<GanttChart milestones={milestones} />);
    expect(screen.getByText('التصميم')).toBeInTheDocument();
    expect(screen.getByText('التنفيذ')).toBeInTheDocument();
    expect(screen.queryByText('بلا تاريخ')).not.toBeInTheDocument();
    expect(screen.getByText('فبراير 2020')).toBeInTheDocument();
    expect(screen.getByText('مارس 2020')).toBeInTheDocument();
    expect(screen.getByText('أبريل 2020')).toBeInTheDocument();
    expect(screen.queryByText('مايو 2020')).not.toBeInTheDocument();
    // No today line: the range is long past.
    expect(screen.queryByText('اليوم', { selector: '.text-\\[8px\\]' })).not.toBeInTheDocument();
  });

  it('places each planned bar by its dates, fills it by its progress, and draws the actual bar under a started one', () => {
    render(<GanttChart milestones={milestones} />);
    // Design: 7 days in of 50, 10 days wide.
    expect(pct(plannedBar('التصميم').style.right)).toBeCloseTo(14, 6);
    expect(pct(plannedBar('التصميم').style.width)).toBeCloseTo(20, 6);
    // Its actual run: 8 days in, 7 wide.
    expect(pct(actualBar('التصميم')?.style.right)).toBeCloseTo(16, 6);
    expect(pct(actualBar('التصميم')?.style.width)).toBeCloseTo(14, 6);
    // Build: 17 days in, 19 wide, 40% filled, not started.
    expect(pct(plannedBar('التنفيذ').style.right)).toBeCloseTo(34, 6);
    expect(pct(plannedBar('التنفيذ').style.width)).toBeCloseTo(38, 6);
    expect((plannedBar('التنفيذ').firstElementChild as HTMLElement).style.width).toBe('40%');
    expect(actualBar('التنفيذ')).toBeNull();
    expect(rowFor('التنفيذ')).toHaveTextContent('40%');
  });

  it('switches to week columns', () => {
    render(<GanttChart milestones={milestones} />);
    const trigger = screen.getByText('شهري').closest('button') as HTMLElement;
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('option', { name: 'أسبوعي' }), { key: 'Enter' });
    // Weeks from the Sunday on or before 2020-02-24 (a Monday): 23/2, 1/3, … 12/4.
    expect(screen.getByText('23/2')).toBeInTheDocument();
    expect(screen.getByText('12/4')).toBeInTheDocument();
    expect(screen.queryByText('مارس 2020')).not.toBeInTheDocument();
  });

  it('hands the milestone back when its label or bar is clicked, and says so when none is dated', () => {
    const onClick = vi.fn();
    const { unmount } = render(<GanttChart milestones={milestones} onMilestoneClick={onClick} />);
    fireEvent.click(screen.getByText('التصميم'));
    fireEvent.click(plannedBar('التنفيذ'));
    expect(onClick.mock.calls.map((c) => c[0].id)).toEqual(['design', 'build']);
    unmount();
    render(<GanttChart milestones={[milestones[2]]} />);
    expect(screen.getByText(/لا توجد مراحل بتواريخ محددة/)).toBeInTheDocument();
  });

  it('marks today when it falls inside the range', () => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(today); start.setDate(start.getDate() - 10);
    const end = new Date(today); end.setDate(end.getDate() + 10);
    render(<GanttChart milestones={[milestone({ id: 'now', name: 'الآن', plannedStart: iso(start), plannedEnd: iso(end) })]} />);
    expect(screen.getByText('اليوم', { selector: '.text-\\[8px\\]' })).toBeInTheDocument();
  });
});
