/**
 * «هيكل المنظومة»: the drawn structure of the company map. The company at
 * the top, its portfolios beneath it (and «دون محفظة»), each one's projects
 * under it, joined by lines. Where money passed between the company and a
 * project the line is the money: one line out (funding and charges) and one
 * back (repayment, dashed), each as thick as its amount.
 *
 * Every figure is buildCompanyMap's; the positions are layoutOrg's. Status
 * is a symbol and a word (HEALTH), direction an arrow and a line style, so
 * nothing depends on colour. Every box is a link. At phone width the same
 * boxes stack as an indented tree.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FolderKanban } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { HEALTH, type CompanyMap, type MapGroup, type MapProject } from '@/lib/finance/company-map';
import { flowWidth, layoutOrg, orgGroups, type Box, type OrgLineKind } from '@/lib/finance/org-structure';
import { useIsMobile } from '@/hooks/use-mobile';
import { countAr } from '@/lib/plural';
import { cn } from '@/lib/utils';

interface Props {
  companyId: string;
  companyName: string;
  map: CompanyMap;
  /** False when the ledger is not live: the structure is drawn without money on its lines. */
  flows: boolean;
}

const money = (n: number) => formatCurrency(n);
const LINE: Record<OrgLineKind, string> = { tree: 'stroke-foreground/25', out: 'stroke-accent', back: 'stroke-success' };
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card';
const NODE = cn('block rounded-xl border bg-background text-right shadow-sm transition-[border-color,box-shadow] motion-reduce:transition-none hover:border-accent/70 hover:shadow-md', FOCUS);

const groupHref = (companyId: string, g: MapGroup) => (g.id ? `/portfolio/${g.id}` : `/?company=${companyId}&portfolio=standalone`);
const flowWords = (sent: number, returned: number) => `من المنظومة ${money(sent)}، إلى المنظومة ${money(returned)}`;

/** A short sample of a money line, as thick and as dashed as the real one. */
function LineSample({ kind, width }: { kind: OrgLineKind; width: number }) {
  // No money: the plain belongs-to line, as in the drawing.
  if (width <= 0) kind = 'tree';
  return (
    <svg aria-hidden width="26" height="12" className="shrink-0">
      <line x1="1" y1="6" x2="25" y2="6" className={LINE[kind]} strokeWidth={Math.max(width, 1)} strokeDasharray={kind === 'back' ? '5 3' : undefined} strokeLinecap={kind === 'back' ? 'butt' : 'round'} />
    </svg>
  );
}

function Legend() {
  return (
    <ul aria-label="مفتاح الخطوط" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <li className="flex items-center gap-1.5"><LineSample kind="out" width={4} />↓ من المنظومة: تمويل ومحمَّل (خط متصل)</li>
      <li className="flex items-center gap-1.5"><LineSample kind="back" width={4} />↑ عاد إلى المنظومة (خط متقطع)</li>
      <li className="flex items-center gap-1.5"><LineSample kind="out" width={1.5} /><LineSample kind="out" width={9} />سماكة الخط بحسب المبلغ</li>
      <li className="flex items-center gap-1.5"><LineSample kind="tree" width={1} />تبعية بلا حركة مال</li>
    </ul>
  );
}

function Amounts({ sent, returned, max, samples }: { sent: number; returned: number; max: number; samples?: boolean }) {
  return (
    <span className="mt-1 block space-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
      <span className="flex items-center gap-1">{samples && <LineSample kind="out" width={flowWidth(sent, max)} />}<span aria-hidden>↓</span>{money(sent)}</span>
      <span className="flex items-center gap-1">{samples && <LineSample kind="back" width={flowWidth(returned, max)} />}<span aria-hidden>↑</span>{money(returned)}</span>
    </span>
  );
}

function CompanyNode({ companyId, companyName, style }: { companyId: string; companyName: string; style?: React.CSSProperties }) {
  return (
    <Link to={`/?company=${companyId}`} style={style} aria-label={`المنظومة ${companyName}: مشاريعها في لوحة التحكم`}
      className={cn('flex items-center gap-3 rounded-2xl bg-primary px-4 text-primary-foreground shadow-md dark:bg-muted dark:text-foreground dark:ring-1 dark:ring-accent/40', FOCUS, !style && 'py-3')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-accent/50"><Building2 className="h-4 w-4 text-accent" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-[11px] opacity-85">المنظومة</span>
        <span className="block truncate text-sm font-bold">{companyName}</span>
      </span>
    </Link>
  );
}

function GroupNode({ companyId, g, flows, max, style, samples }: { companyId: string; g: MapGroup; flows: boolean; max: number; style?: React.CSSProperties; samples?: boolean }) {
  const count = countAr(g.projects.length, 'project');
  return (
    <Link to={groupHref(companyId, g)} style={style} aria-label={`${g.name}: ${count}${flows ? `، ${flowWords(g.sent, g.returned)}` : ''}`}
      className={cn(NODE, 'border-border px-3 py-2')}>
      <span className="flex items-center gap-1.5">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{count}</span>
      </span>
      {flows && <Amounts sent={g.sent} returned={g.returned} max={max} samples={samples} />}
    </Link>
  );
}

function ProjectNode({ p, flows, max, style, samples }: { p: MapProject; flows: boolean; max: number; style?: React.CSSProperties; samples?: boolean }) {
  const h = HEALTH[p.health];
  return (
    <Link to={`/project/${p.id}`} style={style} title={flows ? `تمويل ${money(p.funded)} + محمَّل من مصاريف المنظومة ${money(p.charged)}` : undefined}
      aria-label={`${p.name}: ${h.label}، ${p.spendPct === null ? 'بلا موازنة' : `صُرف ${Math.round(p.spendPct)}% من الموازنة`}${flows ? `، ${flowWords(p.sent, p.returned)}` : ''}`}
      className={cn(NODE, 'px-2.5 py-2', h.tone)}>
      <span className="block truncate text-sm font-semibold">{p.name}</span>
      <span className="mt-1 flex items-center justify-between gap-1 text-[11px]">
        <span className="truncate"><span className={h.mark} aria-hidden>{h.symbol}</span> {h.label}</span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{p.spendPct === null ? 'بلا موازنة' : <>صُرف <span dir="ltr">{Math.round(p.spendPct)}%</span></>}</span>
      </span>
      {flows && <Amounts sent={p.sent} returned={p.returned} max={max} samples={samples} />}
    </Link>
  );
}

const at = (b: Box): React.CSSProperties => ({ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h });

/** Wide screens: boxes placed by layoutOrg over one SVG of lines. Scrolls sideways when the portfolios outgrow the page. */
function Diagram({ companyId, companyName, map, flows }: Props) {
  const layout = useMemo(() => layoutOrg(map, flows), [map, flows]);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative mx-auto motion-safe:animate-in motion-safe:fade-in" style={{ width: layout.width, height: layout.height }}>
        <svg aria-hidden width={layout.width} height={layout.height} className="absolute inset-0" fill="none">
          {layout.lines.map((l) => (
            <path key={l.key} d={l.d} data-line={l.kind} className={LINE[l.kind]} strokeWidth={l.width}
              strokeDasharray={l.kind === 'back' ? '7 4' : undefined} strokeLinejoin="round" />
          ))}
        </svg>
        <CompanyNode companyId={companyId} companyName={companyName} style={at(layout.company)} />
        <ul className="contents">
          {layout.groups.map(({ group, box, projects }) => (
            <li key={group.name} className="contents">
              <GroupNode companyId={companyId} g={group} flows={flows} max={map.flowMax} style={at(box)} />
              <ul className="contents" aria-label={`مشاريع ${group.name}`}>
                {projects.map(({ project, box: b }) => <li key={project.id} className="contents"><ProjectNode p={project} flows={flows} max={map.flowMax} style={at(b)} /></li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Phone width: the same boxes as an indented tree; each amount carries a sample of its line. */
function Tree({ companyId, companyName, map, flows }: Props) {
  const rail = 'ms-4 mt-2 space-y-2 border-s border-foreground/25 ps-3';
  return (
    <div>
      <CompanyNode companyId={companyId} companyName={companyName} />
      <ul className={rail}>
        {orgGroups(map).map((g) => (
          <li key={g.name}>
            <GroupNode companyId={companyId} g={g} flows={flows} max={map.flowMax} samples />
            <ul className={rail} aria-label={`مشاريع ${g.name}`}>
              {g.projects.map((p) => <li key={p.id}><ProjectNode p={p} flows={flows} max={map.flowMax} samples /></li>)}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrgStructure(props: Props) {
  const isMobile = useIsMobile();
  return (
    <nav aria-label="هيكل المنظومة" className="space-y-4 px-5 pb-5">
      {props.flows && <Legend />}
      {isMobile ? <Tree {...props} /> : <Diagram {...props} />}
    </nav>
  );
}
