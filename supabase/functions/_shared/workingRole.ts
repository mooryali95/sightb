import { requireSecondFactor, type ServiceClient } from "./sessionGate.ts";

type Rows = PromiseLike<{ data: { role: string }[] | null; error: unknown }>;
interface RolesQuery { select(columns: string): { eq(column: string, value: unknown): Rows } }

/**
 * Paid features (the AI summary, receipt reading) are for the people who keep
 * the books: an owner, an admin or an editor whose session passed its second
 * factor. Before 5 November any signed-in account, a viewer included, could
 * call them and spend the workspace's AI credits. A 403 answer, or null to go on.
 */
export async function requireWorkingRole(
  supabase: ServiceClient,
  token: string,
  userId: string,
  cors: Record<string, string>,
): Promise<Response | null> {
  const refused = await requireSecondFactor(supabase, token, userId, cors);
  if (refused) return refused;
  const { data } = await (supabase.from("user_roles") as RolesQuery).select("role").eq("user_id", userId);
  if ((data ?? []).some((r) => ["owner", "admin", "editor"].includes(String(r.role)))) return null;
  return new Response(
    JSON.stringify({ error: "هذه الميزة لمن يحرّر البيانات: مالك أو مدير أو محرّر." }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
