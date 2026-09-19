-- Passkeys (WebAuthn) as a second factor beside the emailed one-time code.
--
-- A passkey row is one credential registered by one user. The public key
-- and counter are what the server verifies an assertion against; the name
-- is the user's own label. Rows are written only by the `passkeys` edge
-- function through the service role: users may read and delete their own,
-- never insert or update, so a credential cannot be planted or altered
-- from the browser.
CREATE TABLE public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX passkeys_user_id_idx ON public.passkeys (user_id);

ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own passkeys" ON public.passkeys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own passkeys" ON public.passkeys
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- A challenge is minted per ceremony and consumed on verification, so an
-- assertion can never be replayed; anything older than its expiry is dead.
-- No policies on purpose: only the service role touches this table.
CREATE TABLE public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('registration', 'authentication')),
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkey_challenges_user_kind_idx ON public.passkey_challenges (user_id, kind, created_at DESC);

ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
