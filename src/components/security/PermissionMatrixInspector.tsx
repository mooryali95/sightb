/**
 * PermissionMatrixInspector
 * ---------------------------------------------------------------
 * "لماذا سُمح / لماذا مُنع؟" لأي مرفق.
 *
 * تعرض مصفوفة القواعد كما ينفّذها الخادم بالضبط (دالة
 * `explain_attachment_access`) بدل إعادة تنفيذ المنطق في الواجهة —
 * فلا يمكن أن تختلف الشاشة عن سياسة التخزين الفعلية.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ShieldCheck, ShieldX, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  explainAttachmentAccess,
  REASON_LABELS,
  type AttachmentAccessExplanation,
} from '@/services/securityService';

const SOURCE_LABELS: Record<string, string> = {
  expenses: 'إيصال مصروف',
  resource_reimbursements: 'مستحق مورد/مورّد',
  payment_requests: 'مرفق طلب دفع',
  fund_settlements: 'مرفق تسوية دفعة',
};

export function PermissionMatrixInspector() {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AttachmentAccessExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await explainAttachmentAccess(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الفحص.');
    }
    setLoading(false);
  };

  const allowed = result?.decision === 'allow';

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground">مفتش مصفوفة الصلاحيات — المرفقات</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        الصق مسار الملف داخل مخزن الإيصالات (مثال:
        <code className="mx-1 px-1 bg-muted rounded text-[11px] direction-ltr">uid/1734…​.jpg</code>)
        لعرض القاعدة التي سمحت أو منعت الوصول، والسجل والمشروع المالك له.
      </p>

      <div className="space-y-2">
        <Label htmlFor="attachment-path" className="text-xs">مسار المرفق</Label>
        <div className="flex gap-2">
          <Input
            id="attachment-path"
            dir="ltr"
            value={path}
            placeholder="user-id/1734567890.jpg"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <Button onClick={run} disabled={loading || !path.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="hidden sm:inline mr-1.5">فحص</span>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-3 flex items-start gap-3 ${
              allowed
                ? 'border-success/40 bg-success/5'
                : 'border-destructive/40 bg-destructive/5'
            }`}
          >
            {allowed ? (
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : (
              <ShieldX className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {allowed ? 'الوصول مسموح' : 'الوصول مرفوض'}
              </p>
              <p className="text-xs text-muted-foreground">
                {REASON_LABELS[result.reason] ?? result.reason}
              </p>
            </div>
          </div>

          {result.subject && (
            <div className="text-xs space-y-1.5">
              <p className="text-muted-foreground">
                الأدوار المحسوبة للمستخدم الحالي
                {result.subject.is_system_admin && (
                  <Badge variant="outline" className="mr-2 text-[10px]">مدير نظام</Badge>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.subject.roles.length === 0 && (
                  <span className="text-muted-foreground">لا توجد أدوار</span>
                )}
                {result.subject.roles.map((r, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {r.role} · {r.scope_type}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {(result.matches ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              لا يوجد سجل مرتبط بهذا المسار — أي طلب عليه سيُرفض لأن السياسة تشترط سجلاً فعلياً.
            </p>
          ) : (
            <div className="space-y-3">
              {(result.matches ?? []).map((m, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {SOURCE_LABELS[m.source] ?? m.source}
                    </Badge>
                    <span className="text-muted-foreground">
                      {m.project_name ?? 'مشروع غير مرئي لك'}
                    </span>
                    {m.is_record_owner && (
                      <Badge variant="secondary" className="text-[10px]">أنت منشئ السجل</Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] mr-auto ${
                        m.decision === 'allow'
                          ? 'border-success/50 text-success'
                          : 'border-destructive/50 text-destructive'
                      }`}
                    >
                      {m.decision === 'allow' ? 'مسموح' : 'مرفوض'}
                    </Badge>
                  </div>
                  <ul className="divide-y divide-border">
                    {m.checks.map((c) => (
                      <li key={c.rule} className="flex items-start gap-2 px-3 py-2 text-xs">
                        {c.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div>
                          <code className="text-[11px]" dir="ltr">{c.rule}</code>
                          <p className="text-muted-foreground">{c.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
