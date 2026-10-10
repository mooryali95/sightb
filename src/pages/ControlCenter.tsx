import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ScanSearch, ShieldAlert } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRole } from '@/hooks/useRole';
import { useCoreData, useProjectData } from '@/hooks/useAppData';
import { useStore } from '@/store/useStore';
import { getProjectSummary, calculateEVM, getCurrentMonth } from '@/lib/finance';
import { SourceOfTruthSection } from '@/components/project/SourceOfTruthSection';
import { CashRepairLogSection } from '@/components/project/CashRepairLogSection';
import { CashRepairStatusBar } from '@/components/project/CashRepairStatusBar';

export default function ControlCenter() {
  const { isOwner, loading: roleLoading } = useRole();
  const projects = useStore((s) => s.projects);
  const [projectId, setProjectId] = useState('');
  const selectedId = projectId || projects[0]?.id || '';
  useCoreData();
  useProjectData(selectedId || undefined);
  const { ensureProjectCashData, loadBaselines } = useStore();

  useEffect(() => {
    if (!selectedId) return;
    void ensureProjectCashData(selectedId);
    void loadBaselines(selectedId);
  }, [selectedId, ensureProjectCashData, loadBaselines]);

  if (roleLoading) return <AppLayout><div className="py-20 text-center text-muted-foreground">جاري التحقق من الصلاحية…</div></AppLayout>;
  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="للمالك فقط"
        title="مركز الرقابة"
        subtitle="مطابقة الأرقام وسلامة الترابط وسجل الإصلاحات بعيداً عن شاشات العمل اليومية"
      />
      <div className="border-y border-border bg-card/60 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        <ScanSearch className="w-5 h-5 text-primary" />
        <div className="min-w-[220px] flex-1">
          <p className="text-xs font-semibold">اختر المشروع المراد فحصه</p>
          <p className="text-[11px] text-muted-foreground">تُعرض بيانات الخادم والواجهة وسجل إصلاح النقد لهذا المشروع فقط.</p>
        </div>
        <Select value={selectedId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full sm:w-[320px]"><SelectValue placeholder="اختر مشروعاً" /></SelectTrigger>
          <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {selectedId ? <ProjectControls projectId={selectedId} /> : (
        <div className="py-20 text-center text-muted-foreground"><ShieldAlert className="w-8 h-8 mx-auto mb-3" />لا توجد مشاريع لفحصها.</div>
      )}
    </AppLayout>
  );
}

function ProjectControls({ projectId }: { projectId: string }) {
  const state = useStore();
  const project = state.projects.find((p) => p.id === projectId);
  const data = useMemo(() => {
    if (!project) return null;
    const budget = state.budgetItems.filter((x) => x.projectId === projectId);
    const expenses = state.expenses.filter((x) => x.projectId === projectId);
    const revenues = state.revenues.filter((x) => x.projectId === projectId);
    const changes = state.changeOrders.filter((x) => x.projectId === projectId);
    const activeBaseline = state.baselines.find((x) => x.projectId === projectId && x.isActive);
    return {
      budget, expenses, revenues, changes,
      custodies: state.custodies.filter((x) => x.projectId === projectId),
      funds: state.projectFunds.filter((x) => x.projectId === projectId),
      settlements: state.fundSettlements.filter((x) => x.projectId === projectId),
      requests: state.paymentRequests.filter((x) => x.projectId === projectId),
      transfers: state.cashTransfers.filter((x) => x.projectId === projectId),
      summary: getProjectSummary(project, budget, expenses, revenues, changes),
      evm: activeBaseline ? calculateEVM(activeBaseline.items, expenses, project.durationMonths, getCurrentMonth(project.startDate, project.durationMonths), project.percentComplete) : null,
    };
  }, [project, projectId, state]);
  if (!project || !data) return <div className="py-20 text-center text-muted-foreground">جاري تحميل المشروع…</div>;
  return (
    <div className="space-y-6">
      <CashRepairStatusBar projectId={projectId} />
      <SourceOfTruthSection
        project={project} summary={data.summary} evm={data.evm} budgetItems={data.budget}
        expenses={data.expenses} revenues={data.revenues} changeOrders={data.changes}
        funds={data.funds} settlements={data.settlements} custodies={data.custodies}
        paymentRequests={data.requests} cashTransfers={data.transfers}
      />
      <CashRepairLogSection
        projectId={projectId} custodies={data.custodies} cashTransfers={data.transfers}
        funds={data.funds} expenses={data.expenses} paymentRequests={data.requests}
      />
    </div>
  );
}