import type { Invite, InviteDeliveryStatus } from './labels';

export const INVITE_STATUSES = ['pending', 'sent', 'failed', 'accepted'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export type InviteCounts = Record<InviteStatus | 'all', number>;

/** How many invites sit in each status, and in all. */
export function countInvites(invites: Invite[]): InviteCounts {
  const counts: InviteCounts = { all: invites.length, pending: 0, sent: 0, failed: 0, accepted: 0 };
  for (const i of invites) {
    if (i.status in counts && i.status !== 'all') counts[i.status as InviteStatus] += 1;
  }
  return counts;
}

export interface InviteFilter {
  status: InviteStatus | 'all';
  query: string;
}

/** Invites narrowed by status and by the email typed, trimmed and case-folded. */
export function filterInvites(invites: Invite[], f: InviteFilter): Invite[] {
  let list = invites;
  if (f.status !== 'all') list = list.filter((i) => i.status === f.status);
  const q = f.query.trim().toLowerCase();
  if (q) list = list.filter((i) => i.email.toLowerCase().includes(q));
  return list;
}

/** Invites grouped under their email, in the order the emails first appear. */
export function groupByEmail(invites: Invite[]): [string, Invite[]][] {
  const groups = new Map<string, Invite[]>();
  for (const inv of invites) {
    const list = groups.get(inv.email);
    if (list) list.push(inv);
    else groups.set(inv.email, [inv]);
  }
  return Array.from(groups.entries());
}

/** The delivery recorded for the invite itself, else the latest for its email. */
export function deliveryFor(invite: Invite, deliveryStatus: Record<string, InviteDeliveryStatus>): InviteDeliveryStatus | undefined {
  return deliveryStatus[`invite:${invite.id}`] || deliveryStatus[`email:${invite.email.toLowerCase()}`];
}
