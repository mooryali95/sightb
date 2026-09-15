/**
 * Component tests for the alerts centre: the log of spend-consistency
 * differences kept per user in local storage. What must hold: open alerts
 * are listed with their figures and resolved ones hidden until asked for,
 * the search matches the project or a group by trimmed, case-folded text,
 * marking an alert handled closes it in the store and the list, and
 * clearing empties both.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ConsistencyAlert } from '@/lib/consistency-alerts';
import AlertsCenter from '../AlertsCenter';

vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const KEY = 'rouya.consistency-alerts.v1';
const alert = (over: Partial<ConsistencyAlert>): ConsistencyAlert => ({
  id: 'a', projectId: 'p1', projectName: 'مشروع الرياض', dimension: 'resource', fingerprint: 'fp', totalGap: 1500, totalUnlinked: 300,
  unlinkedCount: 2, topGroups: [{ key: 'r1', label: 'Omar', gap: 1000 }], detectedAt: '2026-09-01T08:00:00Z', lastSeenAt: '2026-09-02T09:30:00Z',
  seenCount: 3, resolvedAt: null, ...over,
});
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as ConsistencyAlert[];
const seed = (list: ConsistencyAlert[]) => localStorage.setItem(KEY, JSON.stringify(list));
const renderPage = () => render(<MemoryRouter><AlertsCenter /></MemoryRouter>);
const card = (project: string) => screen.getByText(project).closest('.stat-card') as HTMLElement;

beforeEach(() => { localStorage.clear(); });

describe('the list', () => {
  it('shows the open alerts with their figures, dates and top groups, and counts them in the badge', () => {
    seed([alert({ id: 'open' }), alert({ id: 'closed', projectId: 'p2', projectName: 'مشروع جدة', dimension: 'category', resolvedAt: '2026-09-03T00:00:00Z' })]);
    renderPage();
    expect(screen.getByText('1 تنبيه مفتوح')).toBeInTheDocument();
    const c = card('مشروع الرياض');
    expect(within(c).getByRole('link')).toHaveAttribute('href', '/project/p1');
    expect(within(c).getByText('حسب المورد')).toBeInTheDocument();
    expect(within(c).getByText('1,500.00 ر.س')).toBeInTheDocument();
    expect(within(c).getByText('300.00 ر.س (2)')).toBeInTheDocument();
    expect(within(c).getByText(/· 3×$/)).toBeInTheDocument();
    expect(within(c).getByText('Omar: 1,000.00 ر.س')).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'تعليم كمُعالَج' })).toBeInTheDocument();
    expect(screen.queryByText('مشروع جدة')).not.toBeInTheDocument();
  });

  it('reveals the resolved alerts on request, dimmed, dated and without the handled button', () => {
    seed([alert({ id: 'closed', resolvedAt: '2026-09-03T10:00:00Z' })]);
    renderPage();
    expect(screen.getByText('لا توجد تنبيهات مفتوحة')).toBeInTheDocument();
    expect(screen.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إظهار المغلقة' }));
    const c = card('مشروع الرياض');
    expect(c.className).toContain('opacity-60');
    expect(within(c).getByText(/^أُغلق في /)).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: 'تعليم كمُعالَج' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إخفاء المغلقة' })).toBeInTheDocument();
  });

  it('searches the project name and the group labels, trimmed and case-folded', () => {
    seed([alert({ id: 'a1' }), alert({ id: 'a2', projectId: 'p2', projectName: 'مشروع جدة', topGroups: [{ key: 'r2', label: 'Sara', gap: 5 }] })]);
    renderPage();
    const search = screen.getByPlaceholderText('بحث باسم المشروع أو المورد…');
    fireEvent.change(search, { target: { value: '  OMAR ' } });
    expect(screen.getByText('مشروع الرياض')).toBeInTheDocument();
    expect(screen.queryByText('مشروع جدة')).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'جدة' } });
    expect(screen.queryByText('مشروع الرياض')).not.toBeInTheDocument();
    expect(screen.getByText('مشروع جدة')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(screen.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeInTheDocument();
  });
});

describe('acting on alerts', () => {
  it('marks one alert handled in the store and drops it from the open list', () => {
    seed([alert({ id: 'a1' }), alert({ id: 'a2', projectId: 'p2', projectName: 'مشروع جدة' })]);
    renderPage();
    fireEvent.click(within(card('مشروع الرياض')).getByRole('button', { name: 'تعليم كمُعالَج' }));
    expect(screen.queryByText('مشروع الرياض')).not.toBeInTheDocument();
    expect(screen.getByText('1 تنبيه مفتوح')).toBeInTheDocument();
    expect(stored().find((a) => a.id === 'a1')?.resolvedAt).toEqual(expect.any(String));
    expect(stored().find((a) => a.id === 'a2')?.resolvedAt).toBeNull();
  });

  it('clears the whole log, after which the clear button itself is gone', () => {
    seed([alert({ id: 'a1' }), alert({ id: 'closed', resolvedAt: '2026-09-03T00:00:00Z' })]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'مسح السجل' }));
    expect(stored()).toEqual([]);
    expect(screen.getByText('لا توجد تنبيهات اتساق مسجّلة.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مسح السجل' })).not.toBeInTheDocument();
  });
});
