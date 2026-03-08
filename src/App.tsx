import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import NewCompany from "./pages/NewCompany";
import NewPortfolio from "./pages/NewPortfolio";
import NewProject from "./pages/NewProject";
import ProjectDetail from "./pages/ProjectDetail";
import PortfolioDetail from "./pages/PortfolioDetail";
import CompanyDetail from "./pages/CompanyDetail";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary fallbackMessage="حدث خطأ في التطبيق. يرجى إعادة تحميل الصفحة.">
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
