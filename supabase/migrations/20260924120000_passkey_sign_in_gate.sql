-- The gate in front of passkey sign-in (see supabase/functions/_shared/passkeyGate.ts).
--
-- A passkey signs in on its own, so adding one must take more than a
-- password. The emailed login code is asked by the login page after the
-- session already exists, so the server cannot tell a session that passed it.
-- Every registration is therefore preceded by a code sent to the account's
-- sign-in address, which grants one registration to that session.

-- 1. Which keys sign in on their own. Every key registered before this gate
--    stays a second factor only (false), whoever registered it; a key added
--    through the gate is true unless the authenticator said it could not
--    keep a discoverable credential.
ALTER TABLE public.passkeys ADD COLUMN can_sign_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.passkeys ADD COLUMN discoverable boolean;

-- 2. A sign-in challenge is marked used rather than deleted, so answering
--    one never refunds the per-address limit.
ALTER TABLE public.passkey_login_challenges ADD COLUMN used_at timestamptz;

-- 3. The emailed code, kept as a hash, and the grant a correct one leaves:
--    confirmed_at and session_id say which session may register one key,
--    consumed_at that it has. Service role only: row-level security on, no
--    policy.
CREATE TABLE public.passkey_step_up_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  wrong_attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  session_id uuid,
  confirmed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkey_step_up_codes_user_idx ON public.passkey_step_up_codes (user_id, created_at DESC);

ALTER TABLE public.passkey_step_up_codes ENABLE ROW LEVEL SECURITY;

-- 4. Checking a code is one call under a row lock: parallel guesses queue on
--    the newest live code instead of each reading the same count. A code
--    survives three wrong guesses; the fourth attempt spends it. Returns
--    'ok', 'wrong', 'spent' or 'none'. Only the service role may call it.
CREATE FUNCTION public.passkey_step_up_verify(p_user_id uuid, p_code_hash text, p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_hash text;
  v_wrong integer;
BEGIN
  SELECT id, code_hash, wrong_attempts INTO v_id, v_hash, v_wrong
    FROM public.passkey_step_up_codes
   WHERE user_id = p_user_id AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN 'none';
  END IF;
  IF v_wrong >= 3 THEN
    UPDATE public.passkey_step_up_codes SET used_at = now() WHERE id = v_id;
    RETURN 'spent';
  END IF;
  IF v_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE public.passkey_step_up_codes SET wrong_attempts = wrong_attempts + 1 WHERE id = v_id;
    RETURN 'wrong';
  END IF;
  UPDATE public.passkey_step_up_codes
     SET used_at = now(), confirmed_at = now(), session_id = p_session_id
   WHERE id = v_id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.passkey_step_up_verify(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.passkey_step_up_verify(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.passkey_step_up_verify(uuid, text, uuid) TO service_role;
