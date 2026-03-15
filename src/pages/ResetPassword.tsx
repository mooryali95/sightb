import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@/lib/validations';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;

    // Check for error in URL hash (e.g. expired OTP)
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const errorDesc = params.get('error_description') || 'الرابط غير صالح';
      console.warn('[reset-password] URL error:', errorDesc);
      toast.error('الرابط منتهي الصلاحية أو غير صالح. يرجى طلب رابط جديد.');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setReady(true);
      readyRef.current = true;
    } else {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setReady(true);
          readyRef.current = true;
        }
      });

      // Timeout — if no event fires in 5 seconds
      const timeout = setTimeout(() => {
        if (!readyRef.current) {
          toast.error('لم يتم التعرف على الرابط. يرجى طلب رابط جديد.');
          navigate('/login');
        }
      }, 5000);

      return () => { subscription.unsubscribe(); clearTimeout(timeout); };
    }
  }, []);

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
      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate('/', { replace: true });
    } catch (error: any) {
      console.error('[reset-password]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
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
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" required minLength={6} />
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
