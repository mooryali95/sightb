import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { StatCard } from '@/components/StatCard';
import { formatCurrency, getProjectSummary, getExpensesByCategory, getMonthlyBreakdown, calculateEVM, getCurrentMonth, addVAT, getMonthlyBudgetPlan } from '@/lib/finance';
import { cn } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ExpenseCategory, type ProjectStatus } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, Target, Users, Wallet, History,
  BarChart3, Receipt, PiggyBank, Baseline,
  FileSpreadsheet, FileText, Milestone as MilestoneIcon, FileEdit, AlertTriangle, Trash2,
  Briefcase, Pencil, FlaskConical, LayoutDashboard, Clock, Shield, Banknote, Archive, HandCoins,
  MoreHorizontal, Download, GitCompare,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { MobileFAB } from '@/components/MobileFAB';
import { useTabBadges } from '@/hooks/useTabBadges';

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
import { SmartBudgetAlerts } from '@/components/project/SmartBudgetAlerts';
import { FundsSection } from '@/components/project/FundsSection';
import { CashLedgerSection } from '@/components/project/CashLedgerSection';
import { CashFlowSankey } from '@/components/project/CashFlowSankey';
import { ResourcePayablesSection } from '@/components/project/ResourcePayablesSection';
import { ExecutiveSummary } from '@/components/project/ExecutiveSummary';
import { PerformanceComparisonSection } from '@/components/project/PerformanceComparisonSection';
import { AIExecutiveInsights } from '@/components/project/AIExecutiveInsights';
import { Progress } from '@/components/ui/progress';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin: isSystemAdmin, isAdminFor, canEdit: canEditRole } = useRole();
  // Project-scoped admin (system, company, or project-level admin acts as admin within this project)
  const isAdmin = id ? isAdminFor('project', id) : isSystemAdmin;
  const {
    projects, companies, portfolios, budgetItems, expenses, revenues, resources, custodies,
    milestones, changeOrders, risks, baselines, commitments,
    projectFunds, fundSettlements, paymentRequests, cashTransfers,
    loadAll, updateProject, archiveProject, deleteProject,
  } = useStore();

  const { detailsLoaded, detailsLoading, loadProjectData, subscribeToProject, loadFundsForProject, loadResourcePayablesForProject } = useStore() as any;

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (id && !detailsLoaded) loadProjectData(id); }, [id, detailsLoaded, loadProjectData]);
  // Always ensure funds + payables are loaded for the active project — these are NOT
  // included in the global loadAll(), so without this they appear blank until a custody
  // or expense triggers a side-effect refetch.
  useEffect(() => {
    if (!id) return;
    loadFundsForProject?.(id).catch((e: any) => console.warn('[ProjectDetail] funds', e));
    loadResourcePayablesForProject?.(id).catch((e: any) => console.warn('[ProjectDetail] payables', e));
  }, [id, loadFundsForProject, loadResourcePayablesForProject]);
  // Realtime subscription for collaborative editing — cleanup on id change
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToProject(id);
    return unsub;
  }, [id, subscribeToProject]);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', contractValue: 0, durationMonths: 0, description: '', retentionPercent: 0, managementReserve: 0, percentComplete: 0, taxPercent: 15 });
  type TabGroup = 'summary' | 'planning' | 'finance' | 'tracking' | 'management';
  // Persist active tab in URL (?tab=...) so refresh keeps context
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') || 'overview';
  const urlGroup = (searchParams.get('group') as TabGroup) || 'summary';
  const [activeGroup, setActiveGroupState] = useState<TabGroup>(urlGroup);
  const [activeTab, setActiveTabState] = useState(urlTab);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const setActiveGroup = (group: TabGroup) => {
    setActiveGroupState(group);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('group', group);
      return next;
    }, { replace: true });
  };

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

  // === Computed values for top section & executive summary ===
  const projectBaselines = baselines.filter(b => b.projectId === project.id);
  const activeBaseline = projectBaselines.find(b => b.isActive);
  const currentMonth = getCurrentMonth(project.startDate, project.durationMonths);
  const evm = activeBaseline
    ? calculateEVM(activeBaseline.items, pExpenses, project.durationMonths, Math.min(project.durationMonths, currentMonth), project.percentComplete, project.managementReserve || 0)
    : null;

  const activeCommitments = pCommitments.filter(c => c.status === 'active');
  const totalCommitted = activeCommitments.reduce((s, c) => s + c.totalAmount, 0);
  const availableBudget = summary.totalPlanned - totalCommitted;

  const daysRemaining = project.endDate
    ? Math.max(0, Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const monthsRemaining = summary.burnRate > 0 ? Math.max(0, summary.budgetRemaining / summary.burnRate) : null;

  const vatRate = project.taxPercent || 15;

  const healthScore = (() => {
    let score = 0;
    if (summary.spendRate <= 100) score++;
    if (!evm || evm.spi >= 0.9) score++;
    if (pRisks.filter(r => r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length === 0) score++;
    if (summary.plannedProfit >= 0) score++;
    if (score >= 4) return { label: 'سليم', color: 'health-good', bg: 'bg-success/10 border-success/25' };
    if (score >= 2) return { label: 'يحتاج انتباه', color: 'health-warning', bg: 'bg-warning/10 border-warning/25' };
    return { label: 'حرج', color: 'health-critical', bg: 'bg-destructive/10 border-destructive/25' };
  })();

  const openRisksCount = pRisks.filter(r => r.status === 'open' || r.status === 'mitigating').length;
  const pendingExpensesCount = pExpenses.filter(e => e.approvalStatus === 'pending').length;

  const totalAllRevenue = pRevenues.reduce((s, r) => s + r.amount, 0);

  const handleArchiveProject = async () => {
    try {
      await archiveProject(project.id);
      toast.success('تم أرشفة المشروع');
      navigate('/');
    } catch (e: any) {
      toast.error('فشل أرشفة المشروع');
    }
  };

  const handleDeleteProject = async () => {
    try {
      await deleteProject(project.id);
      toast.success('تم حذف المشروع نهائياً');
      navigate('/');
    } catch (e: any) {
      toast.error(e?.message || 'فشل حذف المشروع — تأكد من أرشفته أولاً');
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

  const badges = useTabBadges(project.id);
  const tabGroups: { key: TabGroup; label: string; icon: typeof MilestoneIcon; defaultTab: string; badge: number; badgeLevel: 'info' | 'warning' | 'critical'; badgeHint?: string }[] = [
    { key: 'summary', label: 'الملخص', icon: LayoutDashboard, defaultTab: 'overview', badge: 0, badgeLevel: 'info' },
    { key: 'planning', label: 'التخطيط', icon: MilestoneIcon, defaultTab: 'milestones', badge: badges.planning.count, badgeLevel: badges.planning.level, badgeHint: badges.planning.hint },
    { key: 'finance', label: 'المالية', icon: PiggyBank, defaultTab: 'expenses', badge: badges.finance.count, badgeLevel: badges.finance.level, badgeHint: badges.finance.hint },
    { key: 'tracking', label: 'المتابعة', icon: BarChart3, defaultTab: 'charts', badge: badges.tracking.count, badgeLevel: badges.tracking.level, badgeHint: badges.tracking.hint },
    { key: 'management', label: 'الإدارة', icon: FileEdit, defaultTab: 'changeorders', badge: badges.management.count, badgeLevel: badges.management.level, badgeHint: badges.management.hint },
  ];

  const subTabs: Record<TabGroup, { value: string; label: string; icon: typeof MilestoneIcon }[]> = {
    summary: [
      { value: 'overview', label: 'نظرة شاملة', icon: LayoutDashboard },
    ],
    planning: [
      { value: 'milestones', label: 'المراحل', icon: MilestoneIcon },
      { value: 'resources', label: 'الموارد', icon: Users },
    ],
    // ترتيب وفق أفضل الممارسات: العمل اليومي أولاً (المصروفات/الإيرادات/التدفق النقدي)
    // ثم الالتزامات والمستحقات، وأخيراً المرجعيات (الموازنة/خط الأساس)
    finance: [
      { value: 'expenses', label: 'المصروفات', icon: Receipt },
      { value: 'revenue', label: 'الإيرادات', icon: DollarSign },
      { value: 'funds', label: 'الدفعات', icon: Banknote },
      { value: 'custody', label: 'العهد', icon: Wallet },
      { value: 'payables', label: 'مستحقات الموارد', icon: HandCoins },
      { value: 'commitments', label: 'الالتزامات', icon: Briefcase },
      { value: 'budget', label: 'الموازنة', icon: PiggyBank },
      { value: 'baseline', label: 'خط الأساس', icon: Baseline },
    ],
    tracking: [
      { value: 'performance', label: 'مقارنة الأداء', icon: GitCompare },
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
        {/* Header — clean hierarchy: breadcrumb → title → meta → actions */}
        <div className="relative mb-6 rounded-xl overflow-hidden border border-border bg-gradient-gold-soft">
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <button onClick={() => navigate('/')} className="hover:text-primary motion-fast transition-colors">لوحة التحكم</button>
              {company && (<><span>←</span><button onClick={() => navigate(`/company/${company.id}`)} className="hover:text-primary motion-fast transition-colors">{company.name}</button></>)}
              {portfolio && (<><span>←</span><button onClick={() => navigate(`/portfolio/${portfolio.id}`)} className="hover:text-primary motion-fast transition-colors">{portfolio.name}</button></>)}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="w-11 h-11 md:w-14 md:h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 md:w-7 md:h-7 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl md:text-3xl font-bold tracking-tight truncate">{project.name}</h1>
                      <Badge className={`text-xs shrink-0 ${PROJECT_STATUS_COLORS[project.status]}`}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                      {project.durationMonths} أشهر · {project.resourceCount} موارد · {project.currency}
                      {project.percentComplete > 0 && ` · الإنجاز: ${project.percentComplete}%`}
                    </p>
                  </div>
                </div>
              </div>
              {/* Unified action menu — quick status select + ⋯ for the rest */}
              {!isReadOnly && (
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={project.status}
                  onValueChange={(val) => {
                    updateProject(project.id, { status: val as ProjectStatus });
                    toast.success(`تم تغيير الحالة إلى: ${PROJECT_STATUS_LABELS[val as ProjectStatus]}`);
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
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
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                      <Pencil className="w-4 h-4 ml-2" />تعديل البيانات
                    </DropdownMenuItem>
                    {(isAdmin || canEditRole('project', project.id)) && (
                      <>
                        <DropdownMenuItem onSelect={() => {
                          exportToExcel({
                            projectName: project.name, contractValue: summary.effectiveContractValue,
                            budgetItems: pBudget.map(b => ({ ...b, actual: getActualForItem(b) })),
                            expenses: pExpenses, revenues: pRevenues, changeOrders: pChangeOrders,
                            totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
                            totalRevenue: totalAllRevenue, durationMonths: project.durationMonths,
                            vatRate: project.taxPercent,
                            contractValueInclVAT: summary.contractValueInclVAT,
                            totalVATOnExpenses: summary.totalVATOnExpenses,
                            totalVATOnRevenues: summary.totalVATOnRevenues,
                            netVATPayable: summary.netVATPayable,
                          });
                          toast.success('تم تصدير التقرير إلى Excel');
                        }}>
                          <FileSpreadsheet className="w-4 h-4 ml-2" />تصدير Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => {
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
                          onConfirm={handleArchiveProject}
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
                        onConfirm={handleDeleteProject}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 ml-2" />حذف نهائي
                          </DropdownMenuItem>
                        }
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Edit dialog kept separately so the menu item can open it */}
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
              </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════ شريط الحالة السريع ══════ */}
        <div className={`flex flex-wrap items-center gap-2 text-xs p-2.5 rounded-lg border mb-4 ${healthScore.bg}`}>
          <span className={`font-bold ${healthScore.color}`}>{healthScore.label}</span>
          <span className="text-muted-foreground">|</span>
          <Badge className={`text-xs ${PROJECT_STATUS_COLORS[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
          <span className="text-muted-foreground">|</span>
          <span>الإنجاز {project.percentComplete}%</span>
          <span className="text-muted-foreground">|</span>
          <span>الشهر {currentMonth} من {project.durationMonths}</span>
          {daysRemaining !== null && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className={daysRemaining < 30 ? 'text-destructive font-medium' : ''}>
                {daysRemaining} يوم متبقي
              </span>
            </>
          )}
          {evm && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className={evm.cpi >= 1 ? 'health-good' : 'health-critical'}>CPI {evm.cpi.toFixed(2)}</span>
              <span className={evm.spi >= 1 ? 'health-good' : 'health-critical'}>SPI {evm.spi.toFixed(2)}</span>
            </>
          )}
          {openRisksCount > 0 && (
            <>
              <span className="text-muted-foreground">|</span>
              <span>{openRisksCount} خطر مفتوح</span>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            الصف 1 — العقد والربحية المخططة (4 بطاقات)
            ═══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard
            title={summary.effectiveContractValue !== summary.contractValue ? 'قيمة العقد المعدّلة' : 'قيمة العقد'}
            value={formatCurrency(summary.effectiveContractValue)}
            icon={<DollarSign className="w-4 h-4" />}
            tooltip="إجمالي قيمة العقد قبل الضريبة، شاملاً أوامر التغيير المعتمدة. هذه هي قاعدة كل حسابات الربحية."
            subtitle={summary.effectiveContractValue !== summary.contractValue
              ? `الأصلية: ${formatCurrency(summary.contractValue)}`
              : vatRate > 0 ? `شامل الضريبة: ${formatCurrency(addVAT(summary.effectiveContractValue, vatRate))}` : undefined}
          />
          <StatCard
            title="الموازنة المعتمدة"
            value={formatCurrency(summary.totalPlanned)}
            icon={<PiggyBank className="w-4 h-4" />}
            tooltip="إجمالي التكاليف المخططة لتنفيذ المشروع — تمثّل سقف الإنفاق المتوقع."
            subtitle={summary.effectiveContractValue > 0 ? `${((summary.totalPlanned / summary.effectiveContractValue) * 100).toFixed(1)}% من العقد` : undefined}
          />
          <StatCard
            title="الربح المخطط"
            value={formatCurrency(summary.plannedProfit)}
            icon={<TrendingUp className="w-4 h-4" />}
            trend={summary.plannedProfit >= 0 ? 'up' : 'down'}
            subtitle={`هامش: ${summary.plannedProfitMargin.toFixed(1)}%`}
            tooltip="= قيمة العقد − الموازنة المعتمدة. الربح المتوقع إذا التزمت التنفيذ بالخطة."
          />
          <StatCard
            title="المتبقي من العقد"
            value={formatCurrency(summary.contractRemaining)}
            icon={<Receipt className="w-4 h-4" />}
            trend={summary.contractRemaining >= 0 ? 'neutral' : 'down'}
            subtitle={summary.effectiveContractValue > 0 ? `${((summary.contractRemaining / summary.effectiveContractValue) * 100).toFixed(0)}% لم يُفوتر` : undefined}
            tooltip="= قيمة العقد − (المحصّل + الذمم المدينة). الجزء الذي لم يُفوتر للعميل بعد."
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            الصف 2 — الأداء التشغيلي للموازنة (4 بطاقات)
            ═══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="stat-card">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">المصروف الفعلي</span>
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="stat-value">{formatCurrency(summary.totalActual)}</p>
            <div className="mt-2">
              <Progress value={Math.min(summary.spendRate, 100)} className="h-1.5" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.spendRate.toFixed(1)}% من الموازنة ({formatCurrency(summary.totalPlanned)})
            </p>
          </div>
          <StatCard
            title={totalCommitted > 0 ? 'المتاح للصرف' : 'المتبقي من الموازنة'}
            value={formatCurrency(totalCommitted > 0 ? availableBudget : summary.budgetRemaining)}
            icon={<Target className="w-4 h-4" />}
            trend={(totalCommitted > 0 ? availableBudget : summary.budgetRemaining) >= 0 ? 'up' : 'down'}
            subtitle={totalCommitted > 0 ? `ملتزم بعقود: ${formatCurrency(totalCommitted)}` : undefined}
            tooltip={totalCommitted > 0
              ? '= الموازنة − المصروف − الالتزامات المفتوحة. سالب = تجاوز محتمل.'
              : '= الموازنة − المصروف. سالب = تجاوز.'}
          />
          <StatCard
            title="معدل الحرق الشهري"
            value={formatCurrency(summary.burnRate)}
            icon={<TrendingDown className="w-4 h-4" />}
            subtitle={monthsRemaining !== null && monthsRemaining > 0
              ? `يكفي لـ ${monthsRemaining.toFixed(1)} شهر`
              : summary.burnRate === 0 ? 'لم يبدأ الصرف' : 'الميزانية مستنفدة'}
            tooltip="متوسط الصرف الشهري = إجمالي المصروف ÷ الأشهر المنقضية. يساعد على توقع موعد نفاد الموازنة."
          />
          {evm ? (
            <StatCard
              title="التكلفة المتوقعة (EAC)"
              value={formatCurrency(evm.eac)}
              icon={<BarChart3 className="w-4 h-4" />}
              trend={evm.vac >= 0 ? 'up' : 'down'}
              subtitle={evm.vac >= 0
                ? `وفر متوقع: ${formatCurrency(evm.vac)}`
                : `تجاوز متوقع: ${formatCurrency(Math.abs(evm.vac))}`}
              tooltip="Estimate At Completion — التكلفة المتوقعة لإنهاء المشروع وفق وتيرة الأداء الحالية."
            />
          ) : (
            <div className="stat-card flex flex-col items-center justify-center text-center bg-muted/30 border-dashed">
              <BarChart3 className="w-5 h-5 text-muted-foreground mb-1.5" />
              <p className="text-xs font-medium text-muted-foreground">EAC غير متاح</p>
              <p className="text-[10px] text-muted-foreground mt-1">اعتمد خط الأساس لتفعيله</p>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            الصف 3 — التحصيل والربحية الفعلية (يظهر فقط عند توفر بيانات)
            ═══════════════════════════════════════════════════════════════ */}
        {(summary.collectedRevenue > 0 || summary.accountsReceivable > 0 || summary.totalActual > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard
              title="المحصّل فعلياً"
              value={formatCurrency(summary.collectedRevenue)}
              icon={<DollarSign className="w-4 h-4" />}
              trend="up"
              subtitle={summary.effectiveContractValue > 0
                ? `${(summary.collectedRevenue / summary.effectiveContractValue * 100).toFixed(0)}% من العقد`
                : undefined}
              tooltip="المبالغ النقدية المستلمة فعلياً من العميل — بدون الضريبة."
            />
            <StatCard
              title="ذمم مدينة (مفوتر)"
              value={formatCurrency(summary.accountsReceivable)}
              icon={<Receipt className="w-4 h-4" />}
              trend={summary.accountsReceivable > 0 ? 'neutral' : undefined}
              subtitle={summary.accountsReceivable > 0
                ? `${pRevenues.filter(r => r.status === 'invoiced').length} فاتورة قيد التحصيل`
                : 'لا فواتير معلّقة'}
              tooltip="فواتير أُصدرت للعميل ولم تُحصّل بعد."
            />
            <StatCard
              title="الربح المحقق"
              value={formatCurrency(summary.realizedProfit)}
              icon={<TrendingUp className="w-4 h-4" />}
              trend={summary.realizedProfit >= 0 ? 'up' : 'down'}
              subtitle={summary.plannedProfit !== 0 ? `المخطط: ${formatCurrency(summary.plannedProfit)}` : undefined}
              tooltip="= المحصّل − المصروف الفعلي. الربح النقدي الذي دخل حسابك فعلاً حتى الآن."
            />
            {evm ? (
              <StatCard
                title="الأداء المطلوب (TCPI)"
                value={evm.tcpiBAC.toFixed(2)}
                icon={<Target className="w-4 h-4" />}
                trend={evm.tcpiBAC <= 1 ? 'up' : evm.tcpiBAC <= 1.1 ? 'neutral' : 'down'}
                subtitle={evm.tcpiBAC <= 1.0 ? 'مريح — الأداء كافٍ'
                  : evm.tcpiBAC <= 1.1 ? 'ممكن — تحسين طفيف'
                  : evm.tcpiBAC <= 1.2 ? 'صعب — يحتاج تدخل'
                  : 'شبه مستحيل — راجع الخطة'}
                tooltip="To-Complete Performance Index — الكفاءة المطلوبة في باقي العمل لإنجاز المشروع ضمن الموازنة."
              />
            ) : (
              <div className="stat-card flex flex-col items-center justify-center text-center bg-muted/30 border-dashed">
                <Shield className="w-5 h-5 text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium text-muted-foreground">CPI / SPI / TCPI</p>
                <p className="text-[10px] text-muted-foreground mt-1">اعتمد خط الأساس لعرض مؤشرات الأداء (EVM)</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            تنبيه EVM عند غياب خط الأساس (مرة واحدة فقط — مدمج)
            ═══════════════════════════════════════════════════════════════ */}
        {!evm && summary.totalActual === 0 && summary.collectedRevenue === 0 && (
          <div className="mb-4 p-3 rounded-lg border border-dashed bg-muted/20 text-center text-xs text-muted-foreground">
            <Shield className="w-4 h-4 inline-block ml-1" />
            اعتمد خط الأساس من تبويب «خط الأساس» لتفعيل مؤشرات الأداء (CPI / SPI / EAC / TCPI).
          </div>
        )}

        {/* Quick alerts */}
        {(pendingExpensesCount > 0 || pendingChangeOrders > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {pendingExpensesCount > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                <Clock className="w-3 h-3" />
                {pendingExpensesCount} مصروف بانتظار الاعتماد
              </div>
            )}
            {pendingChangeOrders > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                <FileEdit className="w-3 h-3" />
                {pendingChangeOrders} أمر تغيير مقترح
              </div>
            )}
          </div>
        )}

        {/* Export actions live in the header ⋯ menu */}

        {/* 5 main tabs — sections inside each tab use Accordion */}
        <Tabs value={activeGroup} onValueChange={(v) => handleGroupChange(v as TabGroup)} className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full h-auto p-1 gap-1 bg-muted/50 sticky top-[57px] z-10">
            {tabGroups.map((group) => {
              const Icon = group.icon;
              const badgeColor =
                group.badgeLevel === 'critical' ? 'bg-destructive text-destructive-foreground'
                : group.badgeLevel === 'warning' ? 'bg-warning text-warning-foreground'
                : 'bg-primary text-primary-foreground';
              const trigger = (
                <TabsTrigger
                  key={group.key}
                  value={group.key}
                  className="relative flex flex-col md:flex-row items-center gap-1 md:gap-1.5 py-2.5 px-1 md:px-3 text-[11px] md:text-xs min-h-[48px]"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate leading-tight">{group.label}</span>
                  {group.badge > 0 && (
                    <span className={`absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${badgeColor}`}>
                      {group.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
              return group.badgeHint && group.badge > 0 ? (
                <Tooltip key={group.key}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{group.badgeHint}</TooltipContent>
                </Tooltip>
              ) : trigger;
            })}
          </TabsList>

          {(() => {
            const renderSection = (value: string) => {
              switch (value) {
                case 'overview':
                  return (
                    <>
                      <AIExecutiveInsights context={{
                        name: project.name, status: project.status, percentComplete: project.percentComplete,
                        currentMonth, durationMonths: project.durationMonths,
                        contractValue: summary.contractValue, effectiveContractValue: summary.effectiveContractValue,
                        totalPlanned: summary.totalPlanned, totalActual: summary.totalActual,
                        collectedRevenue: summary.collectedRevenue, invoicedRevenue: summary.invoicedRevenue,
                        spendRate: summary.spendRate, plannedProfit: summary.plannedProfit,
                        cpi: evm?.cpi ?? null, spi: evm?.spi ?? null,
                        openRisks: openRisksCount,
                        highRisks: pRisks.filter(r => r.status === 'open' && (r.impact === 'high' || r.impact === 'very_high')).length,
                        pendingExpenses: pendingExpensesCount, pendingChangeOrders,
                        delayedMilestones: pMilestones.filter(m => m.status === 'delayed').length,
                        unsettledFunds: 0, remainingInManagerHand: 0,
                        daysRemaining, currency: project.currency,
                      }} />
                      <ExecutiveSummary
                        project={project} summary={summary} milestones={pMilestones} risks={pRisks}
                        changeOrders={pChangeOrders} expenses={pExpenses} revenues={pRevenues}
                        budgetItems={pBudget} commitments={pCommitments} baselines={projectBaselines}
                        evm={evm} currentMonth={currentMonth} daysRemaining={daysRemaining}
                        totalCommitted={totalCommitted} availableBudget={availableBudget} healthScore={healthScore}
                      />
                    </>
                  );
                case 'milestones':
                  return <MilestonesSection projectId={project.id} milestones={pMilestones} project={project} readOnly={isReadOnly} revenues={pRevenues} />;
                case 'resources':
                  return <ResourcesSection projectId={project.id} resources={pResources} budgetItems={pBudget} expenses={pExpenses} readOnly={isReadOnly} durationMonths={project.durationMonths} />;
                case 'budget':
                  return (
                    <div className="space-y-4">
                      <SmartBudgetAlerts
                        summary={summary}
                        evm={evm}
                        monthlyPlan={getMonthlyBudgetPlan(pBudget, pExpenses, pRevenues, project.durationMonths, project.startDate)}
                        durationMonths={project.durationMonths}
                        currentMonth={currentMonth}
                        pendingChangeOrders={pendingChangeOrders}
                        openHighRisks={openHighRisks}
                        onNavigate={(tab) => {
                          for (const [grp, tabs] of Object.entries(subTabs)) {
                            if (tabs.some(t => t.value === tab)) {
                              setActiveGroup(grp as TabGroup);
                              setActiveTab(tab);
                              return;
                            }
                          }
                          setActiveTab(tab);
                        }}
                      />
                      <BudgetSection projectId={project.id} budgetItems={pBudget} expenses={pExpenses} revenues={pRevenues} durationMonths={project.durationMonths} resources={pResources} contractValue={summary.effectiveContractValue} currency={project.currency} managementReserve={project.managementReserve} readOnly={isReadOnly} baselineLocked={baselines.some(b => b.isActive && b.projectId === project.id)} taxPercent={project.taxPercent} startDate={project.startDate} />
                    </div>
                  );
                case 'baseline':
                  return <BaselineSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} budgetItems={pBudget} project={project} readOnly={isReadOnly} />;
                case 'expenses':
                  return <ExpensesSection projectId={project.id} durationMonths={project.durationMonths} expenses={pExpenses} resources={pResources} custodies={pCustodies} budgetItems={pBudget} revenues={pRevenues} contractValue={summary.effectiveContractValue} readOnly={isReadOnly} taxPercent={project.taxPercent} projectStatus={project.status} />;
                case 'funds':
                  return (
                    <div className="space-y-4">
                      <CashLedgerSection projectId={project.id} funds={projectFunds} settlements={fundSettlements} expenses={pExpenses} custodies={pCustodies} />
                      <CashFlowSankey
                        projectId={project.id}
                        funds={projectFunds}
                        expenses={pExpenses}
                        custodies={pCustodies}
                        paymentRequests={paymentRequests}
                        cashTransfers={cashTransfers || []}
                        resources={pResources}
                        currency={project.currency}
                      />
                      <FundsSection projectId={project.id} expenses={pExpenses} readOnly={isReadOnly} />
                    </div>
                  );
                case 'custody':
                  return <CustodySection projectId={project.id} companyId={project.companyId} custodies={pCustodies} expenses={pExpenses} readOnly={isReadOnly} />;
                case 'commitments':
                  return <CommitmentsSection projectId={project.id} commitments={pCommitments} totalPlanned={summary.totalPlanned} readOnly={isReadOnly} />;
                case 'revenue':
                  return <RevenueSection projectId={project.id} revenues={pRevenues} durationMonths={project.durationMonths} readOnly={isReadOnly} taxPercent={project.taxPercent} milestones={pMilestones} />;
                case 'payables':
                  return <ResourcePayablesSection projectId={project.id} projectName={project.name} readOnly={isReadOnly} />;
                case 'changeorders':
                  return <ChangeOrdersSection projectId={project.id} changeOrders={pChangeOrders} contractValue={project.contractValue} readOnly={isReadOnly} />;
                case 'risks':
                  return <RisksSection projectId={project.id} risks={pRisks} readOnly={isReadOnly} />;
                case 'performance':
                  return (
                    <PerformanceComparisonSection
                      budgetItems={pBudget}
                      expenses={pExpenses}
                      durationMonths={project.durationMonths}
                      startDate={project.startDate}
                      currency={project.currency}
                    />
                  );
                case 'charts':
                  return <ChartsSection pieData={pieData} barData={barData} expenses={pExpenses} totalPlanned={summary.totalPlanned} durationMonths={project.durationMonths} budgetItems={pBudget} />;
                case 'whatif':
                  return (
                    <WhatIfSection
                      contractValue={summary.effectiveContractValue}
                      totalPlanned={summary.totalPlanned}
                      totalActual={summary.totalActual}
                      totalRevenue={totalAllRevenue}
                      durationMonths={project.durationMonths}
                      percentComplete={project.percentComplete}
                      currency={project.currency}
                    />
                  );
                case 'auditlog':
                  return isAdmin ? <AuditLogSection projectId={project.id} /> : null;
                default:
                  return null;
              }
            };

            return tabGroups.map((group) => {
              const sections = subTabs[group.key];
              // For single-section groups (summary), skip Accordion wrapper
              if (sections.length === 1) {
                return (
                  <TabsContent key={group.key} value={group.key} className="mt-2">
                    {renderSection(sections[0].value)}
                  </TabsContent>
                );
              }
              const defaultOpen = activeTab && sections.some(s => s.value === activeTab)
                ? [activeTab]
                : [sections[0].value];
              return (
                <TabsContent key={group.key} value={group.key} className="mt-2">
                  <Accordion
                    type="multiple"
                    defaultValue={defaultOpen}
                    onValueChange={(vals) => {
                      // اعتبر آخر عنصر مفتوح (الأحدث) هو التبويب النشط، ليس الأول
                      if (vals.length > 0) setActiveTab(vals[vals.length - 1]);
                    }}
                    className="space-y-2"
                  >
                    {sections.map((s) => {
                      const Icon = s.icon;
                      return (
                        <AccordionItem key={s.value} value={s.value} className="border border-border rounded-lg bg-card px-3 md:px-4">
                          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                            <div className="flex items-center gap-2 text-foreground">
                              <Icon className="w-4 h-4 text-primary" />
                              <span>{s.label}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pb-4">
                            {renderSection(s.value)}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </TabsContent>
              );
            });
          })()}
        </Tabs>
      </motion.div>

      {/* Mobile FAB — primary contextual action per active tab */}
      {!isReadOnly && (() => {
        const fabMap: Record<string, { label: string; tab: string; group: TabGroup }> = {
          finance: { label: 'إضافة مصروف', tab: 'expenses', group: 'finance' },
          planning: { label: 'إضافة مرحلة', tab: 'milestones', group: 'planning' },
          tracking: { label: 'تحليل ما-إذا', tab: 'whatif', group: 'tracking' },
          management: { label: 'إضافة خطر', tab: 'risks', group: 'management' },
        };
        const fab = fabMap[activeGroup];
        if (!fab) return null;
        return (
          <MobileFAB
            label={fab.label}
            onClick={() => {
              setActiveGroup(fab.group);
              setActiveTab(fab.tab);
              // smooth scroll to section + flash hint to use the section's "+" button
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
            }}
          />
        );
      })()}
    </AppLayout>
  );
}
