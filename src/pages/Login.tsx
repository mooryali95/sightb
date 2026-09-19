import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { loginSchema } from '@/lib/validations';
import { getDeviceFingerprint } from './login/deviceFingerprint';
import { readOtpCheck, type OtpDecision } from './login/otpCheck';
import { LoginForm } from './login/LoginForm';
import { OtpForm } from './login/OtpForm';
import { ForgotPasswordForm } from './login/ForgotPasswordForm';
import { passkeysSupported, passkeyErrorMessage, verifyWithPasskey } from '@/services/passkeyService';

const RESEND_COOLDOWN_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeyOffered = passkeysSupported();

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const finalizeSuccessfulAccess = async () => {
    try {
      await supabase.functions.invoke('accept-invite', { body: {} });
    } catch (error) {
      console.error('[accept-invite]', error);
    }
    navigate('/', { replace: true });
  };

  /** Asks the server whether this device needs a code; signs out on a refusal. */
  const checkAndSendOtp = async (): Promise<OtpDecision> => {
    const fingerprint = getDeviceFingerprint();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { kind: 'error' };

    const res = await supabase.functions.invoke('admin-otp', { body: { action: 'check', fingerprint } });
    const decision = readOtpCheck(res);
    if (decision.kind === 'error') {
      console.error('[otp-check]', res.error);
      await supabase.auth.signOut();
      toast.error('حدث خطأ في التحقق. يرجى المحاولة مرة أخرى.');
    } else if (decision.kind === 'rate-limited') {
      await supabase.auth.signOut();
      toast.error(decision.message);
    }
    return decision;
  };

  const holdForOtp = () => {
    setOtpRequired(true);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
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
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;

      const decision = await checkAndSendOtp();
      switch (decision.kind) {
        case 'error':
        case 'rate-limited':
          return; // already signed out and told
        case 'no-roles':
          await supabase.auth.signOut();
          toast.error('ليس لديك صلاحية للوصول. تواصل مع مدير النظام.');
          return;
        case 'otp-sent':
          holdForOtp();
          toast.success('تم إرسال رمز التحقق إلى بريدك الإلكتروني');
          return;
        case 'otp-failed':
          holdForOtp();
          toast.warning('لم يتم إرسال الرمز. حاول "إعادة إرسال الرمز" أو تواصل مع المدير.');
          return;
        case 'ok':
          await finalizeSuccessfulAccess();
      }
    } catch (error) {
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
      const res = await supabase.functions.invoke('admin-otp', { body: { action: 'verify', code: otpCode, fingerprint } });

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
    } catch (error) {
      console.error('[otp-verify]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setOtpLoading(false);
    }
  };

  /** The passkey is the second factor instead of the code: same trust, no inbox. */
  const handleVerifyWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const result = await verifyWithPasskey(getDeviceFingerprint());
      if (result === 'no-passkeys') {
        toast.error('لا يوجد مفتاح مرور مسجّل لهذا الحساب. أدخل الرمز المرسل، ثم سجّل مفتاحاً من صفحة الأمان.');
        return;
      }
      toast.success('تم التحقق بمفتاح المرور');
      await finalizeSuccessfulAccess();
    } catch (error) {
      console.error('[passkey-verify]', error);
      toast.error(passkeyErrorMessage(error));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpLoading(true);
    try {
      const fingerprint = getDeviceFingerprint();
      const res = await supabase.functions.invoke('admin-otp', { body: { action: 'check', fingerprint } });
      if (res.error) throw res.error;
      if (res.data?.sent !== true) {
        toast.warning('تعذر إرسال الرمز حالياً');
        return;
      }
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
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
    } catch (error) {
      console.error('[forgot-password]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={basserhLogo} alt="بصيرة" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-lg" />
          <h1 className="text-2xl font-bold">رؤية</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة المحافظ والمشاريع المالية</p>
        </div>

        <div className="stat-card">
          <AnimatePresence mode="wait">
            {otpRequired ? (
              <OtpForm
                key="otp"
                code={otpCode}
                onCodeChange={setOtpCode}
                loading={otpLoading}
                resendCooldown={resendCooldown}
                onSubmit={handleVerifyOtp}
                onResend={handleResendOtp}
                onCancel={handleCancelOtp}
                onPasskey={passkeyOffered ? handleVerifyWithPasskey : undefined}
                passkeyLoading={passkeyLoading}
              />
            ) : isForgotPassword ? (
              <ForgotPasswordForm
                key="forgot"
                email={email}
                onEmailChange={setEmail}
                loading={loading}
                onSubmit={handleForgotPassword}
                onBack={() => setIsForgotPassword(false)}
              />
            ) : (
              <LoginForm
                key="login"
                email={email}
                onEmailChange={setEmail}
                password={password}
                onPasswordChange={setPassword}
                loading={loading}
                onSubmit={handleSubmit}
                onForgot={() => setIsForgotPassword(true)}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
