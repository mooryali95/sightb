/** What the second-factor edge function answers a device check with. */
export interface OtpCheckData {
  rateLimited?: boolean;
  error?: string;
  noRoles?: boolean;
  requiresOtp?: boolean;
  sent?: boolean;
}

export interface OtpCheckResponse {
  data?: OtpCheckData | null;
  error?: unknown;
}

export type OtpDecision =
  | { kind: 'error' }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'no-roles' }
  | { kind: 'otp-sent' }
  | { kind: 'otp-failed' }
  | { kind: 'ok' };

/** Reads the device check into the one step the page takes next. */
export function readOtpCheck(res: OtpCheckResponse): OtpDecision {
  if (res.error) return { kind: 'error' };
  const d = res.data;
  if (d?.rateLimited) return { kind: 'rate-limited', message: d.error || 'تم تجاوز الحد الأقصى للمحاولات' };
  if (d?.error) return { kind: 'error' };
  if (d?.noRoles) return { kind: 'no-roles' };
  if (d?.requiresOtp === true) return d.sent === true ? { kind: 'otp-sent' } : { kind: 'otp-failed' };
  return d?.requiresOtp === false ? { kind: 'ok' } : { kind: 'error' };
}
