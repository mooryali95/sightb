import { useStore } from '@/store/useStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Plus, ChevronLeft, Menu, Users, BellRing, ScrollText, Bug, KeyRound, ScanSearch, Layers, BarChart3 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useRole } from '@/hooks/useRole';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { buildSidebarTree, toggled } from './sidebar/sidebarTree';
import { CompanyBranch } from './sidebar/CompanyBranch';
import { NavItem, SidebarSearch, SignOutButton, UserInfo } from './sidebar/SidebarChrome';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const companies = useStore((s) => s.companies);
  const portfolios = useStore((s) => s.portfolios);
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isOwner, canEdit } = useRole();
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState<Set<string>>(new Set()); // per company
  const [search, setSearch] = useState('');

  const tree = useMemo(
    () => buildSidebarTree(companies, portfolios, projects, { search, expandedCompanies, expandedPortfolios, showInactive }),
    [companies, portfolios, projects, search, expandedCompanies, expandedPortfolios, showInactive],
  );
  const searching = tree.query !== '';
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={cn(
        'sidebar-gradient h-dvh flex flex-col border-e border-sidebar-border transition-[width] duration-300 sticky top-0 z-30',
        collapsed ? 'w-16' : 'w-72',
      )}
    >
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
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'} aria-expanded={!collapsed} className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0">
          {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <NavItem collapsed={collapsed} label="لوحة التحكم" icon={<LayoutDashboard className="w-4 h-4 shrink-0" />} active={isActive('/')} onClick={() => navigate('/')} />
        {isAdmin && (
          <NavItem collapsed={collapsed} label="إدارة المستخدمين" icon={<Users className="w-4 h-4 shrink-0" />} active={isActive('/users')} onClick={() => navigate('/users')} />
        )}
        <NavItem collapsed={collapsed} label="الشاشة المالية" icon={<BarChart3 className="w-4 h-4 shrink-0" />} active={isActive('/finance')} onClick={() => navigate('/finance')} />
        <NavItem collapsed={collapsed} label="هيكلة المشاريع" icon={<Layers className="w-4 h-4 shrink-0" />} active={isActive('/organize')} onClick={() => navigate('/organize')} />
        <NavItem collapsed={collapsed} label="مركز التنبيهات" icon={<BellRing className="w-4 h-4 shrink-0" />} active={isActive('/alerts')} onClick={() => navigate('/alerts')} />
        <NavItem collapsed={collapsed} label="الأمان" icon={<KeyRound className="w-4 h-4 shrink-0" />} active={isActive('/security')} onClick={() => navigate('/security')} />
        {isOwner && (
          <>
            <NavItem collapsed={collapsed} label="مركز الرقابة" icon={<ScanSearch className="w-4 h-4 shrink-0" />} active={isActive('/control-center')} onClick={() => navigate('/control-center')} />
            <NavItem collapsed={collapsed} label="السجل الرئيسي" icon={<ScrollText className="w-4 h-4 shrink-0" />} active={isActive('/audit')} onClick={() => navigate('/audit')} />
            <NavItem collapsed={collapsed} label="سجل الأعطال" icon={<Bug className="w-4 h-4 shrink-0" />} active={isActive('/errors')} onClick={() => navigate('/errors')} />
          </>
        )}

        {!collapsed && (
          <div className="pt-4">
            <SidebarSearch value={search} onChange={setSearch} />

            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-xs font-semibold text-sidebar-foreground/70">الشركات</span>
              {isAdmin && (
                <button onClick={() => navigate('/companies/new')} aria-label="إضافة شركة" title="إضافة شركة" className="hit text-sidebar-foreground/70 hover:text-primary motion-fast transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {tree.nodes.map((node) => (
              <CompanyBranch
                key={node.company.id}
                node={node}
                searching={searching}
                canEdit={canEdit('company', node.company.id)}
                onToggleCompany={(id) => setExpandedCompanies((prev) => toggled(prev, id))}
                onTogglePortfolio={(id) => setExpandedPortfolios((prev) => toggled(prev, id))}
                onToggleFinished={(id) => setShowInactive((prev) => toggled(prev, id))}
              />
            ))}

            {searching && tree.nodes.length === 0 && (
              <p className="text-xs text-sidebar-foreground/40 text-center py-4 px-3">
                لا توجد نتائج مطابقة لـ "{search}"
              </p>
            )}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <UserInfo />
          <SignOutButton />
          <div className="flex items-center justify-center gap-1.5 py-1">
            <span lang="en" className="text-xs text-sidebar-foreground/70">Powered by</span>
            <span lang="en" className="text-xs font-bold text-sidebar-primary tracking-wider">BASSERH</span>
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
