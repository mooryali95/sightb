import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF } from '@/lib/export-lazy';
import { MobileFAB } from '@/components/MobileFAB';
import { useTabBadges } from '@/hooks/useTabBadges';
import { useProjectDetailData } from '@/hooks/useProjectDetailData';
import { buildTabGroups, buildSubTabs, FAB_ACTIONS } from './project-detail/tabsConfig';
import { useProjectTabs } from './project-detail/useProjectTabs';
import { buildExcelPayload, buildPdfPayload } from './project-detail/exportPayload';
import { ProjectSection } from './project-detail/ProjectSection';
import { ProjectGroupTabs } from './project-detail/ProjectGroupTabs';
import { ProjectDetailHeader } from '@/components/project/ProjectDetailHeader';
import { ProjectEditDialog } from '@/components/project/ProjectEditDialog';
import { ProjectStatsGrid } from '@/components/project/ProjectStatsGrid';
import { CashRepairStatusBar } from '@/components/project/CashRepairStatusBar';
import { SsotHealthBanner } from '@/components/project/SsotHealthBanner';
import { errorMessage } from '@/lib/utils';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useProjectDetailData(id);
  const badges = useTabBadges(id || '');
  const [editOpen, setEditOpen] = useState(false);
  const subTabs = buildSubTabs(data.isAdmin);
  const tabs = useProjectTabs(subTabs);

  if (!data.project) {
    return (
      <AppLayout>
        {data.loading ? (
          <div className="flex items-center justify-center py-20" role="status" aria-label="جاري التحميل">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">المشروع غير موجود</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
          </div>
        )}
      </AppLayout>
    );
  }

  const {
    project, company, portfolio, isAdmin, isSystemAdmin, isReadOnly, canEditRole,
    updateProject, archiveProject, deleteProject,
    pExpenses, pRevenues, pCustodies, pChangeOrders, projectFunds, fundSettlements, paymentRequests, cashTransfers,
    summary, evm, currentMonth, totalCommitted, availableBudget, daysRemaining, monthsRemaining, vatRate, healthScore,
    openRisksCount, pendingExpensesCount, pendingChangeOrders,
  } = data;

  const handleArchive = async () => {
    try { await archiveProject(project.id); toast.success('تم أرشفة المشروع'); navigate('/'); }
    catch { toast.error('فشل أرشفة المشروع'); }
  };
  const handleDelete = async () => {
    try { await deleteProject(project.id); toast.success('تم حذف المشروع نهائياً'); navigate('/'); }
    catch (e) { toast.error(errorMessage(e, 'فشل حذف المشروع — تأكد من أرشفته أولاً')); }
  };

  const ownRows = <T extends { projectId: string }>(rows: T[]) => rows.filter((r) => r.projectId === project.id);
  const fab = FAB_ACTIONS[tabs.activeGroup];

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <ProjectDetailHeader
          project={project}
          company={company}
          portfolio={portfolio}
          isReadOnly={isReadOnly}
          isAdmin={isAdmin}
          isSystemAdmin={isSystemAdmin}
          canEditProject={canEditRole('project', project.id)}
          onStatusChange={(status) => updateProject(project.id, { status })}
          onEdit={() => setEditOpen(true)}
          onExportExcel={() => { exportToExcel(buildExcelPayload(data)); toast.success('تم تصدير التقرير إلى Excel'); }}
          onExportPDF={() => { exportToPDF(buildPdfPayload(data)); toast.success('تم تصدير التقرير إلى PDF'); }}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />

        <CashRepairStatusBar projectId={project.id} />

        <SsotHealthBanner
          project={project}
          expenses={pExpenses}
          custodies={pCustodies}
          paymentRequests={ownRows(paymentRequests)}
          cashTransfers={ownRows(cashTransfers || [])}
          funds={ownRows(projectFunds)}
          settlements={ownRows(fundSettlements)}
          changeOrders={pChangeOrders}
          onInspect={() => tabs.navigateToTab('ssot')}
        />

        <ProjectEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={project}
          onSave={(values) => updateProject(project.id, values)}
        />

        <ProjectStatsGrid
          project={project} summary={summary} evm={evm} currentMonth={currentMonth}
          daysRemaining={daysRemaining} monthsRemaining={monthsRemaining}
          totalCommitted={totalCommitted} availableBudget={availableBudget}
          vatRate={vatRate} healthScore={healthScore}
          openRisksCount={openRisksCount} pendingExpensesCount={pendingExpensesCount}
          pendingChangeOrders={pendingChangeOrders}
          invoicedCount={pRevenues.filter((r) => r.status === 'invoiced').length}
        />

        <ProjectGroupTabs
          groups={buildTabGroups(badges)}
          subTabs={subTabs}
          activeGroup={tabs.activeGroup}
          activeTab={tabs.activeTab}
          onGroupChange={tabs.changeGroup}
          onTabChange={tabs.setActiveTab}
          renderSection={(value) => <ProjectSection value={value} data={data} navigateToTab={tabs.navigateToTab} />}
        />
      </motion.div>

      {/* Mobile FAB — primary contextual action per active group */}
      {!isReadOnly && fab && (
        <MobileFAB
          label={fab.label}
          onClick={() => {
            tabs.applyTabs({ group: fab.group, tab: fab.tab });
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
          }}
        />
      )}
    </AppLayout>
  );
}
