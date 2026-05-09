import { useStore } from '@/store/useStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Building2, FolderKanban, LayoutDashboard, Plus, ChevronDown, ChevronLeft,
  Briefcase, Menu, LogOut, Users, ScrollText, Archive, CheckCircle2, XCircle, Search, X,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/types/project';

const INACTIVE_STATUSES: ProjectStatus[] = ['completed', 'archived', 'cancelled'];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { companies, portfolios, projects } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isOwner, canEdit } = useRole();
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState<Set<string>>(new Set()); // per company
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const matchedCompanyIds = useMemo(() => {
    if (!normalizedSearch) return null;
    const ids = new Set<string>();
    companies.forEach(c => { if (c.name.toLowerCase().includes(normalizedSearch)) ids.add(c.id); });
    portfolios.forEach(p => { if (p.name.toLowerCase().includes(normalizedSearch)) ids.add(p.companyId); });
    projects.forEach(p => { if (p.name.toLowerCase().includes(normalizedSearch)) ids.add(p.companyId); });
    return ids;
  }, [normalizedSearch, companies, portfolios, projects]);

  const matchedPortfolioIds = useMemo(() => {
    if (!normalizedSearch) return null;
    const ids = new Set<string>();
    portfolios.forEach(p => { if (p.name.toLowerCase().includes(normalizedSearch)) ids.add(p.id); });
    projects.forEach(p => { if (p.portfolioId && p.name.toLowerCase().includes(normalizedSearch)) ids.add(p.portfolioId); });
    return ids;
  }, [normalizedSearch, portfolios, projects]);

  const matchesSearch = (name: string) => !normalizedSearch || name.toLowerCase().includes(normalizedSearch);
  const isCompanyMatched = (id: string, name: string) => !normalizedSearch || matchesSearch(name) || !!matchedCompanyIds?.has(id);
  const isPortfolioMatched = (id: string, name: string) => !normalizedSearch || matchesSearch(name) || !!matchedPortfolioIds?.has(id);
  const isProjectMatched = (name: string) => !normalizedSearch || matchesSearch(name);
  const isCompanyExpanded = (id: string) => (normalizedSearch ? !!matchedCompanyIds?.has(id) : expandedCompanies.has(id));
  const isPortfolioExpandedFn = (id: string) => (normalizedSearch ? !!matchedPortfolioIds?.has(id) : expandedPortfolios.has(id));

  const toggleCompany = (id: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePortfolio = (id: string) => {
    setExpandedPortfolios((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleShowInactive = (companyId: string) => {
    setShowInactive((prev) => {
      const next = new Set(prev);
      next.has(companyId) ? next.delete(companyId) : next.add(companyId);
      return next;
    });
  };

  const isActive = (path: string) => location.pathname === path;

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />;
    if (status === 'archived') return <Archive className="w-3 h-3 text-muted-foreground shrink-0" />;
    if (status === 'cancelled') return <XCircle className="w-3 h-3 text-destructive/60 shrink-0" />;
    return (
      <div className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        status === 'active' || status === 'approved' ? 'bg-success' : 'bg-warning'
      )} />
    );
  };

  const ProjectButton = ({ project }: { project: typeof projects[0] }) => {
    const inactive = INACTIVE_STATUSES.includes(project.status as ProjectStatus);
    const active = isActive(`/project/${project.id}`);
    return (
      <button
        onClick={() => navigate(`/project/${project.id}`)}
        className={cn(
          'relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-normal transition-colors',
          active
            ? 'bg-primary/20 text-primary border-r-2 border-primary'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground/85',
          inactive && 'opacity-60'
        )}
      >
        {statusIcon(project.status)}
        <span className={cn('truncate', inactive && 'line-through decoration-1')}>{project.name}</span>
        {inactive && (
          <span className="text-xs text-muted-foreground mr-auto shrink-0">
            {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'sidebar-gradient h-screen flex flex-col border-l border-sidebar-border transition-all duration-300 sticky top-0 z-30',
        collapsed ? 'w-16' : 'w-72'
      )}
    >
      {/* Header with Logo */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img src={basserhLogo} alt="بصيرة" className="w-9 h-9 rounded-lg object-cover" />
            <div>
              <span className="font-bold text-sidebar-foreground text-sm block">رؤية</span>
              <span className="text-xs text-sidebar-foreground/40">نظام إدارة المحافظ والمشاريع</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost" size="icon" onClick={onToggle}
          className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
        >
          {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Dashboard */}
        <NavItem
          collapsed={collapsed}
          label="لوحة التحكم"
          icon={<LayoutDashboard className="w-4 h-4 shrink-0" />}
          active={isActive('/')}
          onClick={() => navigate('/')}
        />

        {/* User Management - Admin only */}
        {isAdmin && (
          <NavItem
            collapsed={collapsed}
            label="إدارة المستخدمين"
            icon={<Users className="w-4 h-4 shrink-0" />}
            active={isActive('/users')}
            onClick={() => navigate('/users')}
          />
        )}

        {/* System Audit Log - Owner only */}
        {isOwner && (
          <NavItem
            collapsed={collapsed}
            label="السجل الرئيسي"
            icon={<ScrollText className="w-4 h-4 shrink-0" />}
            active={isActive('/audit')}
            onClick={() => navigate('/audit')}
          />
        )}

        {/* Companies Section */}
        {!collapsed && (
          <div className="pt-4">
            {/* Inline search */}
            <div className="px-2 mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث في الشركات والمشاريع..."
                  aria-label="بحث في القائمة الجانبية"
                  className="w-full bg-sidebar-accent/40 hover:bg-sidebar-accent focus:bg-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-foreground/40 text-xs rounded-md pr-8 pl-7 py-1.5 outline-none focus:ring-2 focus:ring-sidebar-ring transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="مسح البحث"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-[10px] text-sidebar-foreground/30">
                  للبحث المتقدم: <kbd className="px-1 rounded bg-sidebar-accent text-[10px]">Ctrl</kbd>+<kbd className="px-1 rounded bg-sidebar-accent text-[10px]">K</kbd>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">الشركات</span>
              {isAdmin && (
                <button onClick={() => navigate('/companies/new')} className="text-sidebar-foreground/40 hover:text-primary motion-fast transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {companies.filter(c => c.status !== 'archived').map((company) => {
              const companyProjects = projects.filter(p => p.companyId === company.id);
              const activeProjects = companyProjects.filter(p => !INACTIVE_STATUSES.includes(p.status as ProjectStatus));
              const inactiveProjects = companyProjects.filter(p => INACTIVE_STATUSES.includes(p.status as ProjectStatus));
              const isShowingInactive = showInactive.has(company.id);

              if (!isCompanyMatched(company.id, company.name)) return null;
              const expanded = isCompanyExpanded(company.id);

              return (
                <div key={company.id}>
                  {/* Level 1: Company */}
                  <div className={cn(
                    'relative w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold motion-fast transition-colors',
                    isActive(`/company/${company.id}`)
                      ? 'bg-primary/15 text-primary border-r-2 border-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  )}>
                    <Building2 className="w-4 h-4 shrink-0 text-primary" />
                    <button
                      onClick={() => navigate(`/company/${company.id}`)}
                      className="flex-1 text-right truncate hover:text-primary transition-colors"
                    >
                      {company.name}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCompany(company.id); }}
                      aria-label={expanded ? 'طي' : 'توسيع'}
                      className="p-0.5 rounded hover:bg-sidebar-accent"
                    >
                      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="mr-3 border-r border-primary/30 pr-2 space-y-0.5 mt-1">
                      {/* Active direct projects (no portfolio) */}
                      {activeProjects.filter(p => !p.portfolioId && isProjectMatched(p.name)).map((project) => (
                        <ProjectButton key={project.id} project={project} />
                      ))}

                      {/* Level 2: Portfolios */}
                      {portfolios.filter((p) => p.companyId === company.id).map((portfolio) => {
                        const portfolioActiveProjects = activeProjects.filter(p => p.portfolioId === portfolio.id);
                        const portfolioInactiveProjects = inactiveProjects.filter(p => p.portfolioId === portfolio.id);
                        const portfolioActive = isActive(`/portfolio/${portfolio.id}`);

                        if (!isPortfolioMatched(portfolio.id, portfolio.name)) return null;
                        const pExpanded = isPortfolioExpandedFn(portfolio.id);

                        return (
                          <div key={portfolio.id}>
                            <div className={cn(
                              'relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium motion-fast transition-colors',
                              portfolioActive
                                ? 'bg-primary/15 text-primary border-r-2 border-primary'
                                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent'
                            )}>
                              <FolderKanban className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                              <button
                                onClick={() => navigate(`/portfolio/${portfolio.id}`)}
                                className="flex-1 text-right truncate hover:text-primary transition-colors"
                              >
                                {portfolio.name}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePortfolio(portfolio.id); }}
                                aria-label={pExpanded ? 'طي' : 'توسيع'}
                                className="p-0.5 rounded hover:bg-sidebar-accent"
                              >
                                <ChevronDown className={cn('w-3 h-3 transition-transform', pExpanded && 'rotate-180')} />
                              </button>
                            </div>

                            {pExpanded && (
                              <div className="mr-3 border-r border-primary/15 pr-2 space-y-0.5 mt-0.5">
                                {/* Level 3: Projects */}
                                {portfolioActiveProjects.filter(p => isProjectMatched(p.name)).map((project) => (
                                  <ProjectButton key={project.id} project={project} />
                                ))}

                                {isShowingInactive && portfolioInactiveProjects.filter(p => isProjectMatched(p.name)).map((project) => (
                                  <ProjectButton key={project.id} project={project} />
                                ))}

                                {!normalizedSearch && canEdit('company', company.id) && (
                                  <button
                                    onClick={() => navigate(`/project/new?portfolio=${portfolio.id}&company=${company.id}`)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-primary/70 hover:bg-sidebar-accent transition-colors"
                                  >
                                    <Plus className="w-3 h-3" /><span>مشروع جديد</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Inactive direct projects (no portfolio) */}
                      {isShowingInactive && inactiveProjects.filter(p => !p.portfolioId && isProjectMatched(p.name)).map((project) => (
                        <ProjectButton key={project.id} project={project} />
                      ))}

                      {/* Add project / portfolio (hidden during search) */}
                      {!normalizedSearch && canEdit('company', company.id) && (
                        <>
                          <button
                            onClick={() => navigate(`/project/new?company=${company.id}`)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-primary/70 hover:bg-sidebar-accent transition-colors"
                          >
                            <Plus className="w-3 h-3" /><span>مشروع مستقل</span>
                          </button>
                          <button
                            onClick={() => navigate(`/portfolio/new?company=${company.id}`)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-primary/70 hover:bg-sidebar-accent transition-colors"
                          >
                            <Plus className="w-3 h-3" /><span>محفظة جديدة</span>
                          </button>
                        </>
                      )}

                      {/* Toggle inactive projects */}
                      {!normalizedSearch && inactiveProjects.length > 0 && (
                        <button
                          onClick={() => toggleShowInactive(company.id)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
                        >
                          <Archive className="w-3 h-3" />
                          <span>
                            {isShowingInactive
                              ? 'إخفاء المنتهية'
                              : `عرض المنتهية (${inactiveProjects.length})`
                            }
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {normalizedSearch && companies.filter(c => c.status !== 'archived' && isCompanyMatched(c.id, c.name)).length === 0 && (
              <p className="text-xs text-sidebar-foreground/40 text-center py-4 px-3">
                لا توجد نتائج مطابقة لـ "{search}"
              </p>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <UserInfo />
          <SignOutButton />
          <div className="flex items-center justify-center gap-1.5 py-1">
            <span className="text-xs text-sidebar-foreground/30">Powered by</span>
            <span className="text-[11px] font-bold text-primary tracking-wider">BASSERH</span>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="p-2 border-t border-sidebar-border">
          <SignOutButton collapsed />
        </div>
      )}
    </aside>
  );
}

function UserInfo() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  return (
    <div className="px-3 py-1.5">
      <p className="text-xs font-medium text-sidebar-foreground truncate" dir="ltr">{user?.email}</p>
      <p className="text-xs text-sidebar-foreground/40">
        {isAdmin ? 'مدير النظام' : 'مستخدم'}
      </p>
    </div>
  );
}

function NavItem({
  collapsed, label, icon, active, onClick,
}: { collapsed: boolean; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  const btn = (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
        collapsed && 'justify-center px-2',
        active
          ? 'bg-primary/20 text-primary font-semibold border-r-2 border-primary'
          : 'text-sidebar-foreground hover:bg-sidebar-accent'
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="left"><p>{label}</p></TooltipContent>
    </Tooltip>
  );
}

function SignOutButton({ collapsed }: { collapsed?: boolean }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const btn = (
    <button
      onClick={handleSignOut}
      aria-label="تسجيل الخروج"
      className={cn(
        'flex items-center gap-2 rounded-lg text-sm transition-colors text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent',
        collapsed ? 'w-full justify-center p-2' : 'w-full px-3 py-2'
      )}
    >
      <LogOut className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="text-xs">تسجيل الخروج</span>}
    </button>
  );

  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="left"><p>تسجيل الخروج</p></TooltipContent>
    </Tooltip>
  );
}
