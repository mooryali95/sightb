import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { roles, loading: roleLoading } = useRole();

  const loading = authLoading || roleLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/welcome" replace />;
  }

  // User is authenticated but has no roles — not authorized
  if (roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <span className="text-2xl">🚫</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">غير مصرح بالدخول</h2>
          <p className="text-muted-foreground text-sm">
            ليس لديك صلاحية للوصول إلى النظام. يرجى التواصل مع مدير النظام للحصول على دعوة.
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-primary hover:underline"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
