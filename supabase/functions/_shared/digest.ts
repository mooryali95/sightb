/**
 * The morning digest's content, from digest_payload. Pure, so vitest checks it
 * (src/test/edge/digest.test.ts); the function only fetches, builds and sends.
 */
export interface DigestPayload {
  pending_expenses: { id: string; name: string; count: number; total: number }[];
  payment_requests: number;
  funds_unacknowledged: number;
  new_errors: number;
  error_occurrences: number;
}

export const APP_URL = "https://sightb.lovable.app";

const money = (n: number) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ر.س`;

const esc = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Whether anything waits; an empty morning sends nothing. */
export function hasNews(p: DigestPayload): boolean {
  return p.pending_expenses.length > 0 || p.payment_requests > 0 || p.funds_unacknowledged > 0 || p.new_errors > 0;
}

/** The lines of the digest, most money first, each linking to where it is acted on. */
export function digestLines(p: DigestPayload): { text: string; link: string }[] {
  const lines: { text: string; link: string }[] = [];
  for (const e of p.pending_expenses.slice(0, 10)) {
    lines.push({ text: `${e.name}: ${e.count} مصروف بانتظار الاعتماد بمجموع ${money(Number(e.total))}`, link: `${APP_URL}/project/${e.id}` });
  }
  if (p.pending_expenses.length > 10) {
    lines.push({ text: `و${p.pending_expenses.length - 10} مشاريع أخرى فيها مصروفات معلّقة`, link: `${APP_URL}/alerts` });
  }
  if (p.payment_requests > 0) lines.push({ text: `${p.payment_requests} طلب دفع بانتظار المراجعة`, link: `${APP_URL}/alerts` });
  if (p.funds_unacknowledged > 0) lines.push({ text: `${p.funds_unacknowledged} دفعة حُوّلت ولم يؤكَّد استلامها`, link: `${APP_URL}/alerts` });
  if (p.new_errors > 0) lines.push({ text: `${p.new_errors} عطل ظهر للمستخدمين خلال آخر 24 ساعة (${p.error_occurrences} مرة)`, link: `${APP_URL}/errors` });
  return lines;
}

export function digestSubject(p: DigestPayload): string {
  const pending = p.pending_expenses.reduce((s, e) => s + e.count, 0);
  return pending > 0 ? `رؤية: ${pending} مصروف بانتظار اعتمادك` : "رؤية: ملخص الصباح";
}

export function digestHtml(p: DigestPayload): string {
  const items = digestLines(p)
    .map((l) => `<li style="margin:0 0 10px"><a href="${esc(l.link)}" style="color:#1d4ed8;text-decoration:none">${esc(l.text)}</a></li>`)
    .join("");
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; color: #1a1a1a;">
      <h2 style="margin:0 0 4px">ملخص الصباح</h2>
      <p style="color:#666;margin:0 0 20px">ما ينتظرك في رؤية اليوم.</p>
      <ul style="padding-inline-start:20px;margin:0 0 24px;line-height:1.7">${items}</ul>
      <a href="${APP_URL}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">فتح النظام</a>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px;margin:0">يصلك هذا الملخص لأنك مالك أو مدير في النظام، ولا يُرسل في يوم لا ينتظرك فيه شيء.</p>
    </div>`;
}
