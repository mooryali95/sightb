import { Building2, FolderKanban, Briefcase } from 'lucide-react';
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import type { Company, Portfolio, Project } from '@/types/project';

interface SearchResultGroupsProps {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  /** Every company, to name the one a portfolio or project belongs to. */
  allCompanies: Company[];
  /** Show a company's description after its name. */
  withDescriptions?: boolean;
  onGo: (path: string) => void;
}

/** The three result groups: companies, then portfolios and projects each with their company. */
export function SearchResultGroups({ companies, portfolios, projects, allCompanies, withDescriptions, onGo }: SearchResultGroupsProps) {
  const companyOf = (companyId: string) => allCompanies.find((c) => c.id === companyId);
  return (
    <>
      {companies.length > 0 && (
        <CommandGroup heading="الشركات">
          {companies.map((c) => (
            <CommandItem key={c.id} onSelect={() => onGo(`/company/${c.id}`)}>
              <Building2 className="me-2 h-4 w-4 text-primary" />
              <span>{c.name}</span>
              {withDescriptions && c.description && (
                <span className="text-xs text-muted-foreground ms-2 truncate max-w-[200px]">
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
              const comp = companyOf(p.companyId);
              return (
                <CommandItem key={p.id} onSelect={() => onGo(`/portfolio/${p.id}`)}>
                  <FolderKanban className="me-2 h-4 w-4 text-primary/70" />
                  <span>{p.name}</span>
                  {comp && <span className="text-xs text-muted-foreground ms-2">{comp.name}</span>}
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
              const comp = companyOf(p.companyId);
              return (
                <CommandItem key={p.id} onSelect={() => onGo(`/project/${p.id}`)}>
                  <Briefcase className="me-2 h-4 w-4 text-muted-foreground" />
                  <span>{p.name}</span>
                  {comp && <span className="text-xs text-muted-foreground ms-2">{comp.name}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      )}
    </>
  );
}
