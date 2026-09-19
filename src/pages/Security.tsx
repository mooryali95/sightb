/**
 * The account's security page. Today that is passkeys: the second factor
 * that replaces the emailed code for whoever registers one. The list is
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
  deletePasskey, listPasskeys, passkeyErrorMessage, passkeysSupported, registerPasskey, type PasskeySummary,
} from '@/services/passkeyService';
import { PasskeyList } from './security/PasskeyList';

export default function Security() {
  const supported = passkeysSupported();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('اكتب اسماً يميّز هذا المفتاح'); return; }
    setBusy(true);
    try {
      const created = await registerPasskey(name.trim());
      setPasskeys((list) => [...list, created]);
      toast.success(`تم تسجيل "${created.name}"`);
      setAdding(false);
      setName('');
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
                بصمة الإصبع أو الوجه أو مفتاح أمان مادي. عند تسجيل الدخول من جهاز جديد يمكنك التحقق به بدل انتظار الرمز.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)} disabled={!supported}>
              <Plus className="w-3.5 h-3.5" /> إضافة مفتاح مرور
            </Button>
          </div>

          {!supported && (
            <p className="text-xs text-amber-700 dark:text-amber-400">هذا المتصفح لا يدعم مفاتيح المرور. جرّب متصفحاً أحدث أو جهازاً آخر.</p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">جاري التحميل...</p>
          ) : (
            <PasskeyList passkeys={passkeys} onDelete={handleDelete} />
          )}
        </div>
      </motion.div>

      <Dialog open={adding} onOpenChange={(o) => { if (!o && !busy) setAdding(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة مفتاح مرور</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="passkey-name">اسم المفتاح</Label>
            <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: هاتفي، أو مفتاح المكتب" autoFocus />
            <p className="text-xs text-muted-foreground">سيطلب منك جهازك التأكيد بالبصمة أو الوجه أو رمز القفل.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={busy}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={busy}>{busy ? 'بانتظار الجهاز...' : 'تسجيل المفتاح'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
