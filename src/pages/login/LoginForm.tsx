import { useState } from 'react';
import { m } from 'framer-motion';
import { Eye, EyeOff, Fingerprint, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
  /** Signing in with a passkey alone; absent where the browser cannot. */
  onPasskey?: () => void;
  passkeyLoading?: boolean;
}

/** The password step, with the password shown on request, and the passkey door beside it. */
export function LoginForm({ email, onEmailChange, password, onPasswordChange, loading, onSubmit, onForgot, onPasskey, passkeyLoading = false }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <m.form
      key="login"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold text-center">تسجيل الدخول</h2>
      <div className="space-y-2">
        <Label htmlFor="login-email">البريد الإلكتروني</Label>
        <Input id="login-email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="email@example.com" dir="ltr" required className="h-11" />
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
            onChange={(e) => onPasswordChange(e.target.value)}
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

      <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">
        نسيت كلمة المرور؟
      </button>

      <Button type="submit" className="w-full h-11 gap-2" disabled={loading || passkeyLoading}>
        {loading ? 'جاري التحميل...' : <><LogIn className="w-4 h-4" /> تسجيل الدخول</>}
      </Button>

      {onPasskey && (
        <>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />أو<span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full h-11 gap-2" onClick={onPasskey} disabled={loading || passkeyLoading}>
            <Fingerprint className="w-4 h-4" />
            {passkeyLoading ? 'بانتظار مفتاح المرور...' : 'الدخول بمفتاح المرور'}
          </Button>
        </>
      )}
    </m.form>
  );
}
