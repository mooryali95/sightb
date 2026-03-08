import { ReactNode, useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SmartNotifications } from '@/components/SmartNotifications';

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
        'fixed md:relative z-30 md:z-auto transition-transform duration-300',
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
        {/* Top bar with search & notifications */}
        <div className="flex items-center justify-between gap-3 p-3 md:px-6 md:py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="md:hidden h-8 w-8">
              <Menu className="w-4 h-4" />
            </Button>
            <span className="font-bold text-sm md:hidden">رؤية</span>
          </div>

          <div className="flex items-center gap-2">
            <GlobalSearch />
            <SmartNotifications />
          </div>
        </div>

        <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
