-- Lock down audit_log: prevent any client-side INSERT/UPDATE/DELETE.
-- Server-side triggers (SECURITY DEFINER functions audit_update/audit_delete) bypass RLS and continue to write rows.
CREATE POLICY "Deny client inserts on audit_log"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates on audit_log"
  ON public.audit_log
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny client deletes on audit_log"
  ON public.audit_log
  FOR DELETE
  TO authenticated
  USING (false);

-- Lock down trusted_devices INSERT/UPDATE: registration happens server-side only via the admin-otp edge function (service role).
-- Existing SELECT/DELETE policies (auth.uid() = user_id) remain so users can view and revoke their own devices.
CREATE POLICY "Deny client inserts on trusted_devices"
  ON public.trusted_devices
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates on trusted_devices"
  ON public.trusted_devices
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);