import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { roleLabels, scopeLabels, inviteStatusConfig, deliveryStatusConfig, formatDate, type Invite, type InviteDeliveryStatus } from './labels';

interface InviteRowProps {
  invite: Invite;
  delivery?: InviteDeliveryStatus;
  resending: boolean;
  onResend: (invite: Invite) => void;
  onDelete: (id: string) => void;
  scopeName: (scopeType: string, scopeId: string | null) => string;
}

/** One invite: its role, status, mail delivery, scope and date, with a resend and a delete unless accepted. */
export function InviteRow({ invite, delivery, resending, onResend, onDelete, scopeName }: InviteRowProps) {
  const statusConf = inviteStatusConfig[invite.status] || inviteStatusConfig.pending;
  const StatusIcon = statusConf.icon;
  const deliveryConf = delivery ? (deliveryStatusConfig[delivery.status] || deliveryStatusConfig.failed) : null;
  const DeliveryIcon = deliveryConf?.icon;
  const open = invite.status !== 'accepted';

  return (
    <div className="flex items-center justify-between px-3 py-2">
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
          <span className="text-xs text-muted-foreground">{formatDate(invite.createdAt)}</span>
        </div>
        {delivery?.errorMessage && (
          <p className="text-xs text-destructive mt-1 truncate">سبب الفشل: {delivery.errorMessage}</p>
        )}
      </div>
      {open && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" disabled={resending} onClick={() => onResend(invite)}>
            <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
            إعادة إرسال
          </Button>
          <ConfirmDeleteDialog
            title="حذف الدعوة"
            description={`هل تريد حذف الدعوة المرسلة إلى ${invite.email}؟`}
            onConfirm={() => onDelete(invite.id)}
          />
        </div>
      )}
    </div>
  );
}
