/**
 * The account's security page. Today that is passkeys: a door of their own
 * on the login page, and the second factor that replaces the emailed code
 * for whoever registers one. Every new key is preceded by a code sent to the
 * account's email and confirmed here. The list is
 * loaded from the edge function, never from the table directly, so the
 * browser sees labels and dates and never key material.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  confirmStepUp, deletePasskey, listPasskeys, passkeyErrorMessage, passkeysSupported, registerPasskey, sendStepUpCode,
  StepUpRequired, type PasskeySummary,
} from '@/services/passkeyService';
import { PasskeyList } from './security/PasskeyList';

export default function Security() {
  const supported = passkeysSupported();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Every new key is preceded by a code emailed to the account and confirmed here.
  const [stepUp, setStepUp] = useState(false);
  const [code, setCode] = useState('');
  // Set once a code is confirmed in this dialog: if the server still asks for
  // one, something is wrong, and mailing another would only loop.
  const [confirmed, setConfirmed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys());
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const closeDialog = () => {
    setAdding(false);
    setStepUp(false);
    setCode('');
    setConfirmed(false);
  };

  const sendCode = async () => {
    try {
      await sendStepUpCode();
      setStepUp(true);
      toast.success('أرسلنا رمز تأكيد إلى بريدك');
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('اكتب اسماً يميّز هذا المفتاح'); return; }
    setBusy(true);
    try {
      const created = await registerPasskey(name.trim());
      setPasskeys((list) => [...list, created]);
      toast.success(`تم تسجيل "${created.name}"`);
      closeDialog();
      setName('');
    } catch (e) {
      if (e instanceof StepUpRequired && !confirmed) await sendCode();
      else if (e instanceof StepUpRequired) toast.error('انتهت صلاحية التأكيد. أغلق النافذة وابدأ من جديد.');
      else toast.error(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * A correct code lets this session register one key in the next ten
   * minutes. The key is then registered by a fresh press of the button, since
   * the browser asks for the fingerprint only inside a person's own click.
   */
  const handleConfirm = async () => {
    if (!/^\d{6}$/.test(code)) { toast.error('اكتب الرمز المكوّن من ستة أرقام'); return; }
    setBusy(true);
    try {
      await confirmStepUp(code);
      setStepUp(false);
      setCode('');
      setConfirmed(true);
      toast.success('تم التأكيد. اضغط «تسجيل المفتاح» لإكمال الإضافة.');
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: PasskeySummary) => {
    try {
      await deletePasskey(p.id);
      setPasskeys((list) => list.filter((x) => x.id !== p.id));
      toast.success('تم حذف مفتاح المرور');
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl space-y-6">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            الأمان
          </h1>
          <p className="text-sm text-muted-foreground mt-1">التحقق بخطوتين لحسابك: مفتاح مرور بدل الرمز المرسل بالبريد.</p>
        </div>

        <div className="stat-card space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> مفاتيح المرور</h2>
              <p className="text-xs text-muted-foreground mt-1">
                بصمة الإصبع أو الوجه أو مفتاح أمان مادي. تدخل به مباشرة من صفحة الدخول دون كلمة مرور، أو تتحقق به بدل انتظار الرمز.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)} disabled={!supported}>
              <Plus className="w-3.5 h-3.5" /> إضافة مفتاح مرور
            </Button>
          </div>

          {!supported && (
            <p className="text-xs text-warning">هذا المتصفح لا يدعم مفاتيح المرور. جرّب متصفحاً أحدث أو جهازاً آخر.</p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">جاري التحميل...</p>
          ) : (
            <PasskeyList passkeys={passkeys} onDelete={handleDelete} />
          )}
        </div>
      </motion.div>

      <Dialog open={adding} onOpenChange={(o) => { if (!o && !busy) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة مفتاح مرور</DialogTitle></DialogHeader>
          {stepUp ? (
            <div className="space-y-2">
              <Label htmlFor="passkey-step-up">رمز التأكيد</Label>
              <Input
                id="passkey-step-up" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="000000" dir="ltr" autoFocus
              />
              <p className="text-xs text-muted-foreground">
                أرسلنا رمزاً من ستة أرقام إلى بريدك. يثبت أنك صاحب الحساب قبل إضافة مفتاح يدخل به دون كلمة مرور، ويُطلب مع كل مفتاح جديد.
              </p>
              <button type="button" onClick={sendCode} disabled={busy} className="text-xs text-primary hover:underline disabled:opacity-50">
                إعادة إرسال الرمز
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="passkey-name">اسم المفتاح</Label>
              <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: هاتفي، أو مفتاح المكتب" autoFocus />
              <p className="text-xs text-muted-foreground">سيطلب منك جهازك التأكيد بالبصمة أو الوجه أو رمز القفل.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>إلغاء</Button>
            {stepUp ? (
              <Button onClick={handleConfirm} disabled={busy}>{busy ? 'جاري التأكيد...' : 'تأكيد الرمز'}</Button>
            ) : (
              <Button onClick={handleAdd} disabled={busy}>{busy ? 'بانتظار الجهاز...' : 'تسجيل المفتاح'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
