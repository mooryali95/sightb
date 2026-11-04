import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, FolderKanban, ChevronDown, Plus, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectButton } from './ProjectButton';
import type { CompanyNode, PortfolioNode } from './sidebarTree';

const ADD_CLASS = 'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-primary/70 hover:bg-sidebar-accent transition-colors';

interface BranchProps {
  node: CompanyNode;
  /** A search is on: the add buttons and the finished toggle stay hidden. */
  searching: boolean;
  canEdit: boolean;
  onToggleCompany: (id: string) => void;
  onTogglePortfolio: (id: string) => void;
  onToggleFinished: (companyId: string) => void;
}

function PortfolioBranch({ node, companyId, searching, canEdit, showFinished, onToggle }: {
  node: PortfolioNode; companyId: string; searching: boolean; canEdit: boolean; showFinished: boolean; onToggle: (id: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { portfolio } = node;
  const active = location.pathname === `/portfolio/${portfolio.id}`;
  return (
    <div>
      <div className={cn(
        'relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium motion-fast transition-colors',
        active ? 'bg-primary/15 text-primary border-s-2 border-primary' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent',
      )}>
        <FolderKanban className="w-3.5 h-3.5 shrink-0 text-primary/70" />
        <button onClick={() => navigate(`/portfolio/${portfolio.id}`)} className="flex-1 text-start truncate hover:text-primary transition-colors">
          {portfolio.name}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(portfolio.id); }}
          aria-label={node.open ? 'طي' : 'توسيع'}
          className="p-0.5 rounded hover:bg-sidebar-accent"
        >
          <ChevronDown className={cn('w-3 h-3 transition-transform', node.open && 'rotate-180')} />
        </button>
      </div>

      {node.open && (
        <div className="ms-3 border-s border-primary/15 ps-2 space-y-0.5 mt-0.5">
          {node.active.map((project) => <ProjectButton key={project.id} project={project} />)}
          {showFinished && node.inactive.map((project) => <ProjectButton key={project.id} project={project} />)}
          {!searching && canEdit && (
            <button onClick={() => navigate(`/project/new?portfolio=${portfolio.id}&company=${companyId}`)} className={ADD_CLASS}>
              <Plus className="w-3 h-3" /><span>مشروع جديد</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A company row and, when open, its live projects, its portfolios, its finished projects and its add buttons. */
export function CompanyBranch({ node, searching, canEdit, onToggleCompany, onTogglePortfolio, onToggleFinished }: BranchProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = node;
  const active = location.pathname === `/company/${company.id}`;
  return (
    <div>
      <div className={cn(
        'relative w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold motion-fast transition-colors',
        active ? 'bg-primary/15 text-primary border-s-2 border-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent',
      )}>
        <Building2 className="w-4 h-4 shrink-0 text-primary" />
        <button onClick={() => navigate(`/company/${company.id}`)} className="flex-1 text-start truncate hover:text-primary transition-colors">
          {company.name}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompany(company.id); }}
          aria-label={node.open ? 'طي' : 'توسيع'}
          className="p-0.5 rounded hover:bg-sidebar-accent"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', node.open && 'rotate-180')} />
        </button>
      </div>

      {node.open && (
        <div className="ms-3 border-s border-primary/30 ps-2 space-y-0.5 mt-1">
          {node.directActive.map((project) => <ProjectButton key={project.id} project={project} />)}

          {node.portfolios.map((p) => (
            <PortfolioBranch
              key={p.portfolio.id}
              node={p}
              companyId={company.id}
              searching={searching}
              canEdit={canEdit}
              showFinished={node.showFinished}
              onToggle={onTogglePortfolio}
            />
          ))}

          {node.showFinished && node.directInactive.map((project) => <ProjectButton key={project.id} project={project} />)}

          {!searching && canEdit && (
            <>
              <button onClick={() => navigate(`/project/new?company=${company.id}`)} className={ADD_CLASS}>
                <Plus className="w-3 h-3" /><span>مشروع مستقل</span>
              </button>
              <button onClick={() => navigate(`/portfolio/new?company=${company.id}`)} className={ADD_CLASS}>
                <Plus className="w-3 h-3" /><span>محفظة جديدة</span>
              </button>
            </>
          )}

          {!searching && node.finishedCount > 0 && (
            <button
              onClick={() => onToggleFinished(company.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
            >
              <Archive className="w-3 h-3" />
              <span>{node.showFinished ? 'إخفاء المنتهية' : `عرض المنتهية (${node.finishedCount})`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
