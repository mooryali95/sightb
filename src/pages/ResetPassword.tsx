import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@/lib/validations';

function getResetPasswordErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';

  if (!message) return 'حدث خطأ، يرجى المحاولة مرة أخرى';
  if (message.includes('Auth session missing') || message.includes('session_not_found')) {
    return 'انتهت جلسة الدعوة أو الاستعادة. افتح الرابط من البريد مرة أخرى.';
  }
  if (message.includes('same password')) {
    return 'اختر كلمة مرور جديدة مختلفة عن الحالية.';
  }

  return message;
}

function clearRecoveryUrl() {
  const cleanUrl = `${window.location.origin}/reset-password`;
  window.history.replaceState({}, document.title, cleanUrl);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;

    const markReady = () => {
      if (!mounted) return;
      setReady(true);
      readyRef.current = true;
      clearRecoveryUrl();
    };

    const redirectToLogin = (message: string) => {
      toast.error(message);
      window.setTimeout(() => {
        if (mounted) navigate('/login', { replace: true });
      }, 2500);
    };

    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    if (hashParams.get('error')) {
      const errorDesc = hashParams.get('error_description') || 'الرابط غير صالح';
      console.warn('[reset-password] URL error:', errorDesc);
      redirectToLogin('الرابط منتهي الصلاحية أو غير صالح. يرجى طلب رابط جديد.');
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      const incomingType = searchParams.get('type') || hashParams.get('type');
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && incomingType === 'recovery')) {
        markReady();
      }
    });

    const initializeRecovery = async () => {
      try {
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const code = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash');
        const type = searchParams.get('type') || hashParams.get('type');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;
          markReady();
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          markReady();
          return;
        }

        if (tokenHash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          if (error) throw error;
          markReady();
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (type === 'recovery' && session) {
          markReady();
          return;
        }

        timeoutId = window.setTimeout(() => {
          if (!readyRef.current) {
            redirectToLogin('لم يتم التعرف على رابط الدعوة أو الاستعادة. يرجى طلب رابط جديد.');
          }
        }, 5000);
      } catch (error) {
        console.error('[reset-password:init]', error);
        redirectToLogin(getResetPasswordErrorMessage(error));
      }
    };

    void initializeRecovery();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = resetPasswordSchema.safeParse({ password });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'بيانات غير صالحة');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      try {
        await supabase.functions.invoke('accept-invite', { body: {} });
      } catch (acceptInviteError) {
        console.error('[reset-password:accept-invite]', acceptInviteError);
      }

      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate('/', { replace: true });
    } catch (error) {
      console.error('[reset-password]', error);
      toast.error(getResetPasswordErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">جاري التحقق من الرابط...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="stat-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-semibold text-center">تعيين كلمة مرور جديدة</h2>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" required minLength={6} className="h-11" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
