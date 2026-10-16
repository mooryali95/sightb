/**
 * One import() per page, shared by React.lazy and the preloader, so a page
 * fetched ahead of time is the very chunk the router renders.
 */
const loaders = {
  dashboard: () => import('../pages/Dashboard'),
  newCompany: () => import('../pages/NewCompany'),
  newPortfolio: () => import('../pages/NewPortfolio'),
  newProject: () => import('../pages/NewProject'),
  project: () => import('../pages/ProjectDetail'),
  portfolio: () => import('../pages/PortfolioDetail'),
  company: () => import('../pages/CompanyDetail'),
  resetPassword: () => import('../pages/ResetPassword'),
  users: () => import('../pages/UserManagement'),
  security: () => import('../pages/Security'),
  audit: () => import('../pages/SystemAuditLog'),
  alerts: () => import('../pages/AlertsCenter'),
  notFound: () => import('../pages/NotFound'),
  mobileExpense: () => import('../pages/MobileExpenseCapture'),
  controlCenter: () => import('../pages/ControlCenter'),
  organize: () => import('../pages/Organize'),
};
export type PageKey = keyof typeof loaders;
export const pageLoaders = loaders;

const started = new Set<PageKey>();
export function preloadPage(key: PageKey): void {
  if (started.has(key)) return;
  started.add(key);
  loaders[key]().catch(() => started.delete(key));
}

/** Which page a path opens, for preloading on hover. */
export function pageForPath(path: string): PageKey | null {
  if (path === '/') return 'dashboard';
  if (path.startsWith('/project/new')) return 'newProject';
  if (path.startsWith('/project/')) return 'project';
  if (path.startsWith('/portfolio/new')) return 'newPortfolio';
  if (path.startsWith('/portfolio/')) return 'portfolio';
  if (path.startsWith('/companies/new')) return 'newCompany';
  if (path.startsWith('/company/')) return 'company';
  if (path === '/users') return 'users';
  if (path === '/security') return 'security';
  if (path === '/audit') return 'audit';
  if (path === '/alerts') return 'alerts';
  if (path === '/control-center') return 'controlCenter';
  if (path === '/organize') return 'organize';
  return null;
}

/** The pages most visits reach, fetched once the browser is idle after sign-in. */
const MAIN: PageKey[] = ['dashboard', 'project', 'portfolio', 'company', 'alerts', 'security'];
export function preloadMainPagesWhenIdle(): void {
  const run = () => MAIN.forEach(preloadPage);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run); else setTimeout(run, 1500);
}
