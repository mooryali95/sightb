import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "next-themes";
import { SessionTimeoutWarning } from "@/components/SessionTimeoutWarning";

// Eagerly load landing/login (initial pages users see)
import Landing from "./pages/Landing";
import Login from "./pages/Login";

// Lazy load all other pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewCompany = lazy(() => import("./pages/NewCompany"));
const NewPortfolio = lazy(() => import("./pages/NewPortfolio"));
const NewProject = lazy(() => import("./pages/NewProject"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const PortfolioDetail = lazy(() => import("./pages/PortfolioDetail"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const SystemAuditLog = lazy(() => import("./pages/SystemAuditLog"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-muted-foreground">جاري التحميل...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ErrorBoundary fallbackMessage="حدث خطأ في التطبيق. يرجى إعادة تحميل الصفحة.">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/welcome" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
                  <Route path="/companies/new" element={<ProtectedRoute><NewCompany /></ProtectedRoute>} />
                  <Route path="/company/:id" element={<ProtectedRoute><ErrorBoundary><CompanyDetail /></ErrorBoundary></ProtectedRoute>} />
                  <Route path="/portfolio/new" element={<ProtectedRoute><NewPortfolio /></ProtectedRoute>} />
                  <Route path="/portfolio/:id" element={<ProtectedRoute><ErrorBoundary><PortfolioDetail /></ErrorBoundary></ProtectedRoute>} />
                  <Route path="/project/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
                  <Route path="/project/:id" element={<ProtectedRoute><ErrorBoundary><ProjectDetail /></ErrorBoundary></ProtectedRoute>} />
                  <Route path="/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
                  <Route path="/audit" element={<ProtectedRoute><SystemAuditLog /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
