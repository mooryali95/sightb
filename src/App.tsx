import { lazy, Suspense, type ReactNode } from "react";
import { Seo } from '@/components/Seo';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, queryPersister, CACHE_MAX_AGE, CACHE_BUSTER, shouldPersistQuery } from "@/lib/query-cache";
import { pageLoaders } from "@/lib/route-preload";
import { HoverPreload } from "@/components/HoverPreload";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "next-themes";
import { LazyMotion } from "framer-motion";
import { SessionTimeoutWarning } from "@/components/SessionTimeoutWarning";
import { useCoreData } from "@/hooks/useAppData";

// Eagerly load landing/login (initial pages users see)
import Landing from "./pages/Landing";
import Login from "./pages/Login";

// Lazy load all other pages
const Dashboard = lazy(pageLoaders.dashboard);
const NewCompany = lazy(pageLoaders.newCompany);
const NewPortfolio = lazy(pageLoaders.newPortfolio);
const NewProject = lazy(pageLoaders.newProject);
const ProjectDetail = lazy(pageLoaders.project);
const PortfolioDetail = lazy(pageLoaders.portfolio);
const CompanyDetail = lazy(pageLoaders.company);
const ResetPassword = lazy(pageLoaders.resetPassword);
const UserManagement = lazy(pageLoaders.users);
const Security = lazy(pageLoaders.security);
const SystemAuditLog = lazy(pageLoaders.audit);
const AlertsCenter = lazy(pageLoaders.alerts);
const NotFound = lazy(pageLoaders.notFound);
const MobileExpenseCapture = lazy(pageLoaders.mobileExpense);
const ControlCenter = lazy(pageLoaders.controlCenter);
const FinancialOverview = lazy(pageLoaders.finance);
const Organize = lazy(pageLoaders.organize);


function AppBootstrap({ children }: { children: ReactNode }) {
  // React Query dedupes this with every page-level useCoreData() call.
  useCoreData();
  return <>{children}</>;
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-muted-foreground">جاري التحميل...</p>
    </div>
  </div>
);

// The animation engine arrives in its own chunk when a page first animates;
// the landing and login pages use the light `m` components, so the first
// download carries none of it. Pages still using `motion` bring their own.
const loadMotionFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

const App = () => (
  <LazyMotion features={loadMotionFeatures}>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: CACHE_MAX_AGE, buster: CACHE_BUSTER, dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery, shouldDehydrateMutation: () => false } }}>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <SessionTimeoutWarning />
            <BrowserRouter>
              <Seo />
              <HoverPreload />
              <AppBootstrap>
                <ErrorBoundary fallbackMessage="حدث خطأ في التطبيق. يرجى إعادة تحميل الصفحة.">

                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/welcome" element={<Landing />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/login/code" element={<Login />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/" element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/companies/new" element={<ProtectedRoute><NewCompany /></ProtectedRoute>} />
                      <Route path="/company/:id" element={<ProtectedRoute><ErrorBoundary><CompanyDetail /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/portfolio/new" element={<ProtectedRoute><NewPortfolio /></ProtectedRoute>} />
                      <Route path="/portfolio/:id" element={<ProtectedRoute><ErrorBoundary><PortfolioDetail /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/project/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
                      <Route path="/project/:id" element={<ProtectedRoute><ErrorBoundary><ProjectDetail /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
                      <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
                      <Route path="/alerts" element={<ProtectedRoute><ErrorBoundary><AlertsCenter /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/audit" element={<ProtectedRoute><SystemAuditLog /></ProtectedRoute>} />
                      <Route path="/finance" element={<ProtectedRoute><FinancialOverview /></ProtectedRoute>} />
                      <Route path="/control-center" element={<ProtectedRoute><ControlCenter /></ProtectedRoute>} />
                      <Route path="/organize" element={<ProtectedRoute><ErrorBoundary><Organize /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/m/expense/new" element={<ProtectedRoute><ErrorBoundary><MobileExpenseCapture /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </AppBootstrap>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </LazyMotion>
);

export default App;
