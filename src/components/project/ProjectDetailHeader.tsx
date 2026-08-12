import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import {
  Briefcase, MoreHorizontal, Pencil, FileSpreadsheet, FileText, Archive, Trash2,
} from 'lucide-react';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type Project, type ProjectStatus } from '@/types/project';
import { toast } from 'sonner';
import { currencySymbol } from '@/lib/currency';

interface Props {
  project: Project;
  company?: { id: string; name: string } | null;
  portfolio?: { id: string; name: string } | null;
  isReadOnly: boolean;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  canEditProject: boolean;
  onStatusChange: (status: ProjectStatus) => void;
  onEdit: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectDetailHeader({
  project, company, portfolio, isReadOnly, isAdmin, isSystemAdmin, canEditProject,
  onStatusChange, onEdit, onExportExcel, onExportPDF, onArchive, onDelete,
}: Props) {
  const navigate = useNavigate();

  const eyebrow = (
    <span className="flex items-center gap-1.5 normal-case tracking-normal text-muted-foreground">
      <button onClick={() => navigate('/')} className="hover:text-accent transition-colors">لوحة التحكم</button>
      {company && (<><span className="opacity-50">←</span><button onClick={() => navigate(`/company/${company.id}`)} className="hover:text-accent transition-colors">{company.name}</button></>)}
      {portfolio && (<><span className="opacity-50">←</span><button onClick={() => navigate(`/portfolio/${portfolio.id}`)} className="hover:text-accent transition-colors">{portfolio.name}</button></>)}
    </span>
  );

  const actions = !isReadOnly ? (
    <>
      <Select
        value={project.status}
        onValueChange={(val) => {
          onStatusChange(val as ProjectStatus);
          toast.success(`تم تغيير الحالة إلى: ${PROJECT_STATUS_LABELS[val as ProjectStatus]}`);
        }}
      >
        <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9" title="إجراءات">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>إجراءات المشروع</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="w-4 h-4 ml-2" />تعديل البيانات
          </DropdownMenuItem>
          {(isAdmin || canEditProject) && (
            <>
              <DropdownMenuItem onSelect={onExportExcel}>
                <FileSpreadsheet className="w-4 h-4 ml-2" />تصدير Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExportPDF}>
                <FileText className="w-4 h-4 ml-2" />تصدير PDF
              </DropdownMenuItem>
            </>
          )}
          {isAdmin && project.status !== 'archived' && (
            <>
              <DropdownMenuSeparator />
              <ConfirmDeleteDialog
                title="أرشفة المشروع"
                description={`سيتم نقل مشروع "${project.name}" إلى الأرشيف. يمكنك استعادته أو حذفه نهائياً لاحقاً.`}
                confirmLabel="أرشفة"
                onConfirm={onArchive}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-warning focus:text-warning">
                    <Archive className="w-4 h-4 ml-2" />أرشفة المشروع
                  </DropdownMenuItem>
                }
              />
            </>
          )}
          {isSystemAdmin && project.status === 'archived' && (
            <ConfirmDeleteDialog
              title="حذف نهائي للمشروع"
              description={`سيتم حذف مشروع "${project.name}" وجميع بياناته نهائياً. لا يمكن التراجع.`}
              confirmLabel="حذف نهائي"
              onConfirm={onDelete}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 ml-2" />حذف نهائي
                </DropdownMenuItem>
              }
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  ) : null;

  return (
    <PageHeader
      eyebrow={eyebrow}
      title={
        <span className="flex items-center gap-3">
          <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-accent" />
          </span>
          <span className="truncate">{project.name}</span>
        </span>
      }
      meta={
        <Badge className={`text-xs ${PROJECT_STATUS_COLORS[project.status]}`}>
          {PROJECT_STATUS_LABELS[project.status]}
        </Badge>
      }
      subtitle={
        <>
          {project.durationMonths} أشهر · {project.resourceCount} موارد · {currencySymbol(project.currency)}
          {project.percentComplete > 0 && ` · الإنجاز: ${project.percentComplete}%`}
        </>
      }
      actions={actions}
    />
  );
}
