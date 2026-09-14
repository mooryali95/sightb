import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Search } from 'lucide-react';
import { CommandDialog, CommandInput, CommandList, CommandEmpty } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { activeCompanies } from './search/searchResults';
import { SearchResultGroups } from './search/SearchResultGroups';
import { MobileSearchSheet } from './search/MobileSearchSheet';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const companies = useStore((s) => s.companies);
  const portfolios = useStore((s) => s.portfolios);
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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

  const source = useMemo(() => ({ companies, portfolios, projects }), [companies, portfolios, projects]);

  if (isMobile) {
    return (
      <>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="بحث" className="md:hidden h-8 w-8">
          <Search className="w-4 h-4" />
        </Button>
        <MobileSearchSheet open={open} onOpenChange={setOpen} source={source} onGo={go} />
      </>
    );
  }

  // Desktop: the dialog narrows its own list as one types (cmdk matches on each item's text).
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
          <SearchResultGroups
            companies={activeCompanies(companies)}
            portfolios={portfolios}
            projects={projects}
            allCompanies={companies}
            withDescriptions
            onGo={go}
          />
        </CommandList>
      </CommandDialog>
    </>
  );
}
