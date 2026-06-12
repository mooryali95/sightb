-- =============================================================
-- Harden EXECUTE permissions on all SECURITY DEFINER functions
-- Closes Supabase Linter warnings 0028 + 0029 (76 total)
-- =============================================================

-- Helper: revoke from PUBLIC + anon + authenticated everywhere first,
-- then re-grant only where needed.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- =============================================================
-- Re-grant EXECUTE to `authenticated` for app/RPC/RLS functions
-- =============================================================

-- RLS-policy helpers (called inside USING / WITH CHECK clauses)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_access(uuid, scope_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit(uuid, scope_type, uuid) TO authenticated;

-- Client-invoked RPC (UI: advance settlement)
GRANT EXECUTE ON FUNCTION public.split_settle_advance(
  uuid, numeric, numeric, text, uuid, uuid, text, text, text, integer, uuid, text
) TO authenticated;

-- =============================================================
-- Re-grant EXECUTE to `service_role` for edge-function-only RPCs
-- =============================================================
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

-- Service role also keeps full access to RLS helpers (already implicit via SUPERUSER bypass,
-- but make it explicit so edge functions calling them as service_role keep working).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_access(uuid, scope_type, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_edit(uuid, scope_type, uuid) TO service_role;

-- All other SECURITY DEFINER functions are trigger functions only.
-- They fire automatically as the table owner and do NOT need any role to hold
-- EXECUTE on them. Leaving them with no EXECUTE grants is correct.
