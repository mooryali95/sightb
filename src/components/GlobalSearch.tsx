import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Building2, FolderKanban, Briefcase, Search } from 'lucide-react';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const { companies, portfolios, projects } = useStore();
  const navigate = useNavigate();

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

  const go = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const activeCompanies = companies.filter(c => c.status !== 'archived');

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
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden h-8 w-8"
      >
        <Search className="w-4 h-4" />
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
