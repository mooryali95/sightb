/**
 * The second factor for edge functions that act for the signed-in user.
 *
 * Row-level security refuses data to a session that owes its second factor,
 * but a function running as the service role reads and writes past it: an
 * admin's password alone could otherwise invite, delete or read through such
 * a function. This asks the same rule as the database, second_factor_ok,
 * for the session the caller's token belongs to.
 *
 * Kept free of email and WebAuthn libraries so functions Lovable owns can
 * import it cheaply. scripts/second-factor-coverage.sh fails the build if one
 * of those functions loses the call.
 */
/**
 * Just what this needs of the service-role client. Any supabase-js client
 * fits; no library type is imported, so the app's type check and unit tests
 * read this file as well as Deno does.
 */
type Row = Record<string, unknown>;
type Answer<T> = { data: T; error: { code?: string; message?: string } | null };
interface Query extends PromiseLike<Answer<Row[] | null>> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): PromiseLike<Answer<Row | null>>;
}
export interface ServiceClient {
  from(table: string): unknown;
}
const table = (supabase: ServiceClient, name: string) => supabase.from(name) as Query;
import { sessionIdOf } from "./passkeyGate.ts";

/**
 * The database's own rule, second_factor_ok, asked for a session the
 * function holds: through while enforcement is off, for an account whose
 * roles need no second factor, or for a session recorded as having passed.
 * Anything it cannot read counts as not through.
 */
export async function sessionPassedSecondFactor(supabase: ServiceClient, userId: string, sessionId: string) {
  const { data: settings, error: settingsError } = await table(supabase, "second_factor_settings")
    .select("enforce").eq("id", 1).maybeSingle();
  if (settingsError) return isMissingRelation(settingsError);
  if (!settings?.enforce) return true;
  const { data: roles } = await table(supabase, "user_roles").select("role").eq("user_id", userId);
  if (!(roles ?? []).some((r) => ["owner", "admin", "editor"].includes(String(r.role)))) return true;
  if (!sessionId) return false;
  const { data } = await table(supabase, "session_second_factor").select("session_id")
    .eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/** Before its migration is applied, the settings table is simply not there: nothing is enforced yet. */
function isMissingRelation(error: { code?: string }) {
  return error.code === "PGRST205" || error.code === "42P01";
}

/**
 * A 403 answer for a session that owes its second factor, or null to go on.
 * Call it right after the caller's token is checked.
 */
export async function requireSecondFactor(
  supabase: ServiceClient,
  token: string,
  userId: string,
  cors: Record<string, string>,
): Promise<Response | null> {
  if (await sessionPassedSecondFactor(supabase, userId, sessionIdOf(token))) return null;
  return new Response(
    JSON.stringify({ error: "أكمل التحقق بخطوتين لهذه الجلسة أولاً.", needsSecondFactor: true }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
