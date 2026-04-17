import { Fragment, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStore } from '@/store/useStore';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface Crumb {
  label: string;
  href?: string;
}

/**
 * Contextual breadcrumb shown in the top bar.
 * Renders nothing on the dashboard root and on the welcome/login pages.
 * RTL-aware (uses ChevronLeft as the directional separator).
 */
export function AppBreadcrumb() {
  const location = useLocation();
  const { companies, portfolios, projects } = useStore();

  const crumbs = useMemo<Crumb[]>(() => {
    const path = location.pathname;
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return [];

    const list: Crumb[] = [{ label: 'لوحة التحكم', href: '/' }];

    // /company/:id
    if (segments[0] === 'company' && segments[1]) {
      const c = companies.find((x) => x.id === segments[1]);
      list.push({ label: c?.name ?? 'الشركة' });
      return list;
    }

    // /portfolio/:id
    if (segments[0] === 'portfolio' && segments[1]) {
      const p = portfolios.find((x) => x.id === segments[1]);
      const c = p ? companies.find((x) => x.id === p.companyId) : undefined;
      if (c) list.push({ label: c.name, href: `/company/${c.id}` });
      list.push({ label: p?.name ?? 'المحفظة' });
      return list;
    }

    // /project/:id
    if (segments[0] === 'project' && segments[1] && segments[1] !== 'new') {
      const proj = projects.find((x) => x.id === segments[1]);
      const c = proj ? companies.find((x) => x.id === proj.companyId) : undefined;
      const port = proj?.portfolioId ? portfolios.find((x) => x.id === proj.portfolioId) : undefined;
      if (c) list.push({ label: c.name, href: `/company/${c.id}` });
      if (port) list.push({ label: port.name, href: `/portfolio/${port.id}` });
      list.push({ label: proj?.name ?? 'المشروع' });
      return list;
    }

    // Other top-level pages
    const pageMap: Record<string, string> = {
      users: 'إدارة المستخدمين',
      audit: 'السجل الرئيسي',
      companies: 'الشركات',
      portfolios: 'المحافظ',
      projects: 'المشاريع',
    };
    if (pageMap[segments[0]]) {
      list.push({ label: pageMap[segments[0]] });
    }
    return list;
  }, [location.pathname, companies, portfolios, projects]);

  // Hide on root or when there's only "Dashboard"
  if (crumbs.length <= 1) return null;

  return (
    <Breadcrumb dir="rtl" className="min-w-0">
      <BreadcrumbList className="gap-1.5 text-xs sm:text-sm flex-nowrap">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem className="min-w-0">
                {isLast || !crumb.href ? (
                  <BreadcrumbPage className="font-medium truncate max-w-[160px] sm:max-w-[260px]">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={crumb.href}
                      className="text-muted-foreground hover:text-foreground truncate max-w-[120px] sm:max-w-[200px]"
                    >
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className="text-muted-foreground/50">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </BreadcrumbSeparator>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
