
-- Table for OTP codes
CREATE TABLE public.admin_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;

-- Only the system (service role) manages OTP codes, no direct user access needed
-- But allow users to read their own codes for verification via edge function
CREATE POLICY "Users can view own otp codes" ON public.admin_otp_codes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Table for trusted devices (browser fingerprints)
CREATE TABLE public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trusted devices" ON public.trusted_devices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trusted devices" ON public.trusted_devices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trusted devices" ON public.trusted_devices
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
