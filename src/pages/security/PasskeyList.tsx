/**
 * The user's registered passkeys: what each one is, whether it signs in on
 * its own, when it was made and last used, and a confirmed way to remove it.
 * Adding is the page's job.
 */
import { KeyRound, Cloud, Smartphone } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import type { PasskeySummary } from '@/services/passkeyService';

interface Props {
  passkeys: PasskeySummary[];
  onDelete: (passkey: PasskeySummary) => Promise<void>;
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'لم يُستخدم بعد');

function passkeyKindLabel(p: PasskeySummary): string {
  if (p.backedUp) return 'مفتاح مزامَن عبر أجهزتك';
  return p.deviceType === 'singleDevice' ? 'مفتاح على هذا الجهاز فقط' : 'مفتاح مرور';
}

/**
 * Whether the key signs in on its own, and what to do when it does not: an
 * older key is replaced by adding a new one from the same device; a key whose
 * authenticator cannot keep the account never will, so nothing is advised.
 * Nothing is said while the server cannot tell.
 */
function SignInNote({ passkey: p }: { passkey: PasskeySummary }) {
  if (p.canSignIn === null) return null;
  if (p.canSignIn) return <p className="text-xs text-success">يصلح للدخول دون كلمة مرور</p>;
  if (p.discoverable === false) {
    return <p className="text-xs text-muted-foreground">للتحقق فقط: هذا المفتاح لا يحفظ الحساب ليدخل به وحده.</p>;
  }
  return (
    <p className="text-xs text-warning">
      للتحقق فقط. أضف مفتاحاً جديداً من الجهاز نفسه لتدخل به دون كلمة مرور، ثم احذف هذا.
    </p>
  );
}

export function PasskeyList({ passkeys, onDelete }: Props) {
  if (passkeys.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
        <KeyRound className="w-8 h-8 mx-auto opacity-40" />
        <p>لا توجد مفاتيح مرور مسجّلة. أضف واحداً لتدخل ببصمتك دون كلمة مرور.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {passkeys.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {p.backedUp ? <Cloud className="w-4 h-4 text-primary" /> : <Smartphone className="w-4 h-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {passkeyKindLabel(p)} · أُضيف {formatDate(p.createdAt)} · آخر استخدام: {formatDate(p.lastUsedAt)}
            </p>
            <SignInNote passkey={p} />
          </div>
          <ConfirmDeleteDialog
            title="حذف مفتاح المرور"
            description={`سيتوقف "${p.name}" عن العمل فوراً. يمكنك تسجيل مفتاح جديد في أي وقت.`}
            onConfirm={() => onDelete(p)}
          />
        </li>
      ))}
    </ul>
  );
}
