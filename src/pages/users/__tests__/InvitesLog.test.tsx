/**
 * Component tests for the invites log, written before it is split. The
 * page tests reach its resend; what is pinned here is the log itself: the
 * counts by status, the grouping by email, the delivery status shown by
 * invite before by email with its failure reason, the resend and delete
 * withheld from an accepted invite, the status chips, the search, the
 * empty message and the refresh.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Invite, InviteDeliveryStatus } from '../labels';
import { InvitesLog } from '../InvitesLog';

const invite = (over: Partial<Invite>): Invite => ({
  id: 'i', email: 'a@x.com', role: 'editor', scopeType: 'project', scopeId: 'p1', status: 'pending', createdAt: '2026-09-01T10:00:00Z', ...over,
});
const invites: Invite[] = [
  invite({ id: 'i1', email: 'ali@x.com', status: 'sent' }),
  invite({ id: 'i2', email: 'ali@x.com', status: 'failed', role: 'viewer', scopeType: 'company', scopeId: 'c1' }),
  invite({ id: 'i3', email: 'Sara@y.com', status: 'accepted', role: 'admin', scopeType: 'system', scopeId: null }),
  invite({ id: 'i4', email: 'omar@z.com', status: 'pending' }),
];
const delivery = (over: Partial<InviteDeliveryStatus>): InviteDeliveryStatus => ({ inviteId: null, email: '', status: 'sent', errorMessage: null, createdAt: '', ...over });
const deliveryStatus: Record<string, InviteDeliveryStatus> = {
  'invite:i2': delivery({ inviteId: 'i2', email: 'ali@x.com', status: 'dlq', errorMessage: 'صندوق ممتلئ' }),
  'email:ali@x.com': delivery({ email: 'ali@x.com', status: 'sent' }),
  'email:omar@z.com': delivery({ email: 'omar@z.com', status: 'pending' }),
};

const handlers = { onRefresh: vi.fn(), onResend: vi.fn(), onDelete: vi.fn() };
const scopeName = (t: string, id: string | null) => (t === 'system' ? '' : `${t}:${id}`);

function renderLog(over: Partial<React.ComponentProps<typeof InvitesLog>> = {}) {
  return render(
    <InvitesLog invites={invites} deliveryStatus={deliveryStatus} loading={false} resendingInviteId={null} scopeName={scopeName} {...handlers} {...over} />,
  );
}
const group = (email: string) => screen.getByText(email, { selector: 'span' }).closest('.rounded-lg') as HTMLElement;
const groups = () => screen.queryAllByText(/دعوة$/).map((b) => b.closest('.rounded-lg') as HTMLElement);
const chip = (label: RegExp) => screen.getByRole('button', { name: label });

describe('InvitesLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts the invites by status in the header and on the chips, and groups them by email', () => {
    renderLog();
    const header = screen.getByText('سجل الدعوات').closest('button') as HTMLElement;
    expect(header).toHaveTextContent('1 معلّقة');
    expect(header).toHaveTextContent('1 مرسلة');
    expect(header).toHaveTextContent('1 فاشلة');
    expect(header).toHaveTextContent('1 مقبولة');
    expect(header).toHaveTextContent('4 إجمالي');
    expect(chip(/^الكل/)).toHaveTextContent('الكل (4)');
    expect(chip(/^معلّقة/)).toHaveTextContent('معلّقة (1)');
    expect(groups()).toHaveLength(3);
    expect(group('ali@x.com')).toHaveTextContent('2 دعوة');
    expect(within(group('ali@x.com')).getByText('تم الإرسال')).toBeInTheDocument();
    expect(within(group('ali@x.com')).getByText('فشل الإرسال')).toBeInTheDocument();
    expect(within(group('ali@x.com')).getByText('شركة: company:c1')).toBeInTheDocument();
  });

  it('shows the delivery of an invite before that of its email, with the reason a mail failed', () => {
    renderLog();
    const ali = group('ali@x.com');
    expect(within(ali).getByText('البريد فشل نهائياً')).toBeInTheDocument();
    expect(within(ali).getByText('سبب الفشل: صندوق ممتلئ')).toBeInTheDocument();
    expect(within(ali).getByText('البريد أُرسل')).toBeInTheDocument();
    expect(within(group('omar@z.com')).getByText('البريد بانتظار الإرسال')).toBeInTheDocument();
    expect(within(group('Sara@y.com')).queryByText(/البريد/)).not.toBeInTheDocument();
  });

  it('offers a resend and a confirmed delete on anything not accepted, and neither on an accepted invite', () => {
    renderLog({ resendingInviteId: 'i1' });
    const ali = group('ali@x.com');
    const resends = within(ali).getAllByRole('button', { name: /إعادة إرسال/ });
    expect(resends).toHaveLength(2);
    expect(resends[0]).toBeDisabled();
    fireEvent.click(resends[1]);
    expect(handlers.onResend).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }));

    const sara = group('Sara@y.com');
    expect(within(sara).queryByRole('button', { name: /إعادة إرسال/ })).not.toBeInTheDocument();
    expect(within(sara).queryAllByRole('button')).toHaveLength(0);

    const omar = group('omar@z.com');
    const [, trash] = within(omar).getAllByRole('button');
    fireEvent.click(trash);
    expect(screen.getByText('هل تريد حذف الدعوة المرسلة إلى omar@z.com؟')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('i4');
  });

  it('narrows by a status chip and by the email typed, whatever its case or padding, and says when nothing matches', () => {
    renderLog();
    fireEvent.click(chip(/^فاشلة/));
    expect(groups()).toHaveLength(1);
    expect(group('ali@x.com')).toHaveTextContent('1 دعوة');
    fireEvent.click(chip(/^الكل/));
    expect(groups()).toHaveLength(3);

    const search = screen.getByPlaceholderText('بحث بالإيميل...');
    fireEvent.change(search, { target: { value: 'SARA' } });
    expect(groups()).toHaveLength(1);
    expect(group('Sara@y.com')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: ' omar ' } });
    expect(groups()).toHaveLength(1);
    expect(group('omar@z.com')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.getByText('لا توجد دعوات تطابق البحث')).toBeInTheDocument();
  });

  it('refreshes on its own button without toggling the panel, and folds the panel from the header', () => {
    renderLog({ loading: true });
    const refresh = screen.getByRole('button', { name: /تحديث/ });
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(handlers.onRefresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('بحث بالإيميل...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('سجل الدعوات'));
    expect(screen.queryByPlaceholderText('بحث بالإيميل...')).not.toBeInTheDocument();
  });
});
