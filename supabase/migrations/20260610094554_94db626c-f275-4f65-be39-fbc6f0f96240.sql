-- Make intent explicit: no client writes to system_audit_log.
-- All inserts happen via SECURITY DEFINER triggers, which bypass RLS.
DROP POLICY IF EXISTS "Deny direct inserts to system_audit_log" ON public.system_audit_log;
CREATE POLICY "Deny direct inserts to system_audit_log"
  ON public.system_audit_log
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct updates to system_audit_log" ON public.system_audit_log;
CREATE POLICY "Deny direct updates to system_audit_log"
  ON public.system_audit_log
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct deletes from system_audit_log" ON public.system_audit_log;
CREATE POLICY "Deny direct deletes from system_audit_log"
  ON public.system_audit_log
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);
