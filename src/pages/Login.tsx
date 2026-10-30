import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { m, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import basserhLogo from '@/assets/basserh-logo.jpg';
import { getDeviceFingerprint } from './login/deviceFingerprint';
import { readOtpCheck, type OtpDecision } from './login/otpCheck';
import { LoginForm } from './login/LoginForm';
import { OtpForm } from './login/OtpForm';
import { ForgotPasswordForm } from './login/ForgotPasswordForm';
import { passkeysSupported, passkeyErrorMessage, signInWithPasskey, verifyWithPasskey } from '@/services/passkeyService';
import { checkSecondFactor, verifySecondFactor } from '@/services/secondFactorService';

const RESEND_COOLDOWN_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isCodeRoute = location.pathname === '/login/code';
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
  const [resumingCode, setResumingCode] = useState(isCodeRoute);
  const switchingAccount = useRef(false);
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
    // Anything read before the second factor passed may be empty (the
    // database refuses such a session), and would be served from cache.
    await queryClient.invalidateQueries();
    navigate('/', { replace: true });
  };

  /** Asks the server whether this device needs a code; signs out on a refusal. */
  const checkAndSendOtp = async (): Promise<OtpDecision> => {
    const fingerprint = getDeviceFingerprint();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { kind: 'error' };

    const res = await checkSecondFactor(fingerprint);
    const decision = readOtpCheck(res);
    if (decision.kind === 'error') {
      console.error('[otp-check]', res.error);
      await supabase.auth.signOut({ scope: 'local' });
      toast.error(res.data?.error || 'حدث خطأ في التحقق. يرجى المحاولة مرة أخرى.');
      navigate('/login', { replace: true });
    } else if (decision.kind === 'rate-limited') {
      await supabase.auth.signOut({ scope: 'local' });
      toast.error(decision.message);
      navigate('/login', { replace: true });
    }
    return decision;
  };

  const holdForOtp = () => {
    setOtpRequired(true);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (!isCodeRoute) navigate('/login/code', { replace: true });
  };

  /** After any sign-in, the server says whether this session still owes a code. */
  const proceedAfterSignIn = async () => {
    const decision = await checkAndSendOtp();
    switch (decision.kind) {
      case 'error':
      case 'rate-limited':
        return; // already signed out and told
      case 'no-roles':
        await supabase.auth.signOut({ scope: 'local' });
        toast.error('ليس لديك صلاحية للوصول. تواصل مع مدير النظام.');
        navigate('/login', { replace: true });
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
  };

  // The code has its own route. Never flash the password form while the
  // browser restores the authenticated session that still owes its code.
  const resumeRun = useRef(0);
  useEffect(() => {
    if (!isCodeRoute) {
      switchingAccount.current = false;
      setResumingCode(false);
      return;
    }
    if (switchingAccount.current) return;
    // A password sign-in already established the session and opened the form;
    // changing to the dedicated URL must not send a second code.
    if (otpRequired) {
      setResumingCode(false);
      return;
    }
    const run = ++resumeRun.current;
    setResumingCode(true);
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (run !== resumeRun.current) return;
      if (!session) {
        toast.error('انتهت جلسة الدخول. أدخل البريد وكلمة المرور من جديد.');
        navigate('/login', { replace: true });
        return;
      }
      await proceedAfterSignIn();
      if (run === resumeRun.current) setResumingCode(false);
    })();
    return () => { resumeRun.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route changes alone restart restoration
  }, [isCodeRoute, navigate, otpRequired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Loaded on submit: zod is 52 KB the login page would otherwise download
    // before anyone has typed anything.
    const { loginSchema } = await import('@/lib/validations');
    const validation = loginSchema.safeParse({ email: email.trim(), password });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message || 'بيانات غير صالحة');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await proceedAfterSignIn();
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
      const res = await verifySecondFactor(otpCode, getDeviceFingerprint());

      if (res.rateLimited) {
        await supabase.auth.signOut({ scope: 'local' });
        setOtpRequired(false);
        toast.error(res.error || 'تم تجاوز الحد الأقصى للمحاولات');
        navigate('/login', { replace: true });
        return;
      }
      if (!res.verified) {
        toast.error(res.error || 'الرمز غير صحيح');
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

  /**
   * The passkey alone: no email, no password. The device verifies the person,
   * which with the device itself is two factors, so no code follows.
   */
  const handleSignInWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      await signInWithPasskey(getDeviceFingerprint());
      toast.success('تم الدخول بمفتاح المرور');
      // The sign-in trusted this device; the check records the new session.
      await proceedAfterSignIn();
    } catch (error) {
      console.error('[passkey-login]', error);
      toast.error(passkeyErrorMessage(error, 'sign-in'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpLoading(true);
    try {
      const res = await checkSecondFactor(getDeviceFingerprint(), true);
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
    switchingAccount.current = true;
    await supabase.auth.signOut({ scope: 'local' });
    setOtpRequired(false);
    setOtpCode('');
    navigate('/login', { replace: true });
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
      // A reset link was sent in the last minute, or a passkey sign-in just
      // used the same one-time slot; the platform refuses a new one until then.
      const status = (error as { status?: number } | null)?.status;
      toast.error(status === 429 ? 'طُلب رابط قبل قليل. انتظر دقيقة ثم أعد الطلب.' : 'حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={basserhLogo} alt="بصيرة" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-lg" />
          <h1 className="text-2xl font-bold">رؤية</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة المحافظ والمشاريع المالية</p>
        </div>

        <div className="stat-card">
          <AnimatePresence mode="wait">
            {resumingCode && !otpRequired ? (
              <div key="resuming-code" role="status" className="py-10 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-medium">جاري تجهيز التحقق الآمن…</p>
                <p className="text-xs text-muted-foreground">لن تحتاج إلى إدخال كلمة المرور مرة أخرى</p>
              </div>
            ) : otpRequired || isCodeRoute ? (
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
                onPasskey={passkeyOffered ? handleSignInWithPasskey : undefined}
                passkeyLoading={passkeyLoading}
              />
            )}
          </AnimatePresence>
        </div>
      </m.div>
    </div>
  );
}
