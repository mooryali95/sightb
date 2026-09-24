import { LogOut, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { reloadAt } from '@/lib/reload-at';

/** A link in the rail: its label beside the icon, or in a tooltip when collapsed. */
export function NavItem({ collapsed, label, icon, active, onClick }: {
  collapsed: boolean; label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  const btn = (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
        collapsed && 'justify-center px-2',
        active ? 'bg-primary/20 text-primary font-semibold border-r-2 border-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent',
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

/** The inline search over the tree, with its clear button and the hint to the global search. */
export function SidebarSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="px-2 mb-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="بحث في الشركات والمشاريع..."
          aria-label="بحث في القائمة الجانبية"
          className="w-full bg-sidebar-accent/40 hover:bg-sidebar-accent focus:bg-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-foreground/40 text-xs rounded-md pr-8 pl-7 py-1.5 outline-none focus:ring-2 focus:ring-sidebar-ring transition-colors"
        />
        {value && (
          <button
            onClick={() => onChange('')}
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
  );
}

export function UserInfo() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  return (
    <div className="px-3 py-1.5">
      <p className="text-xs font-medium text-sidebar-foreground truncate" dir="ltr">{user?.email}</p>
      <p className="text-xs text-sidebar-foreground/40">{isAdmin ? 'مدير النظام' : 'مستخدم'}</p>
    </div>
  );
}

export function SignOutButton({ collapsed }: { collapsed?: boolean }) {
  const { signOut } = useAuth();

  // A full load of the login page, not an in-app navigation. Signing out
  // empties `user`, and ProtectedRoute answers that with its own redirect to
  // /welcome; React Router 7 runs both as transitions, so whichever landed
  // last won and "sign out" could end on the landing page. A full load cannot
  // be overtaken, and it drops the last user's data held in the store, which
  // an in-app navigation left in memory. The idle timeout leaves the same way.
  const handleSignOut = async () => {
    await signOut();
    reloadAt('/login');
  };

  const btn = (
    <button
      onClick={handleSignOut}
      aria-label="تسجيل الخروج"
      className={cn(
        'flex items-center gap-2 rounded-lg text-sm transition-colors text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent',
        collapsed ? 'w-full justify-center p-2' : 'w-full px-3 py-2',
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
