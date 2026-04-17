import { ReactNode, useState } from 'react';
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

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/40 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <div className={cn(
        'fixed right-0 top-0 bottom-0 md:relative z-30 md:z-auto transition-transform duration-300 ease-out',
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

      <main className="flex-1 overflow-auto min-w-0">
        {/* Top bar with breadcrumb, search & notifications */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
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
        </div>

        {/* Content wrapper — fixed p-6 (responsive comes from inner grids) */}
        <div className="p-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
