/**
 * «هيكل المنظومة»: where the boxes go and how thick the lines are. The
 * layout is geometry over buildCompanyMap; these tests pin that a line's
 * thickness follows its amount, that no money means no money line, and that
 * nothing overlaps.
 */
import { describe, it, expect } from 'vitest';
import { buildCompanyMap, type MapProjectInput } from '../company-map';
import { flowWidth, layoutOrg, orgGroups, ORG, type Box } from '../org-structure';
import type { IntercompanyEntry } from '../company-ledger';

const p = (id: string, group: string, groupId: string | null): MapProjectInput => ({
  id, name: id, group, groupId, status: 'active', contract: 100000, planned: 80000, actual: 20000, collected: 0,
});
const C = { kind: 'company' as const, id: null };
const P = (id: string) => ({ kind: 'project' as const, id });
const move = (id: string, from: IntercompanyEntry['from'], to: IntercompanyEntry['to'], amount: number, type: IntercompanyEntry['type'] = 'advance'): IntercompanyEntry => ({
  id, companyId: 'c', date: '2026-10-01', amount, type, from, to, note: '', dueDate: null, salaryExpenseId: null,
});
// The standalone project comes first in the data; «الطرق» has two projects, «المباني» one.
const projects = [p('lone', 'دون محفظة', null), p('bridge', 'الطرق', 'pf-roads'), p('depot', 'الطرق', 'pf-roads'), p('tower', 'المباني', 'pf-build')];
const ledger = {
  entries: [
    move('f1', C, P('bridge'), 200000), move('r1', P('bridge'), C, 120000, 'repayment'),
    move('f2', C, P('tower'), 20000), move('f3', C, P('lone'), 80000), move('r3', P('lone'), C, 30000, 'repayment'),
  ],
  expenses: [], allocations: [],
};
const map = buildCompanyMap(projects, ledger);
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('flowWidth', () => {
  it('draws nothing for no money, the thinnest line for a little and the thickest for the largest flow', () => {
    expect(flowWidth(0, 1000)).toBe(0);
    expect(flowWidth(-5, 1000)).toBe(0);
    expect(flowWidth(1, 1000)).toBeCloseTo(ORG.minLine, 1);
    expect(flowWidth(1000, 1000)).toBe(ORG.maxLine);
    expect(flowWidth(5000, 1000)).toBe(ORG.maxLine); // never past the thickest
    expect(flowWidth(100, 0)).toBe(0);
  });

  it('grows with the amount', () => {
    const widths = [10, 100, 400, 700, 1000].map((a) => flowWidth(a, 1000));
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    expect(new Set(widths).size).toBe(widths.length);
    expect(flowWidth(500, 1000)).toBeCloseTo((ORG.minLine + ORG.maxLine) / 2, 1);
  });
});

describe('layoutOrg', () => {
  const layout = layoutOrg(map);
  const line = (key: string) => layout.lines.find((l) => l.key === key);

  it('puts the portfolios first, right to left, and the projects outside any last', () => {
    expect(orgGroups(map).map((g) => g.name)).toEqual(['الطرق', 'المباني', 'دون محفظة']);
    const xs = layout.groups.map((g) => g.box.x);
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(xs[1]).toBeGreaterThan(xs[2]);
  });

  it('keeps every box inside the drawing and apart from the others, each project under its own portfolio', () => {
    const boxes = [layout.company, ...layout.groups.flatMap((g) => [g.box, ...g.projects.map((q) => q.box)])];
    expect(boxes).toHaveLength(8);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(layout.width); expect(b.y + b.h).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `${i}/${j}`).toBe(false);
    for (const g of layout.groups) for (const q of g.projects) {
      expect(q.box.y).toBeGreaterThan(g.box.y + g.box.h);
      expect(q.box.x).toBeGreaterThanOrEqual(g.box.x);
      expect(q.box.x + q.box.w).toBeLessThan(g.box.x + g.box.w); // room for the trunk and the branch
    }
    expect(layout.company.x + layout.company.w / 2).toBe(layout.width / 2);
  });

  it('makes each line as thick as its amount, from the map\'s own figures', () => {
    // «الطرق» was sent 200,000, the largest flow: full thickness, on the group's line and on the bridge's.
    expect(line('g0:out')).toMatchObject({ kind: 'out', amount: 200000, width: ORG.maxLine });
    expect(line('g0p0:out')).toMatchObject({ amount: 200000, width: ORG.maxLine });
    expect(line('g0:back')).toMatchObject({ kind: 'back', amount: 120000, width: flowWidth(120000, 200000) });
    expect(line('g1:out')).toMatchObject({ amount: 20000, width: flowWidth(20000, 200000) });
    expect(line('g2:out')!.width).toBeGreaterThan(line('g1:out')!.width);       // 80,000 against 20,000
    expect(line('g2:out')!.width).toBeLessThan(line('g0:out')!.width);
    expect(line('g2:back')).toMatchObject({ amount: 30000 });
    for (const l of layout.lines.filter((x) => x.kind !== 'tree')) expect(l.width).toBe(flowWidth(l.amount, map.flowMax));
  });

  it('draws a thin belongs-to line, not a money line, where no money passed', () => {
    // The depot got nothing; the tower returned nothing.
    expect(line('g0p1:tree')).toMatchObject({ kind: 'tree', width: 1, amount: 0 });
    expect(line('g0p1:out')).toBeUndefined();
    expect(line('g1:back')).toBeUndefined();
    expect(line('g1p0:back')).toBeUndefined();
    // Every column has the trunk its projects hang from.
    expect(layout.lines.filter((l) => l.key.endsWith(':trunk'))).toHaveLength(3);
  });

  it('keeps the line out and the line back of one link apart', () => {
    expect(line('g0:out')!.d).not.toBe(line('g0:back')!.d);
    expect(line('g0p0:out')!.d).not.toBe(line('g0p0:back')!.d);
    // A lone line runs down the middle of its link: the tower's starts at its box's mid height.
    const tower = layout.groups[1].projects[0].box;
    expect(line('g1p0:out')!.d).toContain(` ${tower.y + tower.h / 2} L`);
  });

  it('draws the same structure without money when the ledger is not live', () => {
    const bare = layoutOrg(map, false);
    expect(bare.lines.every((l) => l.kind === 'tree')).toBe(true);
    expect(bare.lines).toHaveLength(3 + 4 + 3); // a link per group, per project, and a trunk per column
    expect(bare.groups.map((g) => g.box)).toEqual(layout.groups.map((g) => g.box));
  });

  it('grows downwards with the longest column and sideways with the portfolios', () => {
    const one = layoutOrg(buildCompanyMap([projects[0]], ledger));
    expect(one.width).toBeLessThan(layout.width);
    expect(one.height).toBeLessThan(layout.height);
    expect(one.width).toBeGreaterThanOrEqual(ORG.companyW);
    expect(layoutOrg(buildCompanyMap([], null)).groups).toEqual([]);
  });
});
