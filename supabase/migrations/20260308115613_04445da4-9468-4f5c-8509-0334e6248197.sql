
-- Fix 1: Drop trusted_devices INSERT policy (MFA bypass)
DROP POLICY IF EXISTS "Users can insert own trusted devices" ON public.trusted_devices;

-- Fix 2: Drop admin_otp_codes SELECT policy (OTP code exposure)
DROP POLICY IF EXISTS "Users can view own otp codes" ON public.admin_otp_codes;

-- Fix 3: Add failed_attempts column for brute-force protection
ALTER TABLE public.admin_otp_codes ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
