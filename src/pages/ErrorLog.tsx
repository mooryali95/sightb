import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Bug, ChevronDown } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { useRole } from '@/hooks/useRole';
import { listClientErrors } from '@/services/errorReportService';
import { countAr } from '@/lib/plural';
import { groupErrors, recentCount, type ErrorGroup } from './errors/groupErrors';

const when = (iso: string) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/**
 * The errors people met in their browsers, one card per bug, newest first.
 * Owner only: the rows can hold page paths and fragments of what was on screen.
 */
export default function ErrorLog() {
  const { isOwner, loading: roleLoading } = useRole();
  const [groups, setGroups] = useState<ErrorGroup[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isOwner || roleLoading) return;
    let cancelled = false;
    listClientErrors()
      .then((rows) => { if (!cancelled) setGroups(groupErrors(rows)); })
      .catch(() => { if (!cancelled) { setFailed(true); setGroups([]); } });
    return () => { cancelled = true; };
  }, [isOwner, roleLoading]);

  const recent = useMemo(() => recentCount(groups ?? []), [groups]);

  if (roleLoading) return null;
  if (!isOwner) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bug className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">سجل الأعطال</h1>
            <p className="text-sm text-muted-foreground">الأخطاء التي واجهها المستخدمون في المتصفح، تُحفظ 90 يوماً</p>
          </div>
        </div>

        {groups === null ? (
          <div className="flex justify-center py-12" role="status" aria-label="جارٍ التحميل">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : failed ? (
          <p className="text-sm text-destructive">تعذّر تحميل سجل الأعطال.</p>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p className="text-sm">لم يُسجَّل أي عطل.</p>
          </div>
        ) : (
          <>
            <p className="text-sm" aria-live="polite">
              {recent > 0 ? `${countAr(recent, 'item')} ظهرت خلال آخر 24 ساعة.` : 'لا أعطال جديدة خلال آخر 24 ساعة.'}
            </p>
            <ul className="space-y-3">
              {groups.map((g) => <ErrorCard key={g.key} group={g} />)}
            </ul>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ErrorCard({ group: g }: { group: ErrorGroup }) {
  const stack = typeof g.sample.context.stack === 'string' ? g.sample.context.stack
    : typeof g.sample.context.componentStack === 'string' ? g.sample.context.componentStack : '';
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <details className="group">
        <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium break-words">{g.message}</p>
            <p className="text-xs text-muted-foreground">
              {g.scope} · {countAr(g.occurrences, 'time')} · {countAr(g.people, 'person')} · آخر ظهور {when(g.lastSeen)}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 shrink-0 mt-1 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-2 text-xs">
          <p>أول ظهور: {when(g.firstSeen)}</p>
          {g.paths.length > 0 && <p>الصفحات: <bdi dir="ltr">{g.paths.join('  ')}</bdi></p>}
          {g.sample.release && <p>الإصدار: <bdi dir="ltr">{g.sample.release}</bdi></p>}
          {g.sample.userAgent && <p className="text-muted-foreground break-all"><bdi dir="ltr">{g.sample.userAgent}</bdi></p>}
          {stack && <pre dir="ltr" className="overflow-x-auto rounded-md bg-muted p-3 text-start whitespace-pre-wrap">{stack}</pre>}
        </div>
      </details>
    </li>
  );
}
