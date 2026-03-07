
-- 1. Add status column to companies (active/archived)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. Remove the hard delete policy for companies (replaced with archive)
DROP POLICY IF EXISTS "Owners can delete companies" ON public.companies;
