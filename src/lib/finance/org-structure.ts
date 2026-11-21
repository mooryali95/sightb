/**
 * «هيكل المنظومة»: where each box and line of the drawn structure goes.
 * The company at the top, its portfolios beneath (and the projects outside
 * any), each portfolio's projects under it, and the money between the
 * company and the projects as lines whose thickness follows the amount.
 *
 * Pure geometry over buildCompanyMap's result: no figure is computed here.
 * Columns run right to left, as the page reads.
 */
import type { CompanyMap, MapGroup, MapProject } from './company-map';

export interface Box { x: number; y: number; w: number; h: number }
/** `out`: from the company (funding and charges). `back`: returned to it. `tree`: belongs-to, no money on it. */
export type OrgLineKind = 'tree' | 'out' | 'back';
export interface OrgLine { key: string; kind: OrgLineKind; d: string; width: number; amount: number }
export interface OrgGroup { group: MapGroup; box: Box; projects: { project: MapProject; box: Box }[] }
export interface OrgLayout { width: number; height: number; company: Box; groups: OrgGroup[]; lines: OrgLine[] }

export const ORG = {
  pad: 16, colW: 232, colGap: 20,
  companyW: 300, companyH: 60,
  groupY: 124, groupH: 78,
  projectY: 230, projectH: 104, projectGap: 12,
  /** The trunk each column's projects hang from sits this far in from the column's right edge. */
  trunkInset: 16,
  /** The branch from the trunk to a project: long enough to read its thickness. */
  branch: 40,
  minLine: 1.5, maxLine: 10,
} as const;

/** Thickness of a money line: nothing for no money, then from thin to thick with the amount. */
export function flowWidth(amount: number, max: number): number {
  if (!(amount > 0) || !(max > 0)) return 0;
  const w = ORG.minLine + (ORG.maxLine - ORG.minLine) * Math.min(1, amount / max);
  return Math.round(w * 10) / 10;
}

const n1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The lines of one link. With money on it: one line out and one back, side
 * by side. With none (or the ledger not live): a thin belongs-to line, so the
 * structure still reads.
 */
function link(key: string, path: (offset: number) => string, sent: number, returned: number, max: number, flows: boolean): OrgLine[] {
  const out = flows ? flowWidth(sent, max) : 0;
  const back = flows ? flowWidth(returned, max) : 0;
  if (out === 0 && back === 0) return [{ key: `${key}:tree`, kind: 'tree', d: path(0), width: 1, amount: 0 }];
  const gap = 3;
  const lines: OrgLine[] = [];
  // Side by side around the link's centre; a lone line sits on the centre.
  if (out > 0) lines.push({ key: `${key}:out`, kind: 'out', d: path(back > 0 ? n1((back + gap) / 2) : 0), width: out, amount: sent });
  if (back > 0) lines.push({ key: `${key}:back`, kind: 'back', d: path(out > 0 ? -n1((out + gap) / 2) : 0), width: back, amount: returned });
  return lines;
}

/** The structure's columns: the portfolios in the order they come, then the projects outside any. */
export function orgGroups(map: CompanyMap): MapGroup[] {
  return [...map.groups.filter((g) => g.id !== null), ...map.groups.filter((g) => g.id === null)];
}

export function layoutOrg(map: CompanyMap, flows = true): OrgLayout {
  const columns = orgGroups(map);
  const count = Math.max(1, columns.length);
  const width = Math.max(ORG.pad * 2 + count * ORG.colW + (count - 1) * ORG.colGap, ORG.companyW + ORG.pad * 2);
  const company: Box = { x: n1((width - ORG.companyW) / 2), y: 0, w: ORG.companyW, h: ORG.companyH };
  const colsWidth = count * ORG.colW + (count - 1) * ORG.colGap;
  const right = n1((width + colsWidth) / 2);            // the first column's right edge
  const lines: OrgLine[] = [];

  const groups: OrgGroup[] = columns.map((group, i) => {
    const x = right - (i + 1) * ORG.colW - i * ORG.colGap;
    const box: Box = { x, y: ORG.groupY, w: ORG.colW, h: ORG.groupH };
    // Leave the company along its bottom edge, first group rightmost, and land on the group's top centre.
    const from = n1(company.x + company.w - ((i + 0.5) / count) * company.w);
    const to = x + ORG.colW / 2;
    const mid = n1((company.h + ORG.groupY) / 2);
    // Down, across, down. The two lines of a link keep their distance round
    // the corners: the outer one turns later, so they never cross.
    const turn = Math.sign(to - from);
    lines.push(...link(`g${i}`, (o) => `M ${n1(from + o)} ${company.h} L ${n1(from + o)} ${n1(mid - o * turn)} L ${n1(to + o)} ${n1(mid - o * turn)} L ${n1(to + o)} ${ORG.groupY}`,
      group.sent, group.returned, map.flowMax, flows));

    const trunkX = x + ORG.colW - ORG.trunkInset;
    const projectW = ORG.colW - ORG.trunkInset - ORG.branch;
    const projects = group.projects.map((project, j) => {
      const pBox: Box = { x, y: ORG.projectY + j * (ORG.projectH + ORG.projectGap), w: projectW, h: ORG.projectH };
      const midY = pBox.y + pBox.h / 2;
      lines.push(...link(`g${i}p${j}`, (o) => `M ${trunkX} ${n1(midY + o)} L ${x + projectW} ${n1(midY + o)}`,
        project.sent, project.returned, map.flowMax, flows));
      return { project, box: pBox };
    });
    if (projects.length > 0) {
      const last = projects[projects.length - 1].box;
      lines.push({ key: `g${i}:trunk`, kind: 'tree', d: `M ${trunkX} ${ORG.groupY + ORG.groupH} L ${trunkX} ${last.y + last.h / 2}`, width: 1, amount: 0 });
    }
    return { group, box, projects };
  });

  const rows = Math.max(0, ...columns.map((g) => g.projects.length));
  const height = rows === 0 ? ORG.groupY + ORG.groupH : ORG.projectY + rows * ORG.projectH + (rows - 1) * ORG.projectGap;
  return { width, height, company, groups, lines };
}
