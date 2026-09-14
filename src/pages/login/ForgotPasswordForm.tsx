import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ForgotPasswordFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

/** The reset-link step: the email alone. */
export function ForgotPasswordForm({ email, onEmailChange, loading, onSubmit, onBack }: ForgotPasswordFormProps) {
  return (
    <motion.form
      key="forgot"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold text-center">استعادة كلمة المرور</h2>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">البريد الإلكتروني</Label>
        <Input id="forgot-email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="email@example.com" dir="ltr" required className="h-11" />
      </div>
      <Button type="submit" className="w-full h-11" disabled={loading}>
        {loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}
      </Button>
      <Button type="button" variant="ghost" className="w-full text-sm" onClick={onBack}>
        العودة لتسجيل الدخول
      </Button>
    </motion.form>
  );
}
