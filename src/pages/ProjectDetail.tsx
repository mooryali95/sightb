import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary, getExpensesByCategory, getMonthlyBreakdown } from '@/lib/finance';
import { cn } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ExpenseCategory, type ProjectStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Target, Users, Wallet, History,
  BarChart3, Receipt, PiggyBank, Baseline,
  FileSpreadsheet, FileText, Milestone as MilestoneIcon, FileEdit, AlertTriangle, Trash2,
  Briefcase, Pencil, FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { BudgetAlerts } from '@/components/BudgetAlerts';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

// Sub-components
import { ResourcesSection } from '@/components/project/ResourcesSection';
import { BudgetSection } from '@/components/project/BudgetSection';
import { BaselineSection } from '@/components/project/BaselineSection';
import { ExpensesSection } from '@/components/project/ExpensesSection';
import { CustodySection } from '@/components/project/CustodySection';
import { RevenueSection } from '@/components/project/RevenueSection';
import { ChartsSection } from '@/components/project/ChartsSection';
import { AuditLogSection } from '@/components/project/AuditLogSection';
import { MilestonesSection } from '@/components/project/MilestonesSection';
import { ChangeOrdersSection } from '@/components/project/ChangeOrdersSection';
import { RisksSection } from '@/components/project/RisksSection';
import { WhatIfSection } from '@/components/project/WhatIfSection';
import { CommitmentsSection } from '@/components/project/CommitmentsSection';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, canEdit: canEditRole } = useRole();
  const {
    projects, companies, portfolios, budgetItems, expenses, revenues, resources, custodies,
    milestones, changeOrders, risks, baselines, commitments,
    loadAll, updateProject, deleteProject,
  } = useStore();

  const { detailsLoaded, detailsLoading, loadProjectData } = useStore();

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (id && !detailsLoaded) loadProjectData(id); }, [id, detailsLoaded]);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', contractValue: 0, durationMonths: 0, description: '', retentionPercent: 0, managementReserve: 0, percentComplete: 0, taxPercent: 15 });
  type TabGroup = 'planning' | 'finance' | 'tracking' | 'management';
  const [activeGroup, setActiveGroup] = useState<TabGroup>('planning');
  const [activeTab, setActiveTab] = useState('milestones');

  const project = projects.find((p) => p.id === id);
  const isReadOnly = project ? !canEditRole('project', project.id) : true;

  useEffect(() => {
    if (project) {
      setEditForm({
        name: project.name,
        contractValue: project.contractValue,
        durationMonths: project.durationMonths,
        description: project.description || '',
        retentionPercent: project.retentionPercent || 0,
        managementReserve: project.managementReserve || 0,
        percentComplete: project.percentComplete || 0,
        taxPercent: project.taxPercent ?? 15,
      });
    }
  }, [project?.id]);

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">المشروع غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>العودة</Button>
        </div>
      </AppLayout>
    );
  }

  const company = companies.find((c) => c.id === project.companyId);
  const portfolio = project.portfolioId ? portfolios.find((p) => p.id === project.portfolioId) : null;
  const pBudget = budgetItems.filter((b) => b.projectId === project.id);
  const pExpenses = expenses.filter((e) => e.projectId === project.id);
  const pRevenues = revenues.filter((r) => r.projectId === project.id);
  const pResources = resources.filter((r) => r.projectId === project.id);
  const pCustodies = custodies.filter((c) => c.projectId === project.id);
  const pMilestones = milestones.filter((m) => m.projectId === project.id);
  const pChangeOrders = changeOrders.filter((co) => co.projectId === project.id);
  const pRisks = risks.filter((r) => r.projectId === project.id);
  const pCommitments = (commitments || []).filter((c) => c.projectId === project.id);

  const summary = getProjectSummary(project, pBudget, pExpenses, pRevenues, pChangeOrders);
  const categoryBreakdown = getExpensesByCategory(pExpenses);
  const monthlyData = getMonthlyBreakdown(pExpenses, project.durationMonths);

  const pieData = Object.entries(categoryBreakdown).map(([key, value]) => ({
    name: EXPENSE_CATEGORY_LABELS[key as ExpenseCategory] || key, value,
  }));

  const barData = monthlyData.map((v, i) => ({ month: `شهر ${i + 1}`, مصروفات: v }));

  const getActualForItem = (item: any) =>
    pExpenses.filter((e) => e.budgetItemId === item.id).reduce((s: number, e: any) => s + e.amount, 0);

  const totalAllRevenue = pRevenues.reduce((s, r) => s + r.amount, 0);

  const handleDeleteProject = async () => {
    try {
      await deleteProject(project.id);
      toast.success('تم حذف المشروع');
      navigate('/');
    } catch (e: any) {
      toast.error('فشل حذف المشروع');
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) { toast.error('اسم المشروع مطلوب'); return; }
    if (editForm.contractValue < 0) { toast.error('قيمة العقد يجب أن تكون موجبة'); return; }
    if (editForm.durationMonths < 1) { toast.error('المدة يجب أن تكون شهر واحد على الأقل'); return; }
    try {
      await updateProject(project.id, {
        name: editForm.name.trim(),
        contractValue: editForm.contractValue,
        durationMonths: editForm.durationMonths,
        description: editForm.description.trim() || undefined,
        retentionPercent: editForm.retentionPercent,
        managementReserve: editForm.managementReserve,
        percentComplete: editForm.percentComplete,
        taxPercent: editForm.taxPercent,
      });
      setEditOpen(false);
      toast.success('تم تحديث بيانات المشروع');
    } catch (e: any) {
      toast.error('فشل تحديث المشروع');
    }
  };



  const pendingChangeOrders = pChangeOrders.filter(co => co.status === 'proposed').length;
  const openHighRisks = pRisks.filter(r => r.status === 'open' && (r.impact === 'high' || r.probability === 'high')).length;
  const managementBadge = pendingChangeOrders + openHighRisks;

  const tabGroups: { key: TabGroup; label: string; icon: typeof MilestoneIcon; defaultTab: string; badge: number }[] = [
    { key: 'planning', label: 'التخطيط', icon: MilestoneIcon, defaultTab: 'milestones', badge: 0 },
    { key: 'finance', label: 'المالية', icon: PiggyBank, defaultTab: 'budget', badge: 0 },
    { key: 'tracking', label: 'المتابعة', icon: BarChart3, defaultTab: 'charts', badge: 0 },
    { key: 'management', label: 'الإدارة', icon: FileEdit, defaultTab: 'changeorders', badge: managementBadge },
  ];

  const subTabs: Record<TabGroup, { value: string; label: string; icon: typeof MilestoneIcon }[]> = {
    planning: [
      { value: 'milestones', label: 'المراحل', icon: MilestoneIcon },
      { value: 'resources', label: 'الموارد', icon: Users },
    ],
    finance: [
      { value: 'budget', label: 'الموازنة', icon: PiggyBank },
      { value: 'baseline', label: 'خط الأساس', icon: Baseline },
      { value: 'expenses', label: 'المصروفات', icon: Receipt },
      { value: 'commitments', label: 'الالتزامات', icon: Briefcase },
      { value: 'custody', label: 'العهد', icon: Wallet },
      { value: 'revenue', label: 'الإيرادات', icon: DollarSign },
    ],
    tracking: [
      { value: 'charts', label: 'التحليلات', icon: BarChart3 },
      { value: 'whatif', label: 'ما-إذا', icon: FlaskConical },
    ],
    management: [
      { value: 'changeorders', label: 'أوامر التغيير', icon: FileEdit },
      { value: 'risks', label: 'المخاطر', icon: AlertTriangle },
      ...(isAdmin ? [{ value: 'auditlog', label: 'السجل', icon: History }] : []),
    ],
  };

  const handleGroupChange = (group: TabGroup) => {
    setActiveGroup(group);
    const firstTab = subTabs[group][0]?.value;
    if (firstTab) setActiveTab(firstTab);
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header with Green Theme */}
        <div className="relative mb-6 rounded-xl overflow-hidden border border-border bg-gradient-to-l from-emerald-500/10 via-green-500/5 to-transparent">
          <div className="p-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">لوحة التحكم</button>
              {company && (<><span>←</span><button onClick={() => navigate(`/company/${company.id}`)} className="hover:text-primary transition-colors">{company.name}</button></>)}
              {portfolio && (<><span>←</span><button onClick={() => navigate(`/portfolio/${portfolio.id}`)} className="hover:text-primary transition-colors">{portfolio.name}</button></>)}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-base md:text-xl font-bold truncate">{project.name}</h1>
                      <Badge className={`text-[10px] shrink-0 ${PROJECT_STATUS_COLORS[project.status]}`}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 truncate">
                      {project.durationMonths} أشهر · {project.resourceCount} موارد · {project.currency}
                      {project.percentComplete > 0 && ` · الإنجاز: ${project.percentComplete}%`}
                    </p>
                  </div>
                </div>
              </div>
              {/* Action buttons - separate row on mobile */}
              {!isReadOnly && (
              <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary h-8 w-8">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>تعديل بيانات المشروع</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label>اسم المشروع</Label>
                        <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} maxLength={200} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>قيمة العقد</Label>
                          <Input type="number" min={0} value={editForm.contractValue} onChange={e => setEditForm(f => ({ ...f, contractValue: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>المدة (أشهر)</Label>
                          <Input type="number" min={1} max={120} value={editForm.durationMonths} onChange={e => setEditForm(f => ({ ...f, durationMonths: Number(e.target.value) }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>نسبة الإنجاز %</Label>
                          <Input type="number" min={0} max={100} value={editForm.percentComplete} onChange={e => setEditForm(f => ({ ...f, percentComplete: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>نسبة الحجز %</Label>
                          <Input type="number" min={0} max={100} value={editForm.retentionPercent} onChange={e => setEditForm(f => ({ ...f, retentionPercent: Number(e.target.value) }))} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>الاحتياطي الإداري</Label>
                        <Input type="number" min={0} value={editForm.managementReserve} onChange={e => setEditForm(f => ({ ...f, managementReserve: Number(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>نسبة الضريبة (VAT) %</Label>
                        <Input type="number" min={0} max={100} step={0.1} value={editForm.taxPercent} onChange={e => setEditForm(f => ({ ...f, taxPercent: Number(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>الوصف</Label>
                        <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} maxLength={500} rows={2} />
                      </div>
                      <Button onClick={handleSaveEdit} className="w-full">حفظ التعديلات</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Select
                  value={project.status}
                  onValueChange={(val) => {
                    updateProject(project.id, { status: val as ProjectStatus });
                    toast.success(`تم تغيير الحالة إلى: ${PROJECT_STATUS_LABELS[val as ProjectStatus]}`);
                  }}
                >
                  <SelectTrigger className="w-[120px] md:w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <ConfirmDeleteDialog
                    title="حذف المشروع"
                    description={`هل أنت متأكد من حذف مشروع "${project.name}"؟ سيتم حذف جميع البيانات المرتبطة.`}
                    onConfirm={handleDeleteProject}
                    trigger={
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    }
                  />
                )}
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title={summary.effectiveContractValue !== summary.contractValue ? 'القيمة المعدّلة للعقد' : 'قيمة العقد'}
            value={formatCurrency(summary.effectiveContractValue)}
            icon={<DollarSign className="w-4 h-4" />}
            subtitle={summary.effectiveContractValue !== summary.contractValue ? `الأصلية: ${formatCurrency(summary.contractValue)}` : undefined}
          />
          <StatCard title="المصروفات الفعلية" value={formatCurrency(summary.totalActual)} icon={<TrendingDown className="w-4 h-4" />} trend="down" subtitle={`المخطط: ${formatCurrency(summary.totalPlanned)}`} />
          <StatCard title="الربح المخطط" value={formatCurrency(summary.plannedProfit)} icon={<TrendingUp className="w-4 h-4" />} trend={summary.plannedProfit >= 0 ? 'up' : 'down'} subtitle={`هامش: ${summary.plannedProfitMargin.toFixed(1)}%`} />
          <StatCard title="المتبقي من الموازنة" value={formatCurrency(summary.budgetRemaining)} icon={<Target className="w-4 h-4" />} trend={summary.budgetRemaining >= 0 ? 'up' : 'down'} />
        </div>

        {summary.collectedRevenue > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <StatCard title="محصّل" value={formatCurrency(summary.collectedRevenue)} icon={<DollarSign className="w-4 h-4" />} />
            <StatCard title="ذمم مدينة" value={formatCurrency(summary.accountsReceivable)} icon={<Receipt className="w-4 h-4" />} />
            <StatCard title="الربح المحقق" value={formatCurrency(summary.realizedProfit)} icon={<TrendingUp className="w-4 h-4" />} trend={summary.realizedProfit >= 0 ? 'up' : 'down'} />
          </div>
        )}

        <BudgetAlerts totalPlanned={summary.totalPlanned} totalActual={summary.totalActual} contractValue={summary.effectiveContractValue} budgetItems={pBudget} expenses={pExpenses} managementReserve={project.managementReserve} />

        {/* Export Buttons - only for admin/editor */}
        {(isAdmin || canEditRole('project', project.id)) && (
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1 sm:flex-none min-w-0" onClick={() => {
              exportToExcel({
                projectName: project.name, contractValue: summary.effectiveContractValue,
                budgetItems: pBudget.map(b => ({ ...b, actual: getActualForItem(b) })),
                expenses: pExpenses, revenues: pRevenues, changeOrders: pChangeOrders,
                totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
                totalRevenue: totalAllRevenue, durationMonths: project.durationMonths,
              });
              toast.success('تم تصدير التقرير إلى Excel');
            }}>
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Excel</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1 sm:flex-none min-w-0" onClick={() => {
              exportToPDF({
                projectName: project.name, contractValue: summary.effectiveContractValue,
                budgetItems: pBudget.map(b => ({ ...b, actual: getActualForItem(b) })),
                expenses: pExpenses, revenues: pRevenues, changeOrders: pChangeOrders,
                totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
                totalRevenue: totalAllRevenue, durationMonths: project.durationMonths,
                plannedProfit: summary.plannedProfit,
              });
              toast.success('تم تصدير التقرير إلى PDF');
            }}>
              <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">PDF</span>
            </Button>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Group Selector */}
          <div className="flex gap-1.5 p-1 bg-muted/50 rounded-lg mb-1 overflow-x-auto scrollbar-hide">
            {tabGroups.map((group) => {
              const Icon = group.icon;
              const isActive = activeGroup === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => handleGroupChange(group.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all shrink-0 relative',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{group.label}</span>
                  {group.badge > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {group.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Sub-tabs */}
          <TabsList className="flex w-full overflow-x-auto scrollbar-hide h-auto p-1">
            {subTabs[activeGroup].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1 text-xs shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="milestones"><MilestonesSection projectId={project.id} milestones={pMilestones} project={project} readOnly={isReadOnly} revenues={pRevenues} /></TabsContent>
          <TabsContent value="resources"><ResourcesSection projectId={project.id} resources={pResources} budgetItems={pBudget} expenses={pExpenses} readOnly={isReadOnly} durationMonths={project.durationMonths} /></TabsContent>
          <TabsContent value="budget"><BudgetSection projectId={project.id} budgetItems={pBudget} expenses={pExpenses} durationMonths={project.durationMonths} resources={pResources} contractValue={summary.effectiveContractValue} currency={project.currency} managementReserve={project.managementReserve} readOnly={isReadOnly} baselineLocked={baselines.some(b => b.isActive && b.projectId === project.id)} taxPercent={project.taxPercent} /></TabsContent>
          <TabsContent value="baseline"><BaselineSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} budgetItems={pBudget} project={project} /></TabsContent>
          <TabsContent value="expenses"><ExpensesSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} resources={pResources} custodies={pCustodies} budgetItems={pBudget} revenues={pRevenues} contractValue={summary.effectiveContractValue} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="custody"><CustodySection projectId={project.id} companyId={project.companyId} custodies={pCustodies} expenses={pExpenses} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="commitments"><CommitmentsSection projectId={project.id} commitments={pCommitments} totalPlanned={summary.totalPlanned} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="revenue"><RevenueSection projectId={project.id} revenues={pRevenues} durationMonths={project.durationMonths} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="changeorders"><ChangeOrdersSection projectId={project.id} changeOrders={pChangeOrders} contractValue={project.contractValue} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="risks"><RisksSection projectId={project.id} risks={pRisks} readOnly={isReadOnly} /></TabsContent>
          <TabsContent value="charts"><ChartsSection pieData={pieData} barData={barData} expenses={pExpenses} totalPlanned={summary.totalPlanned} durationMonths={project.durationMonths} budgetItems={pBudget} /></TabsContent>
          <TabsContent value="whatif">
            <WhatIfSection
              contractValue={summary.effectiveContractValue}
              totalPlanned={summary.totalPlanned}
              totalActual={summary.totalActual}
              totalRevenue={totalAllRevenue}
              durationMonths={project.durationMonths}
              percentComplete={project.percentComplete}
              currency={project.currency}
            />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="auditlog"><AuditLogSection projectId={project.id} /></TabsContent>
          )}
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
