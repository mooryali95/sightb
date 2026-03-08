
-- Step 2: Now update functions that reference 'owner' enum value
CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _scope_type scope_type, _scope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin', 'editor', 'owner')
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

-- has_role: owner inherits all other roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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
      role = _role
      OR (role = 'owner' AND _role IN ('admin', 'editor', 'viewer'))
    )
    AND scope_type = 'system'
  )
$$;

-- Protect owner role: admins cannot delete owner roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (
    -- Owners can do anything; admins cannot assign/remove owner role
    (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'owner' AND ur.scope_type = 'system'))
    OR (role != 'owner')
  );

-- Protect owner from deletion via delete-user: add RLS on profiles
-- Owner profiles cannot be deleted by non-owners
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = profiles.id AND ur.role = 'owner' AND ur.scope_type = 'system')
  );
