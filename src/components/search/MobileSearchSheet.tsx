import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Command, CommandList, CommandEmpty } from '@/components/ui/command';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { searchResults, type SearchSource } from './searchResults';
import { SearchResultGroups } from './SearchResultGroups';

interface MobileSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SearchSource;
  onGo: (path: string) => void;
}

/** The bottom sheet on mobile: its own query box, narrowed by name, forgotten when the sheet closes. */
export function MobileSearchSheet({ open, onOpenChange, source, onGo }: MobileSearchSheetProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the query box when the sheet opens; forget the query when it closes.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
    setQuery('');
  }, [open]);

  const results = useMemo(() => searchResults(source, query), [source, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="text-start text-base">بحث سريع</SheetTitle>
        </SheetHeader>

        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن شركة، محفظة أو مشروع..."
              className="w-full h-10 ps-9 pe-9 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoComplete="off"
              inputMode="search"
            />
            {query && (
              <button
                type="button"
                aria-label="مسح"
                onClick={() => setQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <Command className="flex-1 overflow-hidden">
          <CommandList className="max-h-full">
            {!results.hasResults && <CommandEmpty>لا توجد نتائج</CommandEmpty>}
            <SearchResultGroups
              companies={results.companies}
              portfolios={results.portfolios}
              projects={results.projects}
              allCompanies={source.companies}
              onGo={onGo}
            />
          </CommandList>
        </Command>
      </SheetContent>
    </Sheet>
  );
}
