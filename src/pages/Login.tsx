import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import basserhLogo from '@/assets/basserh-logo.jpg';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
      setIsForgotPassword(false);
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <img src={basserhLogo} alt="بصيرة" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-lg" />
          <h1 className="text-2xl font-bold">رؤية</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة المحافظ والمشاريع المالية</p>
        </div>

        <div className="stat-card">
          {isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">استعادة كلمة المرور</h2>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-sm" onClick={() => setIsForgotPassword(false)}>
                العودة لتسجيل الدخول
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">تسجيل الدخول</h2>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs text-primary hover:underline">
                نسيت كلمة المرور؟
              </button>

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? 'جاري التحميل...' : (
                  <><LogIn className="w-4 h-4" /> تسجيل الدخول</>
                )}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
