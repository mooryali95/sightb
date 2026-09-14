import { useNavigate, useLocation } from 'react-router-dom';
import { Archive, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from '@/types/project';
import { isFinished } from './sidebarTree';

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />;
  if (status === 'archived') return <Archive className="w-3 h-3 text-muted-foreground shrink-0" />;
  if (status === 'cancelled') return <XCircle className="w-3 h-3 text-destructive/60 shrink-0" />;
  return (
    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', status === 'active' || status === 'approved' ? 'bg-success' : 'bg-warning')} />
  );
}

/** One project in the tree: its status dot or icon, its name struck through when finished. */
export function ProjectButton({ project }: { project: Project }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inactive = isFinished(project);
  const active = location.pathname === `/project/${project.id}`;
  return (
    <button
      onClick={() => navigate(`/project/${project.id}`)}
      className={cn(
        'relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-normal transition-colors',
        active
          ? 'bg-primary/20 text-primary border-r-2 border-primary'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground/85',
        inactive && 'opacity-60',
      )}
    >
      <StatusIcon status={project.status} />
      <span className={cn('truncate', inactive && 'line-through decoration-1')}>{project.name}</span>
      {inactive && (
        <span className="text-xs text-muted-foreground mr-auto shrink-0">
          {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
        </span>
      )}
    </button>
  );
}
