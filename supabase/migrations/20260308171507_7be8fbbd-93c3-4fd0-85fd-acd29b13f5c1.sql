
-- Step 1: Add owner to enum + fix has_access (doesn't reference 'owner')
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

-- Fix has_access: system-scope users of ANY role can read everything
CREATE OR REPLACE FUNCTION public.has_access(_user_id uuid, _scope_type scope_type, _scope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND (
      (user_roles.scope_type = 'system')
      OR (user_roles.scope_type = _scope_type AND user_roles.scope_id = _scope_id)
      OR (
        _scope_type = 'project'::scope_type AND user_roles.scope_type = 'company'::scope_type
        AND user_roles.scope_id IN (SELECT company_id FROM public.projects WHERE id = _scope_id)
      )
    )
  )
$$;
