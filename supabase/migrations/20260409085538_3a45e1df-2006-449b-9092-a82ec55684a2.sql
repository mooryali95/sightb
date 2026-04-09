CREATE OR REPLACE FUNCTION public.has_access(_user_id uuid, _scope_type scope_type, _scope_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND (
      -- System-level role grants access to everything
      (user_roles.scope_type = 'system')
      -- Direct match: same scope type and scope id
      OR (user_roles.scope_type = _scope_type AND user_roles.scope_id = _scope_id)
      -- Forward cascade: company role grants access to projects within that company
      OR (
        _scope_type = 'project'::scope_type AND user_roles.scope_type = 'company'::scope_type
        AND user_roles.scope_id IN (SELECT company_id FROM public.projects WHERE id = _scope_id)
      )
      -- Reverse cascade: project role grants READ access to the parent company
      OR (
        _scope_type = 'company'::scope_type AND user_roles.scope_type = 'project'::scope_type
        AND user_roles.scope_id IN (SELECT id FROM public.projects WHERE company_id = _scope_id)
      )
    )
  )
$$;