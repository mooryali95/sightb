/**
 * «هيكلة الشركات والمشاريع»: every company with its portfolios and its
 * standalone projects as drop zones. Drag a project onto a zone to move it;
 * the same move is in each card's menu for touch screens and keyboards.
 * A move inside a company happens at once and can be undone from the toast;
 * a move between companies asks first and says what goes with it.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useCoreData } from '@/hooks/useAppData';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Building2, FolderKanban, GripVertical, MoveRight, Search, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/finance';
import { normalizeArabicName } from '@/lib/resource-spend';
import { PROJECT_STATUS_LABELS, type Project } from '@/types/project';
import { planMove, placementKey, placementOf, type MovePlan, type Placement } from '@/lib/project-placement';

const FINISHED = ['completed', 'archived', 'cancelled'];

export default function Organize() {
  useCoreData();
  const navigate = useNavigate();
  const { companies, portfolios, projects, loading } = useStore();
  const moveProject = useStore((s) => s.moveProject);
  const { canEdit, isAdmin } = useRole();
  const [query, setQuery] = useState('');
  const [showFinished, setShowFinished] = useState(false);
  const [dragging, setDragging] = useState<Project | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ project: Project; plan: Extract<MovePlan, { kind: 'across' }> } | null>(null);
  const [busy, setBusy] = useState(false);

  const ctx = useMemo(() => ({
    portfolios,
    companyName: (id: string) => companies.find((c) => c.id === id)?.name ?? 'شركة',
    canEditCompany: (id: string) => isAdmin || canEdit('company', id),
  }), [portfolios, companies, isAdmin, canEdit]);

  const q = normalizeArabicName(query);
  const visible = useMemo(() => projects.filter((p) =>
    (showFinished || !FINISHED.includes(p.status)) && (!q || normalizeArabicName(p.name).includes(q))), [projects, showFinished, q]);
  const activeCompanies = companies.filter((c) => c.status !== 'archived');

  const run = async (project: Project, to: Placement, undoable: boolean) => {
    const from = placementOf(project);
    setBusy(true);
    try {
      await moveProject(project.id, to.companyId, to.portfolioId);
      toast.success('تم نقل المشروع', undoable ? {
        description: project.name,
        action: { label: 'تراجع', onClick: () => { void moveProject(project.id, from.companyId, from.portfolioId).catch((e: Error) => toast.error(e.message)); } },
      } : { description: project.name });
    } catch (e) {
      toast.error('لم يُنقل المشروع', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const attempt = (project: Project, to: Placement) => {
    const plan = planMove(project, to, ctx);
    if (plan.kind === 'noop') return;
    if (plan.kind === 'blocked') { toast.error(plan.reason); return; }
    if (plan.kind === 'across') { setConfirm({ project, plan }); return; }
    void run(project, plan.to, true);
  };

  const zoneProps = (to: Placement) => {
    const key = placementKey(to);
    const allowed = dragging ? planMove(dragging, to, ctx).kind !== 'blocked' : false;
    return {
      'data-zone': key,
      onDragOver: (e: React.DragEvent) => { if (dragging && allowed) { e.preventDefault(); setOverZone(key); } },
      onDragLeave: () => setOverZone((z) => (z === key ? null : z)),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOverZone(null); if (dragging) attempt(dragging, to); setDragging(null); },
      className: [
        'rounded-lg border-2 border-dashed p-2 min-h-[64px] space-y-2 transition-colors',
        overZone === key ? 'border-primary bg-primary/10' : dragging && allowed ? 'border-primary/40 bg-primary/5' : dragging ? 'border-border opacity-50' : 'border-transparent bg-muted/30',
      ].join(' '),
    };
  };

  const card = (p: Project) => (
    <div key={p.id} draggable={!busy} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); setDragging(p); }}
      onDragEnd={() => { setDragging(null); setOverZone(null); }}
      className={`group flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 shadow-sm cursor-grab active:cursor-grabbing ${dragging?.id === p.id ? 'opacity-40' : ''}`}
      aria-label={`مشروع ${p.name}`}>
      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
      <button type="button" className="min-w-0 flex-1 text-right" onClick={() => navigate(`/project/${p.id}`)}>
        <p className="text-sm font-medium truncate">{p.name}</p>
        <p className="text-[11px] text-muted-foreground font-mono">{formatCurrency(p.contractValue)}</p>
      </button>
      <Badge variant="outline" className="text-[10px] shrink-0">{PROJECT_STATUS_LABELS[p.status]}</Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`نقل ${p.name}`}><MoveRight className="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          {activeCompanies.map((c, i) => (
            <div key={c.id}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs">{c.name}</DropdownMenuLabel>
              {portfolios.filter((pf) => pf.companyId === c.id).map((pf) => (
                <DropdownMenuItem key={pf.id} disabled={p.companyId === c.id && p.portfolioId === pf.id}
                  onSelect={() => attempt(p, { companyId: c.id, portfolioId: pf.id })}>محفظة «{pf.name}»</DropdownMenuItem>
              ))}
              <DropdownMenuItem disabled={p.companyId === c.id && !p.portfolioId}
                onSelect={() => attempt(p, { companyId: c.id, portfolioId: null })}>مشروع مستقل</DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <AppLayout>
      <PageHeader
        title={<span className="flex items-center gap-3"><Layers className="w-6 h-6 text-primary" />هيكلة الشركات والمشاريع</span>}
        subtitle="اسحب المشروع وأفلته في محفظة أو شركة أخرى، أو استخدم زر النقل في بطاقته."
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="بحث في المشاريع" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم المشروع" className="pr-9" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-finished" checked={showFinished} onCheckedChange={setShowFinished} />
          <Label htmlFor="show-finished" className="text-sm">إظهار المنتهية والمؤرشفة</Label>
        </div>
      </div>

      {loading && projects.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="stat-card h-64 animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {activeCompanies.map((c) => {
            const own = visible.filter((p) => p.companyId === c.id);
            const total = own.reduce((s, p) => s + p.contractValue, 0);
            return (
              <section key={c.id} className="stat-card" aria-label={`شركة ${c.name}`}>
                <header className="flex items-start justify-between gap-2 mb-3">
                  <button type="button" className="text-right min-w-0" onClick={() => navigate(`/company/${c.id}`)}>
                    <h2 className="font-bold flex items-center gap-2 truncate"><Building2 className="w-4 h-4 text-primary shrink-0" />{c.name}</h2>
                    <p className="text-[11px] text-muted-foreground">{own.length} مشروع · {formatCurrency(total)}</p>
                  </button>
                  {!ctx.canEditCompany(c.id) && <Badge variant="secondary" className="text-[10px]">للعرض</Badge>}
                </header>
                <div className="space-y-3">
                  {portfolios.filter((pf) => pf.companyId === c.id).map((pf) => {
                    const inside = own.filter((p) => p.portfolioId === pf.id);
                    return (
                      <div key={pf.id}>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><FolderKanban className="w-3.5 h-3.5" />{pf.name} <span className="font-normal">({inside.length})</span></p>
                        <div {...zoneProps({ companyId: c.id, portfolioId: pf.id })}>
                          {inside.map(card)}
                          {inside.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-3">أفلت مشروعاً هنا</p>}
                        </div>
                      </div>
                    );
                  })}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">مشاريع مستقلة</p>
                    <div {...zoneProps({ companyId: c.id, portfolioId: null })}>
                      {own.filter((p) => !p.portfolioId).map(card)}
                      {own.filter((p) => !p.portfolioId).length === 0 && <p className="text-[11px] text-muted-foreground text-center py-3">أفلت مشروعاً هنا</p>}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>نقل المشروع إلى شركة أخرى</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-right">
                <p className="font-medium text-foreground">{confirm?.plan.summary}</p>
                <ul className="list-disc pr-5 space-y-1 text-sm">{confirm?.plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => { if (confirm) void run(confirm.project, confirm.plan.to, false); setConfirm(null); }}>تأكيد النقل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
