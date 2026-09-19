import { motion } from 'framer-motion';
import { ShieldCheck, RefreshCw, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

interface OtpFormProps {
  code: string;
  onCodeChange: (code: string) => void;
  loading: boolean;
  resendCooldown: number;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onCancel: () => void;
  /** Offered when the browser can run a passkey ceremony; absent otherwise. */
  onPasskey?: () => void;
  passkeyLoading?: boolean;
}

/** The one-time code step: six digits, a resend with its cooldown, a passkey instead when one is offered, and a way back. */
export function OtpForm({ code, onCodeChange, loading, resendCooldown, onSubmit, onResend, onCancel, onPasskey, passkeyLoading = false }: OtpFormProps) {
  return (
    <motion.form
      key="otp"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onSubmit={onSubmit}
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
        <InputOTP maxLength={6} value={code} onChange={onCodeChange} autoFocus>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button type="submit" className="w-full gap-2" disabled={loading || code.length !== 6}>
        {loading ? 'جاري التحقق...' : <><ShieldCheck className="w-4 h-4" /> تأكيد الرمز</>}
      </Button>

      {onPasskey && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />أو<span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={onPasskey} disabled={loading || passkeyLoading}>
            <Fingerprint className="w-4 h-4" />
            {passkeyLoading ? 'بانتظار مفتاح المرور...' : 'التحقق بمفتاح المرور'}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onResend}
          disabled={resendCooldown > 0 || loading}
          className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}ث)` : 'إعادة إرسال الرمز'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
          إلغاء
        </button>
      </div>
    </motion.form>
  );
}
