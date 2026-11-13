import { ReactNode, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageEnter } from '@/lib/a11y/page-enter';
import { AppSidebar } from '@/components/AppSidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SmartNotifications } from '@/components/SmartNotifications';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppBreadcrumb } from '@/components/AppBreadcrumb';

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  usePageEnter(content, pathname);
  // The top bar gains a shadow once the page scrolls under it.
  const [scrolled, setScrolled] = useState(false);

  return (
    <div className="flex min-h-dvh w-full app-surface">
      {/* Mobile overlay — fades in and out with the drawer */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 bg-foreground/40 backdrop-blur-[2px] z-20 md:hidden transition-opacity duration-300 ease-out',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar - hidden on mobile unless open */}
      <div className={cn(
        'fixed start-0 top-0 bottom-0 md:relative z-30 md:z-auto transition-transform duration-300 ease-out',
        mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
      )}>
        <AppSidebar
          collapsed={collapsed}
          onToggle={() => {
            setCollapsed(!collapsed);
            setMobileOpen(false);
          }}
        />
      </div>

      <main
        className="flex-1 overflow-auto min-w-0"
        onScroll={(e) => {
          const next = e.currentTarget.scrollTop > 4;
          if (next !== scrolled) setScrolled(next);
        }}
      >
        {/* Top bar with breadcrumb, search & notifications */}
        <div className={cn(
          'relative flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b bg-card/75 backdrop-blur-md sticky top-0 z-10 transition-[box-shadow,border-color] duration-300',
          scrolled ? 'border-border shadow-card' : 'border-border/60',
        )}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="md:hidden h-8 w-8 shrink-0"
              aria-label="القائمة"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm md:hidden">رؤية</span>

            {/* Breadcrumb fills remaining space; hidden when on root dashboard */}
            <div className="hidden md:flex items-center min-w-0 flex-1">
              <AppBreadcrumb />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <GlobalSearch />
            <SmartNotifications />
            <ThemeToggle />
          </div>
          {/* A thin gold line runs once on every page change */}
          <div key={pathname} aria-hidden="true" className="route-progress absolute inset-x-0 -bottom-px pointer-events-none" />
        </div>

        {/* Content wrapper — fixed p-6 (responsive comes from inner grids) */}
        <div ref={content} className="p-6 pb-28 md:pb-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
