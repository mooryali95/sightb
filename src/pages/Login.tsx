import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { loginSchema } from '@/lib/validations';

function getDeviceFingerprint(): string {
  const key = 'rouya_device_fp';
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const finalizeSuccessfulAccess = async () => {
    try {
      await supabase.functions.invoke('accept-invite', {
        body: {},
      });
    } catch (error) {
      console.error('[accept-invite]', error);
    }

    navigate('/', { replace: true });
  };

  const checkAndSendOtp = async (): Promise<string> => {
    const fingerprint = getDeviceFingerprint();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'error';

    const res = await supabase.functions.invoke('admin-otp', {
      body: { action: 'check', fingerprint },
    });

    if (res.error) {
      console.error('[otp-check]', res.error);
      await supabase.auth.signOut();
      toast.error('حدث خطأ في التحقق. يرجى المحاولة مرة أخرى.');
      return 'error';
    }

    if (res.data?.rateLimited) {
      await supabase.auth.signOut();
      toast.error(res.data?.error || 'تم تجاوز الحد الأقصى للمحاولات');
      return 'error';
    }

    if (res.data?.noRoles) {
      return 'no-roles';
    }

    if (res.data?.requiresOtp === true) {
      return res.data?.sent === true ? 'otp-sent' : 'otp-failed';
    }

    return 'ok';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = loginSchema.safeParse({ email: email.trim(), password });
    if (!validation.success) {
      toast.error(validation.error.errors[0]?.message || 'بيانات غير صالحة');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // Check if OTP is required (admin on untrusted device)
      const otpResult = await checkAndSendOtp();
      if (otpResult === 'error') {
        // Already signed out and error shown
        return;
      }
      if (otpResult === 'no-roles') {
        // User has no roles — sign out and show message
        await supabase.auth.signOut();
        toast.error('ليس لديك صلاحية للوصول. تواصل مع مدير النظام.');
        return;
      }
      if (otpResult === 'otp-sent') {
        setOtpRequired(true);
        setResendCooldown(60);
        toast.success('تم إرسال رمز التحقق إلى بريدك الإلكتروني');
      } else if (otpResult === 'otp-failed') {
        setOtpRequired(true);
        setResendCooldown(60);
        toast.warning('لم يتم إرسال الرمز. حاول "إعادة إرسال الرمز" أو تواصل مع المدير.');
      } else {
        await finalizeSuccessfulAccess();
      }
    } catch (error: any) {
      console.error('[login]', error);
      toast.error('بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setOtpLoading(true);
    try {
      const fingerprint = getDeviceFingerprint();
      const res = await supabase.functions.invoke('admin-otp', {
        body: { action: 'verify', code: otpCode, fingerprint },
      });

      if (res.data?.rateLimited) {
        await supabase.auth.signOut();
        setOtpRequired(false);
        toast.error(res.data?.error || 'تم تجاوز الحد الأقصى للمحاولات');
        return;
      }

      if (res.error || !res.data?.verified) {
        toast.error(res.data?.error || 'الرمز غير صحيح');
        setOtpCode('');
        return;
      }

      toast.success('تم التحقق بنجاح');
      await finalizeSuccessfulAccess();
    } catch (error: any) {
      console.error('[otp-verify]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpLoading(true);
    try {
      const fingerprint = getDeviceFingerprint();
      const res = await supabase.functions.invoke('admin-otp', {
        body: { action: 'check', fingerprint },
      });

      if (res.error) {
        throw res.error;
      }

      if (res.data?.sent !== true) {
        toast.warning('تعذر إرسال الرمز حالياً');
        return;
      }

      setResendCooldown(60);
      setOtpCode('');
      toast.success('تم إرسال رمز جديد');
    } catch (error) {
      console.error('[otp-resend]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCancelOtp = async () => {
    await supabase.auth.signOut();
    setOtpRequired(false);
    setOtpCode('');
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
      console.error('[forgot-password]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
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
          <AnimatePresence mode="wait">
            {otpRequired ? (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyOtp}
                className="space-y-5"
              >
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">التحقق بخطوتين</h2>
                  <p className="text-sm text-muted-foreground">أدخل الرمز المرسل إلى بريدك الإلكتروني</p>
                </div>

                <div className="flex justify-center" dir="ltr">
                  <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button type="submit" className="w-full gap-2" disabled={otpLoading || otpCode.length !== 6}>
                  {otpLoading ? 'جاري التحقق...' : (
                    <><ShieldCheck className="w-4 h-4" /> تأكيد الرمز</>
                  )}
                </Button>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || otpLoading}
                    className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}ث)` : 'إعادة إرسال الرمز'}
                  </button>
                  <button type="button" onClick={handleCancelOtp} className="text-xs text-muted-foreground hover:underline">
                    إلغاء
                  </button>
                </div>
              </motion.form>
            ) : isForgotPassword ? (
              <motion.form
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleForgotPassword}
                className="space-y-4"
              >
                <h2 className="text-lg font-semibold text-center">استعادة كلمة المرور</h2>
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">البريد الإلكتروني</Label>
                  <Input id="forgot-email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" required className="h-11" />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}
                </Button>
                <Button type="button" variant="ghost" className="w-full text-sm" onClick={() => setIsForgotPassword(false)}>
                  العودة لتسجيل الدخول
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <h2 className="text-lg font-semibold text-center">تسجيل الدخول</h2>
                <div className="space-y-2">
                  <Label htmlFor="login-email">البريد الإلكتروني</Label>
                  <Input id="login-email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" required className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      required
                      minLength={6}
                      className="h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="button" onClick={() => setIsForgotPassword(true)} className="text-xs text-primary hover:underline">
                  نسيت كلمة المرور؟
                </button>

                <Button type="submit" className="w-full h-11 gap-2" disabled={loading}>
                  {loading ? 'جاري التحميل...' : (
                    <><LogIn className="w-4 h-4" /> تسجيل الدخول</>
                  )}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
