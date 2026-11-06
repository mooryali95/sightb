import { Building2, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Company } from '@/types/project';

interface CompanyManagementProps {
  activeCompanies: Company[];
  archivedCompanies: Company[];
  isAdmin: boolean;
  archiveCompany: (id: string) => Promise<void>;
  unarchiveCompany: (id: string) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
}

export function CompanyManagement({
  activeCompanies, archivedCompanies, isAdmin,
  archiveCompany, unarchiveCompany, deleteCompany,
}: CompanyManagementProps) {
  const navigate = useNavigate();

  return (
    <div className="stat-card mt-6 animate-fade-in">
      <h3 className="text-sm font-semibold mb-4">إدارة الشركات</h3>
      <div className="space-y-2">
        {activeCompanies.map((company) => (
          <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/company/${company.id}`)}>
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{company.name}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success">نشطة</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    try {
                      await archiveCompany(company.id);
                      toast.success(`تم أرشفة "${company.name}"`);
                    } catch (e) {
                      console.error('[archive]', e);
                      toast.error('حدث خطأ أثناء أرشفة الشركة. يرجى المحاولة مرة أخرى.');
                    }
                  }}
                >
                  <Archive className="w-3.5 h-3.5" />
                  أرشفة
                </Button>
                <ConfirmDeleteDialog
                  title="حذف الشركة"
                  description={`هل أنت متأكد من حذف "${company.name}"؟ سيتم حذف جميع المحافظ والمشاريع المرتبطة بها نهائياً.`}
                  onConfirm={async () => {
                    try {
                      await deleteCompany(company.id);
                      toast.success(`تم حذف "${company.name}"`);
                     } catch (e) {
                       console.error('[delete-company]', e);
                       toast.error('حدث خطأ أثناء حذف الشركة. يرجى المحاولة مرة أخرى.');
                    }
                  }}
                />
              </div>
            )}
          </div>
        ))}
        {archivedCompanies.length > 0 && (
          <>
            <div className="text-xs text-muted-foreground pt-3 pb-1 font-semibold">الشركات المؤرشفة</div>
            {archivedCompanies.map((company) => (
              <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 opacity-70">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{company.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">مؤرشفة</span>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground hover:text-primary"
                    onClick={async () => {
                      try {
                        await unarchiveCompany(company.id);
                        toast.success(`تم إعادة تفعيل "${company.name}"`);
                      } catch (e) {
                        console.error('[unarchive]', e);
                        toast.error('حدث خطأ أثناء إعادة تفعيل الشركة. يرجى المحاولة مرة أخرى.');
                      }
                    }}
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    إعادة تفعيل
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
