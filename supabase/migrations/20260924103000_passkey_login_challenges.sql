-- Signing in with a passkey alone: challenges minted before anyone is signed in.
--
-- passkey_challenges belongs to a user (user_id NOT NULL); a sign-in with no
-- email typed has no user yet, so its challenge is held here and handed back
-- to the browser by id. `client` is the address that asked, for the rate
-- limit. Only the `passkeys` edge function touches the table, through the
-- service role: row-level security is on and no policy is granted, so
-- neither anon nor authenticated can read a challenge or plant one.
CREATE TABLE public.passkey_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  client text NOT NULL DEFAULT 'unknown',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX passkey_login_challenges_client_idx ON public.passkey_login_challenges (client, created_at DESC);
CREATE INDEX passkey_login_challenges_expires_idx ON public.passkey_login_challenges (expires_at);

ALTER TABLE public.passkey_login_challenges ENABLE ROW LEVEL SECURITY;
