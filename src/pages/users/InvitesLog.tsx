/**
 * The invites log: every invite grouped by email, with its status, the
 * delivery status of its email, a resend and a delete on anything not yet
 * accepted, and filters by status and by email.
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, ChevronDown, ChevronUp, Search, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Invite, InviteDeliveryStatus } from './labels';
import { countInvites, deliveryFor, filterInvites, groupByEmail, type InviteFilter } from './inviteFigures';
import { InviteStatusChips } from './InviteStatusChips';
import { InviteRow } from './InviteRow';

interface Props {
  invites: Invite[];
  /** Keyed `invite:<id>` and `email:<email>`, as the page builds it. */
  deliveryStatus: Record<string, InviteDeliveryStatus>;
  loading: boolean;
  resendingInviteId: string | null;
  onRefresh: () => void;
  onResend: (invite: Invite) => void;
  onDelete: (id: string) => void;
  scopeName: (scopeType: string, scopeId: string | null) => string;
}

export function InvitesLog({
  invites, deliveryStatus, loading, resendingInviteId, onRefresh, onResend, onDelete, scopeName,
}: Props) {
  const [invitesOpen, setInvitesOpen] = useState(true);
  const [filter, setFilter] = useState<InviteFilter>({ status: 'all', query: '' });

  const counts = useMemo(() => countInvites(invites), [invites]);
  const groups = useMemo(() => groupByEmail(filterInvites(invites, filter)), [invites, filter]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="stat-card">
      <Collapsible open={invitesOpen} onOpenChange={setInvitesOpen}>
        <div className="flex items-start gap-3">
          <CollapsibleTrigger asChild>
            <button className="flex-1 flex items-center justify-between text-right">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">سجل الدعوات</h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {counts.pending > 0 && <Badge variant="outline" className="bg-warning/10 health-warning text-xs">{counts.pending} معلّقة</Badge>}
                  {counts.sent > 0 && <Badge variant="outline" className="bg-primary/10 text-primary text-xs">{counts.sent} مرسلة</Badge>}
                  {counts.failed > 0 && <Badge variant="outline" className="bg-destructive/10 text-destructive text-xs">{counts.failed} فاشلة</Badge>}
                  {counts.accepted > 0 && <Badge variant="outline" className="bg-success/10 health-good text-xs">{counts.accepted} مقبولة</Badge>}
                  <Badge variant="outline" className="text-xs">{counts.all} إجمالي</Badge>
                </div>
              </div>
              {invitesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs shrink-0"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRefresh(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>
        <CollapsibleContent>
          <p className="text-xs text-muted-foreground mt-4 mb-3">
            ستظهر هنا حالة كل دعوة بوضوح: قيد المعالجة، تم الإرسال، مقبولة، أو فشل الإرسال. يمكن إعادة إرسال أي دعوة غير مقبولة من الزر المخصص.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 mb-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالإيميل..."
                value={filter.query}
                onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                className="pr-9 h-8 text-sm"
                dir="ltr"
              />
            </div>
            <InviteStatusChips counts={counts} value={filter.status} onChange={(status) => setFilter({ ...filter, status })} />
          </div>

          <div className="space-y-3">
            {groups.map(([email, emailInvites]) => (
              <div key={email} className="rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium" dir="ltr">{email}</span>
                    <Badge variant="outline" className="text-xs">{emailInvites.length} دعوة</Badge>
                  </div>
                </div>
                <div className="divide-y divide-border/30">
                  {emailInvites.map((invite) => (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      delivery={deliveryFor(invite, deliveryStatus)}
                      resending={resendingInviteId === invite.id}
                      onResend={onResend}
                      onDelete={onDelete}
                      scopeName={scopeName}
                    />
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد دعوات تطابق البحث</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}
