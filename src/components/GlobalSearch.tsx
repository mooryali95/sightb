import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Building2, FolderKanban, Briefcase, Search, X } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator, Command,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState('');
  const { companies, portfolios, projects } = useStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Auto-focus search input when mobile sheet opens
  useEffect(() => {
    if (open && isMobile) {
      const t = setTimeout(() => mobileInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    if (!open) setMobileQuery('');
  }, [open, isMobile]);

  const go = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const activeCompanies = useMemo(() => companies.filter(c => c.status !== 'archived'), [companies]);

  const q = mobileQuery.trim().toLowerCase();
  const filteredCompanies = useMemo(
    () => q ? activeCompanies.filter(c => c.name.toLowerCase().includes(q)) : activeCompanies,
    [activeCompanies, q]
  );
  const filteredPortfolios = useMemo(
    () => q ? portfolios.filter(p => p.name.toLowerCase().includes(q)) : portfolios,
    [portfolios, q]
  );
  const filteredProjects = useMemo(
    () => q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects,
    [projects, q]
  );
  const hasResults = filteredCompanies.length + filteredPortfolios.length + filteredProjects.length > 0;

  // ============= Desktop trigger + dialog =============
  if (!isMobile) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2 text-xs text-muted-foreground h-8 px-3 hidden md:flex"
        >
          <Search className="w-3.5 h-3.5" />
          <span>بحث...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="ابحث عن شركة، محفظة أو مشروع..." />
          <CommandList>
            <CommandEmpty>لا توجد نتائج</CommandEmpty>

            {activeCompanies.length > 0 && (
              <CommandGroup heading="الشركات">
                {activeCompanies.map((c) => (
                  <CommandItem key={c.id} onSelect={() => go(`/company/${c.id}`)}>
                    <Building2 className="ml-2 h-4 w-4 text-primary" />
                    <span>{c.name}</span>
                    {c.description && (
                      <span className="text-xs text-muted-foreground mr-2 truncate max-w-[200px]">
                        — {c.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {portfolios.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="المحافظ">
                  {portfolios.map((p) => {
                    const comp = companies.find(c => c.id === p.companyId);
                    return (
                      <CommandItem key={p.id} onSelect={() => go(`/portfolio/${p.id}`)}>
                        <FolderKanban className="ml-2 h-4 w-4 text-primary/70" />
                        <span>{p.name}</span>
                        {comp && (
                          <span className="text-xs text-muted-foreground mr-2">
                            {comp.name}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="المشاريع">
                  {projects.map((p) => {
                    const comp = companies.find(c => c.id === p.companyId);
                    return (
                      <CommandItem key={p.id} onSelect={() => go(`/project/${p.id}`)}>
                        <Briefcase className="ml-2 h-4 w-4 text-muted-foreground" />
                        <span>{p.name}</span>
                        {comp && (
                          <span className="text-xs text-muted-foreground mr-2">
                            {comp.name}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </CommandDialog>
      </>
    );
  }

  // ============= Mobile trigger + bottom Sheet =============
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="بحث"
        className="md:hidden h-8 w-8"
      >
        <Search className="w-4 h-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col" dir="rtl">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
            <SheetTitle className="text-right text-base">بحث سريع</SheetTitle>
          </SheetHeader>

          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={mobileInputRef}
                value={mobileQuery}
                onChange={(e) => setMobileQuery(e.target.value)}
                placeholder="ابحث عن شركة، محفظة أو مشروع..."
                className="w-full h-10 pr-9 pl-9 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                autoComplete="off"
                inputMode="search"
              />
              {mobileQuery && (
                <button
                  type="button"
                  aria-label="مسح"
                  onClick={() => setMobileQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <Command className="flex-1 overflow-hidden">
            <CommandList className="max-h-full">
              {!hasResults && (
                <CommandEmpty>لا توجد نتائج</CommandEmpty>
              )}

              {filteredCompanies.length > 0 && (
                <CommandGroup heading="الشركات">
                  {filteredCompanies.map((c) => (
                    <CommandItem key={c.id} value={c.name} onSelect={() => go(`/company/${c.id}`)}>
                      <Building2 className="ml-2 h-4 w-4 text-primary" />
                      <span>{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredPortfolios.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="المحافظ">
                    {filteredPortfolios.map((p) => {
                      const comp = companies.find(c => c.id === p.companyId);
                      return (
                        <CommandItem key={p.id} value={p.name} onSelect={() => go(`/portfolio/${p.id}`)}>
                          <FolderKanban className="ml-2 h-4 w-4 text-primary/70" />
                          <span>{p.name}</span>
                          {comp && <span className="text-xs text-muted-foreground mr-2">{comp.name}</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}

              {filteredProjects.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="المشاريع">
                    {filteredProjects.map((p) => {
                      const comp = companies.find(c => c.id === p.companyId);
                      return (
                        <CommandItem key={p.id} value={p.name} onSelect={() => go(`/project/${p.id}`)}>
                          <Briefcase className="ml-2 h-4 w-4 text-muted-foreground" />
                          <span>{p.name}</span>
                          {comp && <span className="text-xs text-muted-foreground mr-2">{comp.name}</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </SheetContent>
      </Sheet>
    </>
  );
}
