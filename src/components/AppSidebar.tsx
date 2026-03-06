import { useStore } from '@/store/useStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Building2, FolderKanban, LayoutDashboard, Plus, ChevronDown, ChevronLeft,
  Briefcase, Settings, Menu,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { companies, portfolios, projects } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());

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

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={cn(
        'sidebar-gradient h-screen flex flex-col border-l border-sidebar-border transition-all duration-300 sticky top-0',
        collapsed ? 'w-16' : 'w-72'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-bold text-sidebar-foreground text-sm">إدارة المحافظ</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Dashboard */}
        <button
          onClick={() => navigate('/')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
            isActive('/')
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent'
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          {!collapsed && <span>لوحة التحكم</span>}
        </button>

        {/* Companies Section */}
        {!collapsed && (
          <div className="pt-4">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                الشركات
              </span>
              <button
                onClick={() => navigate('/companies/new')}
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {companies.map((company) => (
              <div key={company.id}>
                <button
                  onClick={() => toggleCompany(company.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                    'text-sidebar-foreground hover:bg-sidebar-accent'
                  )}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-right truncate">{company.name}</span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-transform',
                      expandedCompanies.has(company.id) && 'rotate-180'
                    )}
                  />
                </button>

                {expandedCompanies.has(company.id) && (
                  <div className="mr-4 border-r border-sidebar-border/30 pr-2 space-y-0.5">
                    {portfolios
                      .filter((p) => p.companyId === company.id)
                      .map((portfolio) => (
                        <div key={portfolio.id}>
                          <button
                            onClick={() => togglePortfolio(portfolio.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
                              'text-sidebar-foreground/80 hover:bg-sidebar-accent'
                            )}
                          >
                            <FolderKanban className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1 text-right truncate">{portfolio.name}</span>
                            <ChevronDown
                              className={cn(
                                'w-3 h-3 transition-transform',
                                expandedPortfolios.has(portfolio.id) && 'rotate-180'
                              )}
                            />
                          </button>

                          {expandedPortfolios.has(portfolio.id) && (
                            <div className="mr-3 space-y-0.5">
                              {projects
                                .filter((p) => p.portfolioId === portfolio.id)
                                .map((project) => (
                                  <button
                                    key={project.id}
                                    onClick={() => navigate(`/project/${project.id}`)}
                                    className={cn(
                                      'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
                                      isActive(`/project/${project.id}`)
                                        ? 'bg-sidebar-primary/20 text-sidebar-primary'
                                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent'
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        'w-1.5 h-1.5 rounded-full shrink-0',
                                        project.status === 'active' ? 'bg-accent' : 
                                        project.status === 'completed' ? 'bg-primary' : 'bg-warning'
                                      )}
                                    />
                                    <span className="truncate">{project.name}</span>
                                  </button>
                                ))}
                              <button
                                onClick={() => navigate(`/project/new?portfolio=${portfolio.id}&company=${company.id}`)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>مشروع جديد</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    <button
                      onClick={() => navigate(`/portfolio/new?company=${company.id}`)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>محفظة جديدة</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>الإعدادات</span>
          </button>
        </div>
      )}
    </aside>
  );
}
