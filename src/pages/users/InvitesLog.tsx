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
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  roleLabels, scopeLabels, inviteStatusConfig, deliveryStatusConfig, formatDate,
  type Invite, type InviteDeliveryStatus,
} from './labels';

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
  const [inviteStatusFilter, setInviteStatusFilter] = useState<string>('all');
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');

  // Group invites by email, deduplicated
  const groupedInvites = useMemo(() => {
    let filtered = invites;
    if (inviteStatusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === inviteStatusFilter);
    }
    if (inviteSearchQuery.trim()) {
      const q = inviteSearchQuery.toLowerCase();
      filtered = filtered.filter(i => i.email.toLowerCase().includes(q));
    }

    const groups: Record<string, Invite[]> = {};
    for (const inv of filtered) {
      if (!groups[inv.email]) groups[inv.email] = [];
      groups[inv.email].push(inv);
    }
    return groups;
  }, [invites, inviteStatusFilter, inviteSearchQuery]);

  const pendingInvitesCount = invites.filter(i => i.status === 'pending').length;
  const sentInvitesCount = invites.filter(i => i.status === 'sent').length;
  const failedInvitesCount = invites.filter(i => i.status === 'failed').length;
  const acceptedInvitesCount = invites.filter(i => i.status === 'accepted').length;

  return (
    <motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
  className="stat-card"
>
  <Collapsible open={invitesOpen} onOpenChange={setInvitesOpen}>
    <div className="flex items-start gap-3">
      <CollapsibleTrigger asChild>
        <button className="flex-1 flex items-center justify-between text-right">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">سجل الدعوات</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              {pendingInvitesCount > 0 && (
                <Badge variant="outline" className="bg-warning/10 health-warning text-xs">
                  {pendingInvitesCount} معلّقة
                </Badge>
              )}
              {sentInvitesCount > 0 && (
                <Badge variant="outline" className="bg-primary/10 text-primary text-xs">
                  {sentInvitesCount} مرسلة
                </Badge>
              )}
              {failedInvitesCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive text-xs">
                  {failedInvitesCount} فاشلة
                </Badge>
              )}
              {acceptedInvitesCount > 0 && (
                <Badge variant="outline" className="bg-success/10 health-good text-xs">
                  {acceptedInvitesCount} مقبولة
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {invites.length} إجمالي
              </Badge>
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRefresh();
        }}
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
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالإيميل..."
            value={inviteSearchQuery}
            onChange={(e) => setInviteSearchQuery(e.target.value)}
            className="pr-9 h-8 text-sm"
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setInviteStatusFilter('all')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            الكل ({invites.length})
          </button>
          <button
            onClick={() => setInviteStatusFilter('pending')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'pending' ? 'bg-warning text-warning-foreground' : 'bg-warning/10 health-warning hover:opacity-80'}`}
          >
            معلّقة ({pendingInvitesCount})
          </button>
          <button
            onClick={() => setInviteStatusFilter('sent')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'sent' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:opacity-80'}`}
          >
            مرسلة ({sentInvitesCount})
          </button>
          <button
            onClick={() => setInviteStatusFilter('failed')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'failed' ? 'bg-destructive text-destructive-foreground' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}
          >
            فاشلة ({failedInvitesCount})
          </button>
          <button
            onClick={() => setInviteStatusFilter('accepted')}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors min-h-[32px] ${inviteStatusFilter === 'accepted' ? 'bg-success text-success-foreground' : 'bg-success/10 health-good hover:opacity-80'}`}
          >
            مقبولة ({acceptedInvitesCount})
          </button>
        </div>
      </div>

      {/* Grouped by email */}
      <div className="space-y-3">
        {Object.entries(groupedInvites).map(([email, emailInvites]) => (
          <div key={email} className="rounded-lg border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium" dir="ltr">{email}</span>
                <Badge variant="outline" className="text-xs">{emailInvites.length} دعوة</Badge>
              </div>
            </div>
            <div className="divide-y divide-border/30">
              {emailInvites.map((invite) => {
                const statusConf = inviteStatusConfig[invite.status] || inviteStatusConfig.pending;
                const StatusIcon = statusConf.icon;
                const delivery = deliveryStatus[`invite:${invite.id}`] || deliveryStatus[`email:${invite.email.toLowerCase()}`];
                const deliveryConf = delivery ? (deliveryStatusConfig[delivery.status] || deliveryStatusConfig.failed) : null;
                const DeliveryIcon = deliveryConf?.icon;
                return (
                  <div key={invite.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{roleLabels[invite.role]}</Badge>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusConf.className}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConf.label}
                        </span>
                        {deliveryConf && DeliveryIcon && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${deliveryConf.className}`}>
                            <DeliveryIcon className="w-3 h-3" />
                            {deliveryConf.label}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {scopeLabels[invite.scopeType]}: {scopeName(invite.scopeType, invite.scopeId)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(invite.createdAt)}
                        </span>
                      </div>
                      {delivery?.errorMessage && (
                        <p className="text-[11px] text-destructive mt-1 truncate">
                          سبب الفشل: {delivery.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {invite.status !== 'accepted' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          disabled={resendingInviteId === invite.id}
                          onClick={() => onResend(invite)}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${resendingInviteId === invite.id ? 'animate-spin' : ''}`} />
                          إعادة إرسال
                        </Button>
                      )}
                      {invite.status !== 'accepted' && (
                        <ConfirmDeleteDialog
                          title="حذف الدعوة"
                          description={`هل تريد حذف الدعوة المرسلة إلى ${invite.email}؟`}
                          onConfirm={() => onDelete(invite.id)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(groupedInvites).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد دعوات تطابق البحث</p>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
</motion.div>
  );
}
