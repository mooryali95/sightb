import { describe, expect, it } from 'vitest';
import type { Milestone } from '@/types/project';
import { barPosition, buildTimeline, dateMilestones, todayPosition } from '../timeline';

const base: Milestone = {
  id: 'm',
  projectId: 'p',
  name: 'x',
  description: '',
  status: 'planned',
  percentComplete: 0,
  weight: 1,
  sortOrder: 0,
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
} as unknown as Milestone;

const ms = (over: Partial<Milestone>): Milestone => ({ ...base, ...over });

describe('dateMilestones', () => {
  it('keeps only milestones with a planned date, filling the missing end or start from the other', () => {
    const out = dateMilestones([
      ms({ id: 'a', plannedStart: '2020-03-02', plannedEnd: '2020-03-12' }),
      ms({ id: 'b', plannedStart: '2020-03-05' }),
      ms({ id: 'c', plannedEnd: '2020-03-09' }),
      ms({ id: 'd' }),
      ms({ id: 'e', plannedStart: 'not a date' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(out[1].endDate).toEqual(out[1].startDate);
    expect(out[2].startDate).toEqual(out[2].endDate);
  });

  it('clamps an end before its start to the start', () => {
    const [m] = dateMilestones([ms({ plannedStart: '2020-03-12', plannedEnd: '2020-03-02' })]);
    expect(m.endDate).toEqual(m.startDate);
  });
});

describe('buildTimeline', () => {
  const dated = [
    ms({ id: 'a', plannedStart: '2020-03-02', plannedEnd: '2020-03-12', actualStart: '2020-03-03', actualEnd: '2020-03-10' }),
    ms({ id: 'b', plannedStart: '2020-03-12', plannedEnd: '2020-03-31' }),
  ];

  it('pads the range a week before the first date and two after the last, then cuts it into month columns', () => {
    const t = buildTimeline(dated, 'months');
    expect(t.start).toEqual(new Date('2020-02-24'));
    expect(t.end).toEqual(new Date('2020-04-14'));
    expect(t.totalDays).toBe(50);
    expect(t.columns.map((c) => c.label)).toEqual(['فبراير 2020', 'مارس 2020', 'أبريل 2020']);
    expect(t.columns.map((c) => c.days)).toEqual([5, 30, 13]);
    expect(t.milestones.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('starts week columns on the Sunday before the range and runs them past its end', () => {
    const t = buildTimeline(dated, 'weeks');
    expect(t.columns.map((c) => c.label)).toEqual(['23/2', '1/3', '8/3', '15/3', '22/3', '29/3', '5/4', '12/4']);
    expect(t.columns.every((c) => c.days === 7)).toBe(true);
  });

  it('widens the range to an actual date that falls outside the planned ones', () => {
    const t = buildTimeline([ms({ plannedStart: '2020-03-02', plannedEnd: '2020-03-12', actualEnd: '2020-03-20' })], 'months');
    expect(t.end).toEqual(new Date('2020-04-03'));
  });

  it('carries nothing when no milestone is dated', () => {
    const t = buildTimeline([ms({}), ms({ plannedStart: '' })], 'months');
    expect(t.milestones).toEqual([]);
    expect(t.columns).toEqual([]);
    expect(t.totalDays).toBe(1);
  });
});

describe('barPosition and todayPosition', () => {
  const t = buildTimeline([ms({ plannedStart: '2020-03-02', plannedEnd: '2020-03-31' })], 'months');

  it('places a bar by its offset and length as percentages of the range', () => {
    const p = barPosition(t, new Date('2020-03-02'), new Date('2020-03-12'));
    expect(parseFloat(p.left)).toBeCloseTo(14, 6);
    expect(parseFloat(p.width)).toBeCloseTo(20, 6);
  });

  it('gives a zero-length bar one day, floors an early start at the origin, and caps a bar at the range end', () => {
    expect(parseFloat(barPosition(t, new Date('2020-03-02'), new Date('2020-03-02')).width)).toBeCloseTo(2, 6);
    const early = barPosition(t, new Date('2020-02-01'), new Date('2020-02-24'));
    expect(early.left).toBe('0%');
    const late = barPosition(t, new Date('2020-04-04'), new Date('2020-05-30'));
    expect(parseFloat(late.left) + parseFloat(late.width)).toBeCloseTo(100, 6);
  });

  it('marks today only inside the range', () => {
    expect(parseFloat(todayPosition(t, new Date('2020-03-09')) ?? 'NaN')).toBeCloseTo(28, 6);
    expect(todayPosition(t, new Date('2020-02-23'))).toBeNull();
    expect(todayPosition(t, new Date('2020-04-15'))).toBeNull();
  });
});
