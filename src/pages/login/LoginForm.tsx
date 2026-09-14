import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn } from 'lucide-react';
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
}

/** The password step, with the password shown on request. */
export function LoginForm({ email, onEmailChange, password, onPasswordChange, loading, onSubmit, onForgot }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <motion.form
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

      <Button type="submit" className="w-full h-11 gap-2" disabled={loading}>
        {loading ? 'جاري التحميل...' : <><LogIn className="w-4 h-4" /> تسجيل الدخول</>}
      </Button>
    </motion.form>
  );
}
